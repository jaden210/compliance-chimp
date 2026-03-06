import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { collection, collectionData, limit, orderBy, query, Firestore } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Candidate, CandidateStatus, Outreach, Report } from '../models';
import { DateFormatPipe, MissingCountPipe } from '../lead-gen.pipes';

type TabId = 'pipeline' | 'reports' | 'outreach' | 'warm_leads';

@Component({
  selector: 'app-lead-gen-dashboard',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, MissingCountPipe, DateFormatPipe],
  template: `
    <section class="lead-gen-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Internal</p>
          <h1>Lead Gen Dashboard</h1>
          <p class="subhead">Pipeline, report, and outreach visibility from the merged lead-gen branch.</p>
        </div>
        <div class="header-note">Manual actions from the imported branch are not wired yet.</div>
      </header>

      <div class="kpi-grid">
        @for (kpi of kpiCards(); track kpi.label) {
          <article class="card kpi-card">
            <div class="kpi-value">{{ kpi.value }}</div>
            <div class="kpi-label">{{ kpi.label }}</div>
          </article>
        }
      </div>

      <nav class="tab-row" aria-label="Lead dashboard sections">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            class="tab-btn"
            [class.active]="activeTab() === tab.id"
            (click)="activeTab.set(tab.id)"
          >
            {{ tab.label }}
            @if (tab.badge && tab.badge > 0) {
              <span class="tab-badge">{{ tab.badge }}</span>
            }
          </button>
        }
      </nav>

      @if (activeTab() === 'pipeline') {
        <section class="section-stack">
          <div class="stage-grid">
            @for (stage of pipelineStages(); track stage.status) {
              <article class="card stage-card">
                <div class="stage-count">{{ stage.count }}</div>
                <div class="stage-label">{{ stage.status.replace('_', ' ') }}</div>
              </article>
            }
          </div>

          <section class="card">
            <div class="card-header">
              <h2>Recent Candidates</h2>
              <div class="pill-row">
                @for (status of statusFilters; track status) {
                  <button
                    type="button"
                    class="pill-btn"
                    [class.active]="statusFilter() === status"
                    (click)="statusFilter.set(status)"
                  >
                    {{ status === 'all' ? 'All' : status.replace('_', ' ') }}
                  </button>
                }
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Industry</th>
                    <th>Fit</th>
                    <th>Status</th>
                    <th>Grade</th>
                    <th>Report</th>
                  </tr>
                </thead>
                <tbody>
                  @for (candidate of filteredCandidates(); track candidate.id) {
                    <tr>
                      <td>
                        <div class="primary-cell">{{ candidate.businessName }}</div>
                        <div class="secondary-cell">{{ candidate.city }}, {{ candidate.state }}</div>
                      </td>
                      <td>{{ formatIndustry(candidate.industry) }}</td>
                      <td>{{ candidate.fitScore }}/10</td>
                      <td>
                        <span class="status-pill">{{ candidate.status.replace('_', ' ') }}</span>
                      </td>
                      <td>{{ getReport(candidate.reportId)?.grade ?? '—' }}</td>
                      <td>
                        @if (candidate.reportUrl) {
                          <a [href]="candidate.reportUrl" target="_blank" rel="noreferrer">View</a>
                        } @else {
                          —
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6" class="empty-cell">No candidates found.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </section>
      }

      @if (activeTab() === 'reports') {
        <section class="card">
          <div class="card-header">
            <h2>OSHA Reports</h2>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Grade</th>
                  <th>Fine Exposure</th>
                  <th>Gaps</th>
                  <th>Generated</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                @for (report of reportsList(); track report.id) {
                  <tr>
                    <td>
                      <div class="primary-cell">{{ report.businessName }}</div>
                      <div class="secondary-cell">{{ report.city }}, {{ report.state }}</div>
                    </td>
                    <td>{{ report.grade }}</td>
                    <td>{{ report.totalFineExposure | currency:'USD':'symbol':'1.0-0' }}</td>
                    <td>{{ report.violations | missingCount }} / {{ report.violations.length }}</td>
                    <td>{{ report.generatedAt | dateFormat }}</td>
                    <td><a [href]="report.reportUrl" target="_blank" rel="noreferrer">View report</a></td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="empty-cell">No reports yet.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      @if (activeTab() === 'outreach') {
        <section class="section-stack">
          <div class="kpi-grid outreach-grid">
            <article class="card kpi-card">
              <div class="kpi-value">{{ outreachStats().sent }}</div>
              <div class="kpi-label">Emails Sent</div>
            </article>
            <article class="card kpi-card">
              <div class="kpi-value">{{ outreachStats().opened }}</div>
              <div class="kpi-label">Link Opens</div>
            </article>
            <article class="card kpi-card">
              <div class="kpi-value">{{ outreachStats().signups }}</div>
              <div class="kpi-label">Trial Signups</div>
            </article>
            <article class="card kpi-card">
              <div class="kpi-value">
                {{ outreachStats().avgDaysToClick !== null ? outreachStats().avgDaysToClick + 'd' : '—' }}
              </div>
              <div class="kpi-label">Avg Days To Click</div>
            </article>
          </div>

          <section class="card">
            <div class="card-header">
              <h2>Outreach Log</h2>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Subject</th>
                    <th>Sent</th>
                    <th>Clicks</th>
                    <th>Days To Click</th>
                    <th>Signed Up</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of outreachList(); track item.id) {
                    <tr>
                      <td>{{ item.businessName }}</td>
                      <td>{{ item.subjectLine }}</td>
                      <td>{{ item.sentAt | dateFormat }}</td>
                      <td>{{ item.clickCount }}</td>
                      <td>{{ item.daysToClick !== undefined ? item.daysToClick + 'd' : '—' }}</td>
                      <td>{{ item.signedUp ? 'Yes' : '—' }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6" class="empty-cell">No outreach sent yet.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </section>
      }

      @if (activeTab() === 'warm_leads') {
        <section class="section-stack">
          @for (candidate of warmLeads(); track candidate.id) {
            <article class="card warm-lead-card">
              <div>
                <div class="primary-cell">{{ candidate.businessName }}</div>
                <div class="secondary-cell">{{ candidate.city }}, {{ candidate.state }} · {{ formatIndustry(candidate.industry) }}</div>
                @if (candidate.contactEmail) {
                  <div class="secondary-cell">{{ candidate.contactEmail }}</div>
                }
              </div>
              @if (candidate.reportUrl) {
                <a [href]="candidate.reportUrl" target="_blank" rel="noreferrer">View their report</a>
              }
            </article>
          } @empty {
            <section class="card empty-state">No warm leads yet.</section>
          }
        </section>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .lead-gen-page { max-width: 1200px; margin: 0 auto; padding: 32px 20px 56px; color: #1f2937; }
    .page-header, .card-header, .warm-lead-card { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; }
    .eyebrow { margin: 0 0 6px; color: #054d8a; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
    h1, h2 { margin: 0; }
    .subhead, .header-note, .secondary-cell { color: #6b7280; }
    .header-note { max-width: 300px; font-size: 13px; }
    .section-stack { display: grid; gap: 20px; }
    .kpi-grid, .stage-grid { display: grid; gap: 16px; margin-top: 24px; }
    .kpi-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
    .stage-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 6px 18px rgba(5, 77, 138, 0.06); padding: 20px; }
    .kpi-card { text-align: center; }
    .kpi-value, .stage-count { font-size: 28px; font-weight: 800; color: #054d8a; }
    .kpi-label, .stage-label { margin-top: 6px; color: #6b7280; font-size: 13px; }
    .tab-row, .pill-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 24px 0; }
    .tab-btn, .pill-btn { border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 999px; padding: 10px 14px; cursor: pointer; font: inherit; }
    .tab-btn.active, .pill-btn.active { background: #054d8a; border-color: #054d8a; color: #fff; }
    .tab-badge { margin-left: 8px; background: #ff9100; color: #111827; border-radius: 999px; padding: 1px 8px; font-size: 12px; font-weight: 700; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 14px 12px; text-align: left; border-top: 1px solid #e5e7eb; vertical-align: top; }
    th { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; border-top: none; }
    .primary-cell { font-weight: 600; color: #111827; }
    .status-pill { display: inline-block; border-radius: 999px; padding: 4px 10px; background: #eff6ff; color: #054d8a; font-size: 12px; font-weight: 700; }
    a { color: #054d8a; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty-cell, .empty-state { text-align: center; color: #6b7280; }
    .outreach-grid { margin-top: 0; }
    .warm-lead-card { flex-wrap: wrap; }
    @media (max-width: 720px) {
      .page-header, .card-header, .warm-lead-card { flex-direction: column; }
      .lead-gen-page { padding: 24px 16px 40px; }
    }
  `],
})
export class LeadGenDashboardComponent {
  private readonly firestore = inject(Firestore);

