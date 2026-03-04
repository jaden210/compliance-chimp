#!/usr/bin/env python3
"""
Lead Scraper - Web UI
Run this to start the local web interface at http://localhost:5500

Syncs with Firebase: shows all scrape jobs (yours and other users'),
supports resume for interrupted local jobs, and stays in sync with
the Chimp dashboard.

Usage:
    cd ~/Desktop/lead_scraper
    source venv/bin/activate
    python app.py
"""

import asyncio
import json
import subprocess
import threading
import uuid
import webbrowser
from pathlib import Path
from datetime import datetime, timezone

from flask import Flask, render_template, request, jsonify, send_file, redirect

from scraper import ScrapeJob, FirebaseAPI, REGIONS, STATE_BOUNDS, PLACE_TYPES, EXCLUDED_PRIMARY_TYPES

app = Flask(__name__)

# In-memory registry of LOCAL running/resumable jobs
JOBS: dict[str, ScrapeJob] = {}
JOB_THREADS: dict[str, threading.Thread] = {}

# Cache of cloud jobs (refreshed on each poll)
CLOUD_JOBS_CACHE: list = []
CLOUD_JOBS_LOCK = threading.Lock()

# Settings persistence
SETTINGS_FILE = Path(__file__).parent / 'settings.json'
DATA_DIR = str(Path(__file__).parent / 'data')


def load_settings():
    if SETTINGS_FILE.exists():
        with open(SETTINGS_FILE, 'r') as f:
            return json.load(f)
    return {}


def save_settings(data):
    existing = load_settings()
    existing.update(data)
    with open(SETTINGS_FILE, 'w') as f:
        json.dump(existing, f, indent=2)


def _get_firebase_api() -> FirebaseAPI:
    settings = load_settings()
    return FirebaseAPI(settings.get('firebase_url', ''))


def _discover_and_register_resumable():
    """On startup, find interrupted jobs and register them (but don't run them)."""
    settings = load_settings()
    api_key = settings.get('api_key', '')
    firebase_url = settings.get('firebase_url', '')
    resumable = ScrapeJob.discover_resumable(DATA_DIR, api_key=api_key, firebase_url=firebase_url)
    for job in resumable:
        if job.local_id not in JOBS:
            JOBS[job.local_id] = job


def _build_local_job_map() -> dict:
    """Map firebase_job_id -> local_id for all local jobs that have a firebase ID."""
    fb_map = {}
    for local_id, job in JOBS.items():
        if job.firebase_job_id:
            fb_map[job.firebase_job_id] = local_id
    return fb_map


