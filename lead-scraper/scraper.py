"""
Lead Scraper Engine - Core scraping logic.
Used by the Flask web UI (app.py). Can also be run standalone.

All progress is reported via HTTP POST to a Firebase Cloud Function,
so the Chimp app can show real-time status. No service account needed.

Supports resume: if the process is interrupted (laptop closed, crash, etc),
local checkpoint files allow picking up exactly where the job left off.
"""

import requests
import json
import time
import re
import random
import asyncio
import os
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

import pandas as pd
from tqdm import tqdm
from playwright.async_api import async_playwright

# =============================================================================
#  FIREBASE API (simple HTTP POST to Cloud Function)
# =============================================================================

# Default Firebase function URL - set after deploying
DEFAULT_FIREBASE_URL = os.environ.get('SCRAPER_API_URL', '')


class FirebaseAPI:
    """Thin wrapper that POSTs scraper updates to the Firebase Cloud Function."""

    def __init__(self, function_url: str = ''):
        self.url = function_url or DEFAULT_FIREBASE_URL
        self.enabled = bool(self.url)

    def _post(self, payload: dict) -> dict:
        if not self.enabled:
            return {}
        try:
            r = requests.post(self.url, json=payload, timeout=15)
            if r.status_code == 200:
                return r.json()
            else:
                print(f"  Firebase POST error: {r.status_code} {r.text[:100]}")
        except Exception as e:
            print(f"  Firebase POST error: {e}")
        return {}

    def create_job(self, niche: str, region: str) -> str | None:
        resp = self._post({
            'action': 'createJob',
            'data': {'niche': niche, 'region': region}
        })
        return resp.get('jobId')

    def update_job(self, job_id: str, status: str = None, progress: dict = None,
                   total_results: int = None, csv_url: str = None):
        if not job_id:
            return
        data = {}
        if status:
            data['status'] = status
        if progress:
            data['progress'] = progress
        if total_results is not None:
            data['totalResults'] = total_results
        if csv_url is not None:
            data['csvUrl'] = csv_url
        self._post({'action': 'updateJob', 'jobId': job_id, 'data': data})

    def upload_results(self, job_id: str, results: list):
        if not job_id:
            return
        self._post({'action': 'uploadResults', 'jobId': job_id, 'data': {'results': results}})

    def upload_csv(self, job_id: str, csv_content: str, file_name: str) -> str | None:
        if not job_id:
            return None
        resp = self._post({
            'action': 'uploadCsv',
            'jobId': job_id,
            'data': {'csv': csv_content, 'fileName': file_name}
        })
        return resp.get('csvUrl')

    def get_job_state(self, job_id: str) -> dict | None:
        """Fetch the current state of a job from Firebase."""
        if not job_id:
            return None
        resp = self._post({'action': 'getJobState', 'jobId': job_id})
        return resp.get('job') if resp.get('success') else None

    def list_jobs(self) -> list:
        """Fetch all scrape jobs from Firebase."""
        resp = self._post({'action': 'listJobs'})
        return resp.get('jobs', []) if resp.get('success') else []


# =============================================================================
#  STATE BOUNDING BOXES
# =============================================================================

REGIONS = {
    'us': {'name': 'United States (all)', 'min_lat': 24.5, 'max_lat': 49.0, 'min_lng': -125.0, 'max_lng': -66.0},
    'west': {'name': 'Western US', 'min_lat': 31.0, 'max_lat': 49.0, 'min_lng': -125.0, 'max_lng': -104.0},
    'midwest': {'name': 'Midwest US', 'min_lat': 36.0, 'max_lat': 49.0, 'min_lng': -104.0, 'max_lng': -80.5},
    'south': {'name': 'Southern US', 'min_lat': 24.5, 'max_lat': 37.0, 'min_lng': -106.0, 'max_lng': -75.0},
    'northeast': {'name': 'Northeast US', 'min_lat': 37.0, 'max_lat': 47.5, 'min_lng': -80.5, 'max_lng': -66.0},
    'utah': {'name': 'Utah', 'min_lat': 37.0, 'max_lat': 42.0, 'min_lng': -114.05, 'max_lng': -109.05},
}