  activeTab = signal<TabId>('pipeline');
  statusFilter = signal<string>('all');
  readonly statusFilters = ['all', 'new', 'audited', 'contacted', 'clicked', 'signed_up'];

  readonly tabs = [
    { id: 'pipeline' as TabId, label: 'Pipeline', badge: 0 },
    { id: 'reports' as TabId, label: 'Reports', badge: 0 },
    { id: 'outreach' as TabId, label: 'Outreach', badge: 0 },
    { id: 'warm_leads' as TabId, label: 'Warm Leads', badge: 0 },
  ];

  private readonly allCandidates = toSignal(
    collectionData(
      query(collection(this.firestore, 'candidates'), orderBy('dateAdded', 'desc'), limit(200)),
      { idField: 'id' }
    ) as Observable<Candidate[]>,
    { initialValue: [] }
  );

  readonly reports = toSignal(
    collectionData(
      query(collection(this.firestore, 'reports'), orderBy('generatedAt', 'desc'), limit(100)),
      { idField: 'id' }
    ) as Observable<Report[]>,
    { initialValue: [] }
  );

  readonly outreach = toSignal(
    collectionData(
      query(collection(this.firestore, 'outreach'), orderBy('sentAt', 'desc'), limit(100)),
      { idField: 'id' }
    ) as Observable<Outreach[]>,
    { initialValue: [] }
  );