def _is_heartbeat_stale(heartbeat_str: str, threshold_seconds: int = 120) -> bool:
    """Check if a heartbeat timestamp string is older than threshold."""
    if not heartbeat_str:
        return True
    try:
        hb = datetime.fromisoformat(heartbeat_str.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        return (now - hb).total_seconds() > threshold_seconds
    except Exception:
        return True


# =========================================================================
#  Routes
# =========================================================================

@app.route('/')
def index():
    settings = load_settings()
    return render_template('index.html', settings=settings)


@app.route('/api/estimate')
def api_estimate():
    """Return estimated API cost for a region scan."""
    region_key = request.args.get('region', 'utah')
    result = ScrapeJob.estimate_scan_cost(region_key)
    result['cost_per_request'] = ScrapeJob.COST_PER_REQUEST
    return jsonify(result)


@app.route('/api/billing')
def api_billing():
    """Return current-month Google Places API usage and cost via Cloud Monitoring."""
    settings = load_settings()
    project_id = settings.get('gcp_project_id', '').strip()

    if not project_id:
        return jsonify({'error': 'no_project', 'message': 'Set your GCP Project ID in Settings to see billing.'})

    # Get a gcloud access token from the locally authenticated user.
    try:
        result = subprocess.run(
            ['gcloud', 'auth', 'print-access-token'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return jsonify({'error': 'no_auth', 'message': 'gcloud not authenticated. Run: gcloud auth login'})
        token = result.stdout.strip()
    except FileNotFoundError:
        return jsonify({'error': 'no_gcloud', 'message': 'gcloud CLI not found. Install the Google Cloud SDK.'})
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'timeout', 'message': 'gcloud timed out.'})

    # Query Cloud Monitoring for Places API request count this calendar month.
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    url = f'https://monitoring.googleapis.com/v3/projects/{project_id}/timeSeries'
    params = {
        # serviceruntime tracks all API Gateway request counts per service
        'filter': (
            'metric.type="serviceruntime.googleapis.com/api/request_count"'
            ' AND resource.labels.service="places.googleapis.com"'
        ),
        'interval.startTime': month_start.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'interval.endTime': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'aggregation.alignmentPeriod': '2678400s',   # 31 days — one bucket
        'aggregation.perSeriesAligner': 'ALIGN_SUM',
        'aggregation.crossSeriesReducer': 'REDUCE_SUM',
        'aggregation.groupByFields': 'resource.labels.service',
    }
    headers = {'Authorization': f'Bearer {token}'}

    try:
        import requests as req_lib
        r = req_lib.get(url, params=params, headers=headers, timeout=15)
    except Exception as e:
        return jsonify({'error': 'request_failed', 'message': str(e)})

    if r.status_code == 403:
        return jsonify({'error': 'permission', 'message': f'No Monitoring access for project {project_id}. Grant roles/monitoring.viewer to your gcloud account.'})
    if r.status_code != 200:
        return jsonify({'error': 'api_error', 'message': f'Monitoring API returned {r.status_code}: {r.text[:200]}'})

    data = r.json()
    total_requests = 0
    for ts in data.get('timeSeries', []):
        for point in ts.get('points', []):
            val = point.get('value', {})
            total_requests += int(val.get('int64Value', val.get('doubleValue', 0)))

    cost_per_req = ScrapeJob.COST_PER_REQUEST
    total_cost = round(total_requests * cost_per_req, 2)
    free_credit = 200.0
    remaining_free = max(0.0, round(free_credit - total_cost, 2))
    over_budget = total_cost > free_credit

    return jsonify({
        'month': now.strftime('%B %Y'),
        'total_requests': total_requests,
        'total_cost_usd': total_cost,
        'free_credit_usd': free_credit,
        'remaining_free_usd': remaining_free,
        'over_budget': over_budget,
        'project_id': project_id,
    })


@app.route('/api/niches')
def api_niches():
    """Return valid Google Places types grouped by category for the niche dropdown."""
    return jsonify(PLACE_TYPES)


@app.route('/api/regions')
def api_regions():
    """Return available regions for the dropdown."""
    regions = []
    for key, val in REGIONS.items():
        regions.append({'key': key, 'name': val['name']})
    states = sorted(STATE_BOUNDS.keys())
    return jsonify({'regions': regions, 'states': states})


@app.route('/api/settings', methods=['POST'])
def api_save_settings():
    """Save API key and Firebase URL."""
    data = request.json
    save_settings({
        'api_key': data.get('api_key', ''),
        'firebase_url': data.get('firebase_url', ''),
        'gcp_project_id': data.get('gcp_project_id', ''),
    })
    return jsonify({'success': True})


@app.route('/api/start', methods=['POST'])
def api_start():
    """Start a new scrape job."""
    data = request.json
    niche = data.get('niche', '').strip()
    niche_type = data.get('niche_type', '').strip()
    region_key = data.get('region', 'utah')
    api_key = data.get('api_key', '').strip()
    firebase_url = data.get('firebase_url', '').strip()

    if not niche:
        return jsonify({'error': 'Niche is required'}), 400
    if not api_key:
        return jsonify({'error': 'Google Places API key is required'}), 400

    # Save settings for next time
    save_settings({'api_key': api_key, 'firebase_url': firebase_url})

    # Determine region name
    if region_key in REGIONS:
        region_name = REGIONS[region_key]['name']
    else:
        region_name = region_key.title()

    job_id = str(uuid.uuid4())[:8]
    job = ScrapeJob(
        job_id=job_id,
        niche=niche,
        niche_type=niche_type,
        region=region_name,
        region_key=region_key,
        api_key=api_key,
        firebase_url=firebase_url,
        data_dir=DATA_DIR,
    )
    JOBS[job_id] = job

    def run_job():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(job.run())
        except Exception as e:
            job.log(f"Error: {e}")
            job.status = 'error'
        finally:
            loop.close()

    t = threading.Thread(target=run_job, daemon=True)
    JOB_THREADS[job_id] = t
    t.start()

    return jsonify({'success': True, 'jobId': job_id})


@app.route('/api/resume/<job_id>', methods=['POST'])
def api_resume(job_id):
    """Resume an interrupted scrape job."""
    job = JOBS.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404

    if not job.can_resume:
        return jsonify({'error': 'Job cannot be resumed'}), 400

    # Check if already running
    thread = JOB_THREADS.get(job_id)
    if thread and thread.is_alive():
        return jsonify({'error': 'Job is already running'}), 400

    # Update API key and firebase URL from current settings
    settings = load_settings()
    job.api_key = settings.get('api_key', job.api_key)
    job.fb = FirebaseAPI(settings.get('firebase_url', ''))
    job.should_stop = False

    def run_resume():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(job.resume())
        except Exception as e:
            job.log(f"Error: {e}")
            job.status = 'error'
        finally:
            loop.close()

    t = threading.Thread(target=run_resume, daemon=True)
    JOB_THREADS[job_id] = t
    t.start()

    return jsonify({'success': True, 'jobId': job_id})


@app.route('/api/expand/<job_id>', methods=['POST'])
def api_expand(job_id):
    """Expand the geographic region of an existing scrape job and resume it.

    Preserves all existing checkpoint data (scanned grid points, place IDs,
    scraped details, emails).  Only the new grid cells introduced by the
    larger region will be scanned.
    """
    job = JOBS.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404

    thread = JOB_THREADS.get(job_id)
    if thread and thread.is_alive():
        return jsonify({'error': 'Job is currently running'}), 400

    data = request.json or {}
    new_region_key = data.get('region_key', '').strip()
    if not new_region_key:
        return jsonify({'error': 'region_key is required'}), 400

    if new_region_key == job.region_key:
        return jsonify({'error': 'New region is the same as the current region'}), 400

    settings = load_settings()
    job.api_key = settings.get('api_key', job.api_key)
    job.fb = FirebaseAPI(settings.get('firebase_url', ''))
    job.should_stop = False

    if not job.expand_region(new_region_key):
        return jsonify({'error': f'Unknown region: {new_region_key}'}), 400

    def run_expanded():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(job.resume())
        except Exception as e:
            job.log(f"Error: {e}")
            job.status = 'error'
        finally:
            loop.close()

    t = threading.Thread(target=run_expanded, daemon=True)
    JOB_THREADS[job_id] = t
    t.start()

    return jsonify({'success': True, 'jobId': job_id, 'new_region': job.region})


@app.route('/api/rerun/<job_id>', methods=['POST'])
def api_rerun(job_id):
    """Re-run a completed or interrupted scrape job from scratch.

    Clears all local checkpoint data and resets the Firebase job doc
    (results wiped, progress zeroed). Contacts in outreach campaigns
    are NOT deleted -- the existing dedup logic prevents duplicates
    when results are synced back.
    """
    job = JOBS.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404

    # Don't re-run a job that's actively running
    thread = JOB_THREADS.get(job_id)
    if thread and thread.is_alive():
        return jsonify({'error': 'Job is currently running'}), 400

    # Refresh credentials from current settings
    settings = load_settings()
    job.api_key = settings.get('api_key', job.api_key)
    job.fb = FirebaseAPI(settings.get('firebase_url', ''))
    job.should_stop = False

    def run_rerun():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(job.clear_and_rerun())
        except Exception as e:
            job.log(f"Error: {e}")
            job.status = 'error'
        finally:
            loop.close()

    t = threading.Thread(target=run_rerun, daemon=True)
    JOB_THREADS[job_id] = t
    t.start()

    return jsonify({'success': True, 'jobId': job_id})


@app.route('/api/jobs')
def api_jobs():
    """
    Return merged view of local + cloud jobs.

    Local jobs (running on this machine) get real-time status, logs, and resume capability.
    Cloud-only jobs (from other users or previous sessions) show Firebase progress.
    If a job exists both locally and in the cloud, local state takes priority.
    """
    fb = _get_firebase_api()
    cloud_jobs = []
    if fb.enabled:
        try:
            cloud_jobs = fb.list_jobs()
        except Exception:
            pass

    # Update cache
    with CLOUD_JOBS_LOCK:
        CLOUD_JOBS_CACHE.clear()
        CLOUD_JOBS_CACHE.extend(cloud_jobs)

    # Build map of firebase_job_id -> local_id
    fb_to_local = _build_local_job_map()
    seen_firebase_ids = set()

    merged = []

    # 1. Add all local jobs first (they have real-time state)
    for local_id, job in JOBS.items():
        state = job.get_state()
        state['source'] = 'local'

        # If this local job has a firebase ID, enrich with cloud data
        if job.firebase_job_id:
            seen_firebase_ids.add(job.firebase_job_id)
            cloud_match = next((c for c in cloud_jobs if c.get('id') == job.firebase_job_id), None)
            if cloud_match:
                state['cloud_status'] = cloud_match.get('status', '')
                state['cloud_progress'] = cloud_match.get('progress', {})

        merged.append(state)

    # 2. Add cloud-only jobs (not running locally)
    for cj in cloud_jobs:
        fid = cj.get('id', '')
        if fid in seen_firebase_ids:
            continue  # Already covered by a local job

        # Determine if this cloud job is running or interrupted
        status = cj.get('status', '')
        running_statuses = {'scanning', 'scraping', 'emails', 'exporting'}
        is_stale = _is_heartbeat_stale(cj.get('lastHeartbeat'))
        effective_status = status
        if status in running_statuses and is_stale:
            effective_status = f'{status}_interrupted'

        merged.append({
            'id': fid,
            'niche': cj.get('niche', ''),
            'region': cj.get('region', ''),
            'status': effective_status,
            'progress': cj.get('progress', {}),
            'log': [],
            'csv_path': None,
            'csv_url': cj.get('csvUrl', ''),
            'can_resume': False,  # No local data for cloud-only jobs
            'resume_step': None,
            'firebase_job_id': fid,
            'source': 'cloud',
            'total_results': cj.get('totalResults', 0),
            'created_at': cj.get('createdAt', ''),
            'updated_at': cj.get('updatedAt', ''),
        })

    return jsonify(merged)


@app.route('/api/job/<job_id>')
def api_job(job_id):
    """Return single job state (local or cloud)."""
    # Check local first
    job = JOBS.get(job_id)
    if job:
        return jsonify(job.get_state())

    # Try cloud
    fb = _get_firebase_api()
    if fb.enabled:
        cloud_job = fb.get_job_state(job_id)
        if cloud_job:
            return jsonify({
                'id': cloud_job.get('id', job_id),
                'niche': cloud_job.get('niche', ''),
                'region': cloud_job.get('region', ''),
                'status': cloud_job.get('status', ''),
                'progress': cloud_job.get('progress', {}),
                'log': [],
                'csv_path': None,
                'csv_url': cloud_job.get('csvUrl', ''),
                'can_resume': False,
                'resume_step': None,
                'firebase_job_id': job_id,
                'source': 'cloud',
            })

    return jsonify({'error': 'Job not found'}), 404


@app.route('/api/stop/<job_id>', methods=['POST'])
def api_stop(job_id):
    """Stop a running job."""
    job = JOBS.get(job_id)
    if job:
        job.stop()
        return jsonify({'success': True})
    return jsonify({'error': 'Job not found'}), 404


@app.route('/download/<job_id>')
def download_csv(job_id):
    """Download the CSV for a job (local file or redirect to cloud URL)."""
    job = JOBS.get(job_id)
    if job and job.csv_file.exists():
        return send_file(job.csv_file, as_attachment=True,
                         download_name=job.csv_file.name)

    with CLOUD_JOBS_LOCK:
        cloud_match = next((c for c in CLOUD_JOBS_CACHE if c.get('id') == job_id), None)
    if cloud_match and cloud_match.get('csvUrl'):
        return redirect(cloud_match['csvUrl'])

    return 'CSV not available', 404


@app.route('/download-excluded/<job_id>')
def download_excluded_csv(job_id):
    """Download the excluded/filtered places CSV for a job."""
    job = JOBS.get(job_id)
    if job and job.excluded_csv_file.exists():
        return send_file(job.excluded_csv_file, as_attachment=True,
                         download_name=job.excluded_csv_file.name)
    return 'Excluded CSV not available', 404


# =========================================================================
#  Main
# =========================================================================

if __name__ == '__main__':
    # Discover interrupted jobs on startup
    _discover_and_register_resumable()
    resumable_count = sum(1 for j in JOBS.values() if j.can_resume)

    # Quick cloud check
    fb = _get_firebase_api()
    cloud_count = 0
    if fb.enabled:
        try:
            cloud_count = len(fb.list_jobs())
        except Exception:
            pass

    print("\n" + "=" * 50)
    print("  Lead Scraper UI")
    print("  http://localhost:5500")
    if resumable_count:
        print(f"  {resumable_count} interrupted job(s) can be resumed")
    if cloud_count:
        print(f"  {cloud_count} job(s) synced from cloud")
    print("=" * 50 + "\n")
    webbrowser.open('http://localhost:5500')
    app.run(debug=False, port=5500)