STATE_BOUNDS = {
    'alabama': {'min_lat': 30.2, 'max_lat': 35.0, 'min_lng': -88.5, 'max_lng': -84.9},
    'alaska': {'min_lat': 51.2, 'max_lat': 71.4, 'min_lng': -179.1, 'max_lng': -129.9},
    'arizona': {'min_lat': 31.3, 'max_lat': 37.0, 'min_lng': -114.8, 'max_lng': -109.0},
    'arkansas': {'min_lat': 33.0, 'max_lat': 36.5, 'min_lng': -94.6, 'max_lng': -89.6},
    'california': {'min_lat': 32.5, 'max_lat': 42.0, 'min_lng': -124.4, 'max_lng': -114.1},
    'colorado': {'min_lat': 37.0, 'max_lat': 41.0, 'min_lng': -109.1, 'max_lng': -102.0},
    'connecticut': {'min_lat': 41.0, 'max_lat': 42.1, 'min_lng': -73.7, 'max_lng': -71.8},
    'delaware': {'min_lat': 38.5, 'max_lat': 39.8, 'min_lng': -75.8, 'max_lng': -75.0},
    'florida': {'min_lat': 24.5, 'max_lat': 31.0, 'min_lng': -87.6, 'max_lng': -80.0},
    'georgia': {'min_lat': 30.4, 'max_lat': 35.0, 'min_lng': -85.6, 'max_lng': -80.8},
    'hawaii': {'min_lat': 18.9, 'max_lat': 22.2, 'min_lng': -160.2, 'max_lng': -154.8},
    'idaho': {'min_lat': 42.0, 'max_lat': 49.0, 'min_lng': -117.2, 'max_lng': -111.0},
    'illinois': {'min_lat': 37.0, 'max_lat': 42.5, 'min_lng': -91.5, 'max_lng': -87.0},
    'indiana': {'min_lat': 37.8, 'max_lat': 41.8, 'min_lng': -88.1, 'max_lng': -84.8},
    'iowa': {'min_lat': 40.4, 'max_lat': 43.5, 'min_lng': -96.6, 'max_lng': -90.1},
    'kansas': {'min_lat': 37.0, 'max_lat': 40.0, 'min_lng': -102.1, 'max_lng': -94.6},
    'kentucky': {'min_lat': 36.5, 'max_lat': 39.1, 'min_lng': -89.6, 'max_lng': -81.9},
    'louisiana': {'min_lat': 29.0, 'max_lat': 33.0, 'min_lng': -94.0, 'max_lng': -89.0},
    'maine': {'min_lat': 43.1, 'max_lat': 47.5, 'min_lng': -71.1, 'max_lng': -66.9},
    'maryland': {'min_lat': 37.9, 'max_lat': 39.7, 'min_lng': -79.5, 'max_lng': -75.0},
    'massachusetts': {'min_lat': 41.2, 'max_lat': 42.9, 'min_lng': -73.5, 'max_lng': -69.9},
    'michigan': {'min_lat': 41.7, 'max_lat': 48.3, 'min_lng': -90.4, 'max_lng': -82.4},
    'minnesota': {'min_lat': 43.5, 'max_lat': 49.4, 'min_lng': -97.2, 'max_lng': -89.5},
    'mississippi': {'min_lat': 30.2, 'max_lat': 35.0, 'min_lng': -91.7, 'max_lng': -88.1},
    'missouri': {'min_lat': 36.0, 'max_lat': 40.6, 'min_lng': -95.8, 'max_lng': -89.1},
    'montana': {'min_lat': 44.4, 'max_lat': 49.0, 'min_lng': -116.0, 'max_lng': -104.0},
    'nebraska': {'min_lat': 40.0, 'max_lat': 43.0, 'min_lng': -104.1, 'max_lng': -95.3},
    'nevada': {'min_lat': 35.0, 'max_lat': 42.0, 'min_lng': -120.0, 'max_lng': -114.0},
    'new hampshire': {'min_lat': 42.7, 'max_lat': 45.3, 'min_lng': -72.6, 'max_lng': -70.7},
    'new jersey': {'min_lat': 38.9, 'max_lat': 41.4, 'min_lng': -75.6, 'max_lng': -73.9},
    'new mexico': {'min_lat': 31.3, 'max_lat': 37.0, 'min_lng': -109.1, 'max_lng': -103.0},
    'new york': {'min_lat': 40.5, 'max_lat': 45.0, 'min_lng': -79.8, 'max_lng': -71.9},
    'north carolina': {'min_lat': 33.8, 'max_lat': 36.6, 'min_lng': -84.3, 'max_lng': -75.5},
    'north dakota': {'min_lat': 45.9, 'max_lat': 49.0, 'min_lng': -104.0, 'max_lng': -96.6},
    'ohio': {'min_lat': 38.4, 'max_lat': 42.0, 'min_lng': -84.8, 'max_lng': -80.5},
    'oklahoma': {'min_lat': 33.6, 'max_lat': 37.0, 'min_lng': -103.0, 'max_lng': -94.4},
    'oregon': {'min_lat': 42.0, 'max_lat': 46.3, 'min_lng': -124.6, 'max_lng': -116.5},
    'pennsylvania': {'min_lat': 39.7, 'max_lat': 42.3, 'min_lng': -80.5, 'max_lng': -74.7},
    'rhode island': {'min_lat': 41.1, 'max_lat': 42.0, 'min_lng': -71.9, 'max_lng': -71.1},
    'south carolina': {'min_lat': 32.0, 'max_lat': 35.2, 'min_lng': -83.4, 'max_lng': -78.5},
    'south dakota': {'min_lat': 42.5, 'max_lat': 46.0, 'min_lng': -104.1, 'max_lng': -96.4},
    'tennessee': {'min_lat': 35.0, 'max_lat': 36.7, 'min_lng': -90.3, 'max_lng': -81.6},
    'texas': {'min_lat': 25.8, 'max_lat': 36.5, 'min_lng': -106.6, 'max_lng': -93.5},
    'utah': {'min_lat': 37.0, 'max_lat': 42.0, 'min_lng': -114.1, 'max_lng': -109.0},
    'vermont': {'min_lat': 42.7, 'max_lat': 45.0, 'min_lng': -73.4, 'max_lng': -71.5},
    'virginia': {'min_lat': 36.5, 'max_lat': 39.5, 'min_lng': -83.7, 'max_lng': -75.2},
    'washington': {'min_lat': 45.5, 'max_lat': 49.0, 'min_lng': -124.8, 'max_lng': -116.9},
    'west virginia': {'min_lat': 37.2, 'max_lat': 40.6, 'min_lng': -82.6, 'max_lng': -77.7},
    'wisconsin': {'min_lat': 42.5, 'max_lat': 47.1, 'min_lng': -92.9, 'max_lng': -86.8},
    'wyoming': {'min_lat': 41.0, 'max_lat': 45.0, 'min_lng': -111.1, 'max_lng': -104.1},
}