  readonly candidateList = computed(() => this.allCandidates());
  readonly reportsList = computed(() => this.reports());
  readonly outreachList = computed(() => this.outreach());

  readonly filteredCandidates = computed(() => {
    const filter = this.statusFilter();
    const candidates = this.candidateList();
    return filter === 'all' ? candidates : candidates.filter(candidate => candidate.status === filter);
  });

  readonly warmLeads = computed(() => this.candidateList().filter(candidate => candidate.status === 'clicked'));

  readonly kpiCards = computed(() => {
    const candidates = this.candidateList();
    const outreach = this.outreachList();
    const reports = this.reportsList();
    return [
      { label: 'Total Candidates', value: candidates.length },
      { label: 'Reports Generated', value: reports.length },
      { label: 'Emails Sent', value: outreach.length },
      { label: 'Link Opens', value: outreach.filter(item => item.clickCount > 0).length },
      { label: 'Trial Signups', value: candidates.filter(candidate => candidate.status === 'signed_up').length },
      {
        label: 'Conversion',
        value: outreach.length > 0
          ? Math.round((candidates.filter(candidate => candidate.status === 'signed_up').length / outreach.length) * 100) + '%'
          : '—',
      },
    ];
  });

  readonly pipelineStages = computed(() => {
    const candidates = this.candidateList();
    const stages: { status: CandidateStatus; count: number }[] = [
      { status: 'new', count: 0 },
      { status: 'audited', count: 0 },
      { status: 'contacted', count: 0 },
      { status: 'clicked', count: 0 },
      { status: 'signed_up', count: 0 },
      { status: 'disqualified', count: 0 },
    ];
    candidates.forEach(candidate => {
      const stage = stages.find(item => item.status === candidate.status);
      if (stage) {
        stage.count++;
      }
    });
    this.tabs[3].badge = stages.find(item => item.status === 'clicked')?.count ?? 0;
    return stages;
  });

  readonly outreachStats = computed(() => {
    const records = this.outreachList();
    const opened = records.filter(record => record.clickCount > 0).length;
    const signups = records.filter(record => record.signedUp).length;
    const clickTimes = records.filter(record => record.daysToClick !== undefined).map(record => record.daysToClick!);
    return {
      sent: records.length,
      opened,
      signups,
      avgDaysToClick: clickTimes.length
        ? Math.round((clickTimes.reduce((total, current) => total + current, 0) / clickTimes.length) * 10) / 10
        : null,
    };
  });

  getReport(reportId?: string): Report | undefined {
    if (!reportId) {
      return undefined;
    }
    return this.reportsList().find(report => report.id === reportId);
  }

  formatIndustry(industry: string): string {
    return industry.replace(/_/g, ' ');
  }
}