def get_state_bounds(state_name):
    key = state_name.lower().strip()
    if key in STATE_BOUNDS:
        return STATE_BOUNDS[key]
    for k, v in STATE_BOUNDS.items():
        if key in k or k in key:
            return v
    return None


def get_region_bounds(region_key):
    """Get bounds for a region key or state name."""
    if region_key in REGIONS:
        r = REGIONS[region_key]
        return {'min_lat': r['min_lat'], 'max_lat': r['max_lat'],
                'min_lng': r['min_lng'], 'max_lng': r['max_lng']}
    return get_state_bounds(region_key)


# =============================================================================
#  SCRAPE JOB CLASS
# =============================================================================

class ScrapeJob:
    """Manages a single scrape job with local file persistence + Firebase sync."""

    GRID_SPACING = 0.5
    SEARCH_RADIUS = 35000

    def __init__(self, job_id: str, niche: str, region: str, region_key: str,
                 api_key: str, firebase_url: str = '', data_dir: str = ''):

        self.local_id = job_id
        self.niche = niche
        self.region = region
        self.region_key = region_key
        self.api_key = api_key

        # Firebase integration
        self.fb = FirebaseAPI(firebase_url)
        self.firebase_job_id = None

        # Local data storage
        base = Path(data_dir) if data_dir else Path(__file__).parent / 'data'
        slug = re.sub(r'[^a-z0-9]+', '_', f"{niche}_{region}".lower()).strip('_')
        self.project_dir = base / slug
        self.project_dir.mkdir(parents=True, exist_ok=True)

        self.place_ids_file = self.project_dir / 'place_ids.json'
        self.progress_file = self.project_dir / 'progress.json'
        self.scraped_file = self.project_dir / 'scraped.json'
        self.emails_file = self.project_dir / 'emails.json'
        self.meta_file = self.project_dir / 'job_meta.json'
        self.csv_file = self.project_dir / f'{slug}.csv'

        # Runtime state
        self.status = 'created'
        self.should_stop = False
        self.log_lines = []
        self.progress = {
            'gridTotal': 0, 'gridScanned': 0, 'placesFound': 0,
            'placesScraped': 0, 'emailsScraped': 0, 'emailsFound': 0,
            'totalWithPhone': 0, 'totalWithEmail': 0, 'totalWithWebsite': 0,
        }

        # Load existing metadata if resuming
        self._load_meta()

    def _load_meta(self):
        """Load saved job metadata (firebase_job_id, last status, etc)."""
        meta = self._load_json(self.meta_file)
        if meta:
            self.firebase_job_id = meta.get('firebase_job_id')
            saved_status = meta.get('status', 'created')
            # Restore progress counters from saved meta
            if meta.get('progress'):
                self.progress.update(meta['progress'])
            # Determine the resume point based on what local data exists
            self.status = self._detect_resume_status(saved_status)

    def _save_meta(self):
        """Persist job metadata for resume across restarts."""
        self._save_json(self.meta_file, {
            'firebase_job_id': self.firebase_job_id,
            'local_id': self.local_id,
            'niche': self.niche,
            'region': self.region,
            'region_key': self.region_key,
            'status': self.status,
            'progress': dict(self.progress),
        })

    def _detect_resume_status(self, saved_status: str) -> str:
        """Figure out where to resume based on local checkpoint files."""
        has_place_ids = self.place_ids_file.exists() and len(self._load_json(self.place_ids_file) or []) > 0
        has_scraped = self.scraped_file.exists() and len(self._load_json(self.scraped_file) or {}) > 0
        has_emails = self.emails_file.exists() and len(self._load_json(self.emails_file) or {}) > 0

        # If the job completed, keep it complete
        if saved_status == 'complete':
            return 'complete'

        # Determine resume point from local data
        if has_emails and saved_status in ('emails_complete', 'exporting', 'complete'):
            return saved_status
        if has_scraped and saved_status in ('scrape_complete', 'emails', 'emails_complete'):
            return saved_status
        if has_place_ids and saved_status in ('scan_complete', 'scraping', 'scrape_complete'):
            return saved_status

        # Default: whatever was saved, but mark as interrupted if it was running
        if saved_status in ('scanning', 'scraping', 'emails', 'exporting'):
            return f'{saved_status}_interrupted'
        return saved_status

    @property
    def can_resume(self) -> bool:
        """Check if this job has local data that can be resumed."""
        if self.status == 'complete':
            return False
        if self.status == 'created':
            return False
        # Has some local checkpoint data
        return (self.place_ids_file.exists() or
                self.scraped_file.exists() or
                self.emails_file.exists())

    @property
    def resume_step(self) -> str:
        """Human-readable description of where the job will resume from."""
        has_emails = self.emails_file.exists() and len(self._load_json(self.emails_file) or {}) > 0
        has_scraped = self.scraped_file.exists() and len(self._load_json(self.scraped_file) or {}) > 0
        has_place_ids = self.place_ids_file.exists() and len(self._load_json(self.place_ids_file) or []) > 0

        progress_data = self._load_json(self.progress_file) or {}
        scanned_count = len(progress_data.get('scanned_points', []))
        place_count = len(self._load_json(self.place_ids_file) or [])
        scraped_count = len(self._load_json(self.scraped_file) or {}) if has_scraped else 0
        email_count = len(self._load_json(self.emails_file) or {}) if has_emails else 0

        if has_emails:
            return f"Resume from email scraping ({email_count} sites checked)"
        if has_scraped:
            return f"Resume from detail scraping ({scraped_count}/{place_count} places done)"
        if has_place_ids:
            return f"Resume from grid scanning ({scanned_count} cells scanned, {place_count} places found)"
        return "Start from beginning"

    def log(self, msg: str):
        self.log_lines.append(msg)
        if len(self.log_lines) > 500:
            self.log_lines = self.log_lines[-500:]
        print(msg)

    def stop(self):
        self.should_stop = True

    # -- Firebase sync --
    def _sync_firebase(self, status=None):
        if status:
            self.status = status
        self.fb.update_job(self.firebase_job_id, status=self.status, progress=self.progress)
        self._save_meta()

    # -- Local file helpers --
    def _load_json(self, path):
        if path.exists():
            with open(path, 'r') as f:
                return json.load(f)
        return None

    def _save_json(self, path, data):
        with open(path, 'w') as f:
            json.dump(data, f, indent=2 if len(str(data)) < 100000 else None)

    # -- Grid generation --
    def _generate_grid(self, bounds):
        points = []
        lat = bounds['min_lat']
        while lat <= bounds['max_lat']:
            lng = bounds['min_lng']
            while lng <= bounds['max_lng']:
                points.append((round(lat, 4), round(lng, 4)))
                lng += self.GRID_SPACING
            lat += self.GRID_SPACING
        return points

    # =========================================================================
    #  STEP 1: Collect Place IDs (FREE)
    # =========================================================================
    def _search_at_point(self, lat, lng):
        url = 'https://places.googleapis.com/v1/places:searchText'
        headers = {
            'X-Goog-Api-Key': self.api_key,
            'X-Goog-FieldMask': 'places.id,nextPageToken'
        }
        ids = set()
        page_token = None

        while True:
            payload = {
                'textQuery': self.niche,
                'locationBias': {'circle': {
                    'center': {'latitude': lat, 'longitude': lng},
                    'radius': float(self.SEARCH_RADIUS)
                }},
                'maxResultCount': 20,
                'languageCode': 'en',
            }
            if page_token:
                payload['pageToken'] = page_token
            try:
                r = requests.post(url, headers=headers, json=payload, timeout=30)
                if r.status_code == 200:
                    data = r.json()
                    for p in data.get('places', []):
                        pid = p.get('id')
                        if pid:
                            ids.add(pid)
                    page_token = data.get('nextPageToken')
                    if not page_token:
                        break
                    time.sleep(0.5)
                elif r.status_code == 429:
                    self.log("  Rate limited, waiting 30s...")
                    time.sleep(30)
                else:
                    self.log(f"  API error ({lat:.2f},{lng:.2f}): {r.status_code}")
                    break
            except Exception as e:
                self.log(f"  Error ({lat:.2f},{lng:.2f}): {e}")
                break
        return ids

    def step_scan(self):
        self.status = 'scanning'
        self.log("STEP 1: Scanning for businesses (FREE)...")

        bounds = get_region_bounds(self.region_key)
        if not bounds:
            self.log(f"Error: Unknown region '{self.region_key}'")
            return

        grid = self._generate_grid(bounds)
        progress_data = self._load_json(self.progress_file) or {'scanned_points': []}
        all_ids = set(self._load_json(self.place_ids_file) or [])
        scanned = set(tuple(p) for p in progress_data.get('scanned_points', []))
        remaining = [p for p in grid if p not in scanned]

        self.progress['gridTotal'] = len(grid)
        self.progress['gridScanned'] = len(scanned)
        self.progress['placesFound'] = len(all_ids)
        self._sync_firebase('scanning')

        if remaining:
            self.log(f"  Grid: {len(grid)} total, {len(remaining)} remaining, {len(all_ids)} IDs so far")
        else:
            self.log(f"  Grid scan already complete. {len(all_ids)} places found.")

        for lat, lng in remaining:
            if self.should_stop:
                self.log("Stopped by user.")
                break

            new_ids = self._search_at_point(lat, lng)
            all_ids.update(new_ids)
            scanned.add((lat, lng))

            progress_data['scanned_points'] = [list(p) for p in scanned]
            self._save_json(self.progress_file, progress_data)
            self._save_json(self.place_ids_file, list(all_ids))

            self.progress['gridScanned'] = len(scanned)
            self.progress['placesFound'] = len(all_ids)

            if len(scanned) % 5 == 0:
                self._sync_firebase()

            time.sleep(0.2)

        self._sync_firebase('scan_complete')
        self.log(f"  Found {len(all_ids)} unique places.")

    # =========================================================================
    #  STEP 2: Scrape Google Maps (FREE)
    # =========================================================================
    async def _scrape_place(self, page, place_id):
        url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            result = {'place_id': place_id, 'name': '', 'address': '',
                      'phone': '', 'website': '', 'google_maps_url': url}

            try:
                result['name'] = await page.locator('h1').first.inner_text(timeout=5000)
            except Exception:
                pass
            try:
                label = await page.locator('button[aria-label^="Address"]').first.get_attribute('aria-label', timeout=3000)
                if label:
                    m = re.search(r'Address:\s*(.+)', label)
                    if m:
                        result['address'] = m.group(1).strip()
            except Exception:
                pass
            try:
                label = await page.locator('button[aria-label^="Phone"]').first.get_attribute('aria-label', timeout=3000)
                if label:
                    m = re.search(r'Phone:\s*(.+)', label)
                    if m:
                        result['phone'] = m.group(1).strip()
            except Exception:
                pass
            if not result['phone']:
                try:
                    href = await page.locator('a[href^="tel:"]').first.get_attribute('href', timeout=2000)
                    if href:
                        result['phone'] = href.replace('tel:', '').strip()
                except Exception:
                    pass
            try:
                href = await page.locator('a[aria-label^="Website"]').first.get_attribute('href', timeout=3000)
                if href:
                    if '/url?q=' in href:
                        m2 = re.search(r'/url\?q=([^&]+)', href)
                        if m2:
                            href = unquote(m2.group(1))
                    result['website'] = href
            except Exception:
                pass
            return result
        except Exception as e:
            return {'place_id': place_id, 'error': str(e)[:200]}

    async def step_scrape(self):
        self.status = 'scraping'
        self.log("STEP 2: Scraping Google Maps details (FREE)...")

        all_ids = self._load_json(self.place_ids_file) or []
        scraped = self._load_json(self.scraped_file) or {}
        remaining = [pid for pid in all_ids if pid not in scraped]

        self.progress['placesFound'] = len(all_ids)
        self.progress['placesScraped'] = len([v for v in scraped.values() if 'error' not in v])
        self.progress['totalWithPhone'] = len([v for v in scraped.values() if v.get('phone')])
        self.progress['totalWithWebsite'] = len([v for v in scraped.values() if v.get('website')])
        self._sync_firebase('scraping')
        self.log(f"  {len(all_ids)} total, {len(scraped)} done, {len(remaining)} remaining")

        if not remaining:
            self.log("  All already scraped.")
            self._sync_firebase('scrape_complete')
            return

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            ctx = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await ctx.new_page()
            fails = 0

            for i, pid in enumerate(remaining):
                if self.should_stop:
                    self.log("Stopped by user.")
                    break

                result = await self._scrape_place(page, pid)
                scraped[pid] = result

                if 'error' in result:
                    fails += 1
                    if fails >= 10:
                        self.log("  Too many failures, stopping.")
                        break
                else:
                    fails = 0

                self._save_json(self.scraped_file, scraped)

                success = len([v for v in scraped.values() if 'error' not in v])
                self.progress['placesScraped'] = success
                self.progress['totalWithPhone'] = len([v for v in scraped.values() if v.get('phone')])
                self.progress['totalWithWebsite'] = len([v for v in scraped.values() if v.get('website')])

                if (i + 1) % 10 == 0:
                    self._sync_firebase()
                    self.log(f"  Scraped {success}...")

                await asyncio.sleep(random.uniform(2, 4))
                if (i + 1) % 25 == 0:
                    pause = random.uniform(15, 30)
                    self.log(f"  Pausing {pause:.0f}s...")
                    await asyncio.sleep(pause)

            await browser.close()

        self._sync_firebase('scrape_complete')
        self.log(f"  Scraping complete. {self.progress['placesScraped']} businesses.")

    # =========================================================================
    #  STEP 3: Scrape Emails (FREE)
    # =========================================================================
    EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', re.I)
    JUNK_DOMAINS = {'example.com', 'test.com', 'email.com', 'domain.com',
                    'sentry.io', 'wixpress.com', 'googleapis.com', 'google.com',
                    'gstatic.com', 'w3.org', 'schema.org', 'wordpress.org',
                    'wordpress.com', 'squarespace.com', 'godaddy.com'}

    def _extract_emails(self, text):
        raw = self.EMAIL_RE.findall(text)
        clean = set()
        for e in raw:
            e = e.strip().rstrip('.').lower()
            domain = e.split('@')[-1]
            if domain not in self.JUNK_DOMAINS and len(e) < 100:
                if not any(ext in e for ext in ['.png', '.jpg', '.gif', '.svg', '.woff', '.css', '.js']):
                    clean.add(e)
        return clean

    async def _scrape_emails_from_site(self, page, url):
        emails = set()
        if not url or not url.startswith('http'):
            return emails
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=15000)
            await asyncio.sleep(2)
            content = await page.content()
            emails.update(self._extract_emails(content))

            # mailto links
            try:
                ml = page.locator('a[href^="mailto:"]')
                for i in range(min(await ml.count(), 10)):
                    href = await ml.nth(i).get_attribute('href')
                    if href:
                        e = href.replace('mailto:', '').split('?')[0].strip().lower()
                        if e and e.split('@')[-1] not in self.JUNK_DOMAINS:
                            emails.add(e)
            except Exception:
                pass

            # Try contact page if nothing found
            if not emails:
                contact_hrefs = []
                try:
                    links = page.locator('a')
                    for i in range(min(await links.count(), 50)):
                        try:
                            text = (await links.nth(i).inner_text(timeout=1000)).lower()
                            href = await links.nth(i).get_attribute('href', timeout=1000)
                            if href and any(kw in text for kw in ['contact', 'reach us', 'get in touch']):
                                contact_hrefs.append(href)
                            elif href and any(kw in str(href).lower() for kw in ['contact', 'about']):
                                contact_hrefs.append(href)
                        except Exception:
                            continue
                except Exception:
                    pass

                for link in contact_hrefs[:2]:
                    try:
                        if not link.startswith('http'):
                            link = urljoin(url, link)
                        if urlparse(link).netloc == urlparse(url).netloc:
                            await page.goto(link, wait_until='domcontentloaded', timeout=15000)
                            await asyncio.sleep(2)
                            emails.update(self._extract_emails(await page.content()))
                            try:
                                ml2 = page.locator('a[href^="mailto:"]')
                                for i in range(min(await ml2.count(), 10)):
                                    href = await ml2.nth(i).get_attribute('href')
                                    if href:
                                        e = href.replace('mailto:', '').split('?')[0].strip().lower()
                                        if e and e.split('@')[-1] not in self.JUNK_DOMAINS:
                                            emails.add(e)
                            except Exception:
                                pass
                        if emails:
                            break
                    except Exception:
                        continue
        except Exception:
            pass
        return emails

    async def step_emails(self):
        self.status = 'emails'
        self.log("STEP 3: Finding emails from business websites (FREE)...")

        scraped = self._load_json(self.scraped_file) or {}
        email_data = self._load_json(self.emails_file) or {}

        to_scrape = [(pid, info.get('website', ''), info.get('name', ''))
                     for pid, info in scraped.items()
                     if 'error' not in info and info.get('website') and pid not in email_data]

        self.progress['emailsScraped'] = len(email_data)
        self.progress['emailsFound'] = len([v for v in email_data.values() if v])
        self._sync_firebase('emails')
        self.log(f"  {len(to_scrape)} websites to check ({len(email_data)} already done)")

        if not to_scrape:
            self.log("  All already checked.")
            self._sync_firebase('emails_complete')
            return

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            ctx = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await ctx.new_page()
            found = len([v for v in email_data.values() if v])

            for i, (pid, website, name) in enumerate(to_scrape):
                if self.should_stop:
                    self.log("Stopped by user.")
                    break

                emails = await self._scrape_emails_from_site(page, website)
                email_data[pid] = list(emails)
                if emails:
                    found += 1
                    self.log(f"  Email: {', '.join(emails)} ({name[:30]})")

                self._save_json(self.emails_file, email_data)
                self.progress['emailsScraped'] = len(email_data)
                self.progress['emailsFound'] = found

                if (i + 1) % 10 == 0:
                    self._sync_firebase()

                await asyncio.sleep(random.uniform(1, 3))
                if (i + 1) % 20 == 0:
                    await asyncio.sleep(random.uniform(10, 20))

            await browser.close()

        self._sync_firebase('emails_complete')
        self.log(f"  Found emails for {found} businesses.")

    # =========================================================================
    #  EXPORT
    # =========================================================================
    def step_export(self):
        self.log("STEP 4: Exporting results...")
        scraped = self._load_json(self.scraped_file) or {}
        email_data = self._load_json(self.emails_file) or {}

        results = []
        fb_results = []
        for pid, info in scraped.items():
            if 'error' in info:
                continue
            emails = email_data.get(pid, [])
            email_str = '; '.join(emails) if emails else ''
            results.append({
                'Business Name': info.get('name', ''),
                'Phone': info.get('phone', ''),
                'Email': email_str,
                'Website': info.get('website', ''),
                'Address': info.get('address', ''),
                'Google Maps': info.get('google_maps_url', ''),
            })
            fb_results.append({
                'name': info.get('name', ''),
                'phone': info.get('phone', ''),
                'email': email_str,
                'website': info.get('website', ''),
                'address': info.get('address', ''),
                'googleMapsUrl': info.get('google_maps_url', ''),
            })

        if not results:
            self.log("  No results to export.")
            return

        df = pd.DataFrame(results).sort_values('Business Name')
        df = df[df['Business Name'].str.len() > 0]
        df.to_csv(self.csv_file, index=False)

        with_phone = df[df['Phone'].str.len() > 0].shape[0]
        with_email = df[df['Email'].str.len() > 0].shape[0]
        with_website = df[df['Website'].str.len() > 0].shape[0]

        self.progress['totalWithPhone'] = with_phone
        self.progress['totalWithEmail'] = with_email
        self.progress['totalWithWebsite'] = with_website

        self.log(f"  {len(df)} businesses, {with_phone} phones, {with_email} emails")
        self.log(f"  CSV saved: {self.csv_file}")

        # Upload to Firebase
        if self.fb.enabled and self.firebase_job_id:
            self.fb.upload_results(self.firebase_job_id, fb_results)
            csv_content = self.csv_file.read_text()
            csv_url = self.fb.upload_csv(self.firebase_job_id, csv_content, self.csv_file.name)
            self.fb.update_job(self.firebase_job_id, status='complete',
                              progress=self.progress, total_results=len(df),
                              csv_url=csv_url or '')
            if csv_url:
                self.log(f"  Uploaded to Firebase: {csv_url}")

        self.status = 'complete'
        self._save_meta()
        self.log("Done!")

    # =========================================================================
    #  RUN FULL PIPELINE (new job)
    # =========================================================================
    async def run(self):
        # Create Firebase job
        self.firebase_job_id = self.fb.create_job(self.niche, self.region)
        if self.firebase_job_id:
            self.log(f"Firebase job: {self.firebase_job_id}")
        self._save_meta()

        self.step_scan()
        if self.should_stop:
            return
        await self.step_scrape()
        if self.should_stop:
            return
        await self.step_emails()
        if self.should_stop:
            return
        self.step_export()

    # =========================================================================
    #  RESUME PIPELINE (pick up from where we left off)
    # =========================================================================
    async def resume(self):
        """Resume a previously interrupted job from the last checkpoint."""
        if not self.firebase_job_id:
            # No firebase job exists, create one now
            self.firebase_job_id = self.fb.create_job(self.niche, self.region)
            if self.firebase_job_id:
                self.log(f"Created new Firebase job: {self.firebase_job_id}")
            self._save_meta()

        self.log(f"Resuming job: {self.niche} in {self.region}")

        # Determine which step to resume from based on local checkpoint data
        has_place_ids = self.place_ids_file.exists() and len(self._load_json(self.place_ids_file) or []) > 0
        has_scraped = self.scraped_file.exists() and len(self._load_json(self.scraped_file) or {}) > 0
        has_emails = self.emails_file.exists() and len(self._load_json(self.emails_file) or {}) > 0

        # Check what's left to do
        all_ids = self._load_json(self.place_ids_file) or []
        scraped = self._load_json(self.scraped_file) or {}
        email_data = self._load_json(self.emails_file) or {}

        scrape_remaining = [pid for pid in all_ids if pid not in scraped] if has_place_ids else []
        email_targets = [(pid, info.get('website', ''))
                         for pid, info in scraped.items()
                         if 'error' not in info and info.get('website') and pid not in email_data] if has_scraped else []

        # Smart resume: skip completed steps
        if has_emails and not email_targets:
            # Emails done, just need to export
            self.log("  All steps complete. Running export...")
            self.step_export()
            return

        if has_scraped and not scrape_remaining and not email_targets:
            # Scraping done, emails not started or done, then export
            self.log("  Scraping complete. Running emails + export...")
            await self.step_emails()
            if self.should_stop:
                return
            self.step_export()
            return

        if has_scraped and not scrape_remaining:
            # Scraping done, resume emails
            self.log("  Scraping complete. Resuming email step...")
            await self.step_emails()
            if self.should_stop:
                return
            self.step_export()
            return

        if has_place_ids and not scrape_remaining:
            # Scan done, scraping not started
            self.log("  Scan complete. Starting scraping...")
            await self.step_scrape()
            if self.should_stop:
                return
            await self.step_emails()
            if self.should_stop:
                return
            self.step_export()
            return

        if has_place_ids and scrape_remaining:
            # Scan done, scraping partially done
            self.log(f"  Resuming scraping ({len(scrape_remaining)} remaining)...")
            await self.step_scrape()
            if self.should_stop:
                return
            await self.step_emails()
            if self.should_stop:
                return
            self.step_export()
            return

        # Default: scan may be partially done or not started
        self.log("  Resuming from scan step...")
        self.step_scan()
        if self.should_stop:
            return
        await self.step_scrape()
        if self.should_stop:
            return
        await self.step_emails()
        if self.should_stop:
            return
        self.step_export()

    def get_state(self) -> dict:
        """Return current job state for the UI."""
        return {
            'id': self.local_id,
            'niche': self.niche,
            'region': self.region,
            'status': self.status,
            'progress': dict(self.progress),
            'log': self.log_lines[-50:],
            'csv_path': str(self.csv_file) if self.csv_file.exists() else None,
            'can_resume': self.can_resume,
            'resume_step': self.resume_step if self.can_resume else None,
            'firebase_job_id': self.firebase_job_id,
        }

    # =========================================================================
    #  CLASS METHOD: Discover resumable jobs from local data directory
    # =========================================================================
    @staticmethod
    def discover_resumable(data_dir: str, api_key: str = '', firebase_url: str = '') -> list:
        """Scan data directory for jobs that can be resumed."""
        base = Path(data_dir)
        if not base.exists():
            return []

        resumable = []
        for project_dir in sorted(base.iterdir()):
            if not project_dir.is_dir():
                continue
            meta_file = project_dir / 'job_meta.json'
            if not meta_file.exists():
                continue
            try:
                with open(meta_file, 'r') as f:
                    meta = json.load(f)
                # Skip completed jobs
                if meta.get('status') == 'complete':
                    continue
                # Create a ScrapeJob to check if it's resumable
                job = ScrapeJob(
                    job_id=meta.get('local_id', project_dir.name),
                    niche=meta.get('niche', ''),
                    region=meta.get('region', ''),
                    region_key=meta.get('region_key', ''),
                    api_key=api_key,
                    firebase_url=firebase_url,
                    data_dir=data_dir,
                )
                if job.can_resume:
                    resumable.append(job)
            except Exception:
                continue
        return resumable
