// ============================================================
// ComplianceChimp — Lead Gen Dashboard Component
// src/app/dashboard/lead-gen-dashboard.ts
//
// Route: /dashboard (auth-gated — internal use only)
// Shows full pipeline: candidates by status, recent reports,
// outreach metrics, warm leads, and manual trigger controls.
// ============================================================

import {
  Component, inject, OnInit, signal, computed
} from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  orderBy,
  limit,
  where,
  updateDoc,
  doc,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { Candidate, Report, Outreach, CandidateStatus } from '../models';

type TabId = 'pipeline' | 'reports' | 'outreach' | 'warm_leads';

@Component({
  selector: 'app-lead-gen-dashboard',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe],
  template: `
    <div class="min-h-screen bg-gray-950 text-white">

      <!-- Top nav -->
      <header class="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-green-400 font-bold text-xl">ComplianceChimp</span>
          <span class="text-gray-600 text-sm">Lead Gen Dashboard</span>
        </div>
        <div class="flex items-center gap-3">
          <!-- Manual trigger buttons -->
          <button
            (click)="runProspectFinder()"
            [disabled]="prospectRunning()"
            class="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            {{ prospectRunning() ? 'Finding...' : '+ Find Prospects' }}
          </button>
          <button
            (click)="runDigest()"
            [disabled]="digestRunning()"
            class="text-sm bg-green-900 hover:bg-green-800 text-green-300 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            {{ digestRunning() ? 'Sending...' : 'Send Digest' }}
          </button>
        </div>
      </header>

      <div class="max-w-7xl mx-auto px-6 py-8">

        <!-- KPI cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          @for (kpi of kpiCards(); track kpi.label) {
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div class="text-2xl font-black" [class]="kpi.color">{{ kpi.value }}</div>
              <div class="text-xs text-gray-500 mt-1">{{ kpi.label }}</div>
            </div>
          }
        </div>

        <!-- Tab navigation -->
        <div class="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          @for (tab of tabs; track tab.id) {
            <button
              (click)="activeTab.set(tab.id)"
              class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              [class]="activeTab() === tab.id
                ? 'bg-green-600 text-white'
                : 'text-gray-400 hover:text-white'">
              {{ tab.label }}
              @if (tab.badge && tab.badge > 0) {
                <span class="ml-1.5 bg-green-900 text-green-400 text-xs px-1.5 py-0.5 rounded-full">
                  {{ tab.badge }}
                </span>
              }
            </button>
          }
        </div>

        <!-- Pipeline tab -->
        @if (activeTab() === 'pipeline') {
          <div>
            <!-- Funnel visual -->
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-8">
              @for (stage of pipelineStages(); track stage.status) {
                <div class="bg-gray-900 border rounded-xl p-4 text-center" [class]="stage.borderColor">
                  <div class="text-3xl font-black" [class]="stage.textColor">{{ stage.count }}</div>
                  <div class="text-xs text-gray-500 mt-1 capitalize">{{ stage.status.replace('_', ' ') }}</div>
                </div>
              }
            </div>

            <!-- Candidates table -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <h2 class="font-semibold">Recent Candidates</h2>
                <div class="flex gap-2">
                  @for (status of statusFilters; track status) {
                    <button
                      (click)="statusFilter.set(status)"
                      class="text-xs px-3 py-1 rounded-full transition-colors"
                      [class]="statusFilter() === status
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'">
                      {{ status === 'all' ? 'All' : status.replace('_', ' ') }}
                    </button>
                  }
                </div>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                      <th class="px-5 py-3 font-medium">Business</th>
                      <th class="px-5 py-3 font-medium">Industry</th>
                      <th class="px-5 py-3 font-medium">Fit</th>
                      <th class="px-5 py-3 font-medium">Status</th>
                      <th class="px-5 py-3 font-medium">Grade</th>
                      <th class="px-5 py-3 font-medium">Report</th>
                      <th class="px-5 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of filteredCandidates(); track c.id) {
                      <tr class="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                        <td class="px-5 py-3">
                          <div class="font-medium text-white">{{ c.businessName }}</div>
                          <div class="text-gray-500 text-xs">{{ c.city }}, {{ c.state }}</div>
                        </td>
                        <td class="px-5 py-3 text-gray-400 capitalize text-xs">
                          {{ c.industry.replace(/_/g, ' ') }}
                        </td>
                        <td class="px-5 py-3">
                          <div class="flex items-center gap-1">
                            <div class="w-16 bg-gray-800 rounded-full h-1.5">
                              <div
                                class="bg-green-500 h-1.5 rounded-full"
                                [style.width.%]="c.fitScore * 10">
                              </div>
                            </div>
                            <span class="text-xs text-gray-400">{{ c.fitScore }}/10</span>
                          </div>
                        </td>
                        <td class="px-5 py-3">
                          <span class="text-xs px-2 py-1 rounded-full font-medium" [class]="statusBadgeClass(c.status)">
                            {{ c.status.replace('_', ' ') }}
                          </span>
                        </td>
                        <td class="px-5 py-3">
                          @if (c.reportId) {
                            <span class="font-bold" [class]="gradeColor(getReport(c.reportId)?.grade)">
                              {{ getReport(c.reportId)?.grade ?? '—' }}
                            </span>
                          } @else {
                            <span class="text-gray-600">—</span>
                          }
                        </td>
                        <td class="px-5 py-3">
                          @if (c.reportUrl) {
                            <a [href]="c.reportUrl" target="_blank"
                               class="text-green-400 hover:text-green-300 text-xs underline">
                              View
                            </a>
                          } @else {
                            <span class="text-gray-600 text-xs">—</span>
                          }
                        </td>
                        <td class="px-5 py-3">
                          @if (c.status === 'audited' && !c.outreachId) {
                            <button
                              (click)="triggerOutreach(c.id!)"
                              class="text-xs bg-green-900 hover:bg-green-800 text-green-400 px-3 py-1 rounded-lg transition-colors">
                              Send Email
                            </button>
                          }
                          @if (c.status === 'new') {
                            <button
                              (click)="triggerAudit(c.id!)"
                              class="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1 rounded-lg transition-colors">
                              Audit Now
                            </button>
                          }
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="7" class="px-5 py-10 text-center text-gray-500">
                          No candidates found. Run the prospect finder to get started.
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        }

        <!-- Reports tab -->
        @if (activeTab() === 'reports') {
          <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-800">
              <h2 class="font-semibold">OSHA Reports Generated</h2>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                    <th class="px-5 py-3">Business</th>
                    <th class="px-5 py-3">Grade</th>
                    <th class="px-5 py-3">Fine Exposure</th>
                    <th class="px-5 py-3">Gaps</th>
                    <th class="px-5 py-3">Generated</th>
                    <th class="px-5 py-3">Link</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of reports(); track r.id) {
                    <tr class="border-b border-gray-800 hover:bg-gray-800/50">
                      <td class="px-5 py-3">
                        <div class="font-medium">{{ r.businessName }}</div>
                        <div class="text-gray-500 text-xs">{{ r.city }}, {{ r.state }}</div>
                      </td>
                      <td class="px-5 py-3">
                        <span class="text-2xl font-black" [class]="gradeColor(r.grade)">{{ r.grade }}</span>
                      </td>
                      <td class="px-5 py-3 text-red-400 font-semibold">
                        {{ r.totalFineExposure | currency:'USD':'symbol':'1.0-0' }}
                      </td>
                      <td class="px-5 py-3 text-gray-300">
                        {{ r.violations | missingCount }} / {{ r.violations.length }}
                      </td>
                      <td class="px-5 py-3 text-gray-500 text-xs">
                        {{ r.generatedAt | dateFormat }}
                      </td>
                      <td class="px-5 py-3">
                        <a [href]="r.reportUrl" target="_blank"
                           class="text-green-400 hover:text-green-300 text-xs underline">
                          View Report
                        </a>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6" class="px-5 py-10 text-center text-gray-500">No reports yet.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- Outreach tab -->
        @if (activeTab() === 'outreach') {
          <div class="space-y-4">
            <!-- Outreach metrics summary -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div class="text-2xl font-black text-white">{{ outreachStats().sent }}</div>
                <div class="text-xs text-gray-500 mt-1">Emails Sent</div>
              </div>
              <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div class="text-2xl font-black text-blue-400">{{ outreachStats().opened }}
                  <span class="text-sm font-normal text-gray-500">({{ outreachStats().openRate }}%)</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">Link Opened</div>
              </div>
              <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div class="text-2xl font-black text-green-400">{{ outreachStats().signups }}</div>
                <div class="text-xs text-gray-500 mt-1">Trial Signups</div>
              </div>
              <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div class="text-2xl font-black text-yellow-400">
                  {{ outreachStats().avgDaysToClick !== null ? outreachStats().avgDaysToClick + 'd' : '—' }}
                </div>
                <div class="text-xs text-gray-500 mt-1">Avg Days to Click</div>
              </div>
            </div>

            <!-- A/B test breakdown -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              @for (variant of abStats(); track variant.label) {
                <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div class="flex items-center justify-between mb-3">
                    <span class="font-semibold text-sm">{{ variant.label }}</span>
                    <span class="text-xs text-gray-500">{{ variant.sent }} sent</span>
                  </div>
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <span class="text-gray-400">Opens</span>
                      <span class="text-white">{{ variant.opens }} ({{ variant.openRate }}%)</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-400">Signups</span>
                      <span class="text-green-400 font-semibold">{{ variant.signups }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>

            <!-- Outreach log table -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div class="px-5 py-4 border-b border-gray-800">
                <h2 class="font-semibold">Outreach Log</h2>
              </div>
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                    <th class="px-5 py-3">Business</th>
                    <th class="px-5 py-3">Subject</th>
                    <th class="px-5 py-3">Sent</th>
                    <th class="px-5 py-3">Clicks</th>
                    <th class="px-5 py-3">Days→Click</th>
                    <th class="px-5 py-3">Signed Up</th>
                  </tr>
                </thead>
                <tbody>
                  @for (o of outreach(); track o.id) {
                    <tr class="border-b border-gray-800 hover:bg-gray-800/50">
                      <td class="px-5 py-3 font-medium">{{ o.businessName }}</td>
                      <td class="px-5 py-3 text-gray-400 text-xs max-w-48 truncate">{{ o.subjectLine }}</td>
                      <td class="px-5 py-3 text-gray-500 text-xs">{{ o.sentAt | dateFormat }}</td>
                      <td class="px-5 py-3">
                        <span [class]="o.clickCount > 0 ? 'text-green-400 font-semibold' : 'text-gray-600'">
                          {{ o.clickCount }}
                        </span>
                      </td>
                      <td class="px-5 py-3 text-gray-400 text-xs">
                        {{ o.daysToClick !== undefined ? o.daysToClick + 'd' : '—' }}
                      </td>
                      <td class="px-5 py-3">
                        @if (o.signedUp) {
                          <span class="text-xs bg-green-900 text-green-400 px-2 py-0.5 rounded-full font-semibold">Signed Up</span>
                        } @else {
                          <span class="text-gray-600 text-xs">—</span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6" class="px-5 py-10 text-center text-gray-500">No outreach sent yet.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- Warm leads tab -->
        @if (activeTab() === 'warm_leads') {
          <div>
            <p class="text-gray-400 text-sm mb-4">
              These businesses clicked their report link but haven't signed up yet. High-intent — worth a personal follow-up.
            </p>
            <div class="space-y-3">
              @for (c of warmLeads(); track c.id) {
                <div class="bg-gray-900 border border-yellow-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div class="flex-1">
                    <div class="font-semibold text-white">{{ c.businessName }}</div>
                    <div class="text-gray-400 text-sm">{{ c.city }}, {{ c.state }} · {{ c.industry.replace(/_/g, ' ') }}</div>
                    @if (c.contactEmail) {
                      <div class="text-gray-500 text-xs mt-1">{{ c.contactEmail }}</div>
                    }
                  </div>
                  <div class="flex items-center gap-3">
                    @if (c.reportUrl) {
                      <a [href]="c.reportUrl" target="_blank"
                         class="text-sm text-green-400 hover:text-green-300 underline">
                        View Their Report
                      </a>
                    }
                    <button
                      (click)="disqualify(c.id!)"
                      class="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                      Disqualify
                    </button>
                  </div>
                </div>
              } @empty {
                <div class="text-center py-16 text-gray-500">
                  <div class="text-4xl mb-3">🎯</div>
                  <p>No warm leads yet. Keep sending outreach!</p>
                </div>
              }
            </div>
          </div>
        }

      </div>
    </div>
  `,
  styles: [`:host { display: block; }`],
})
export class LeadGenDashboardComponent implements OnInit {
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  activeTab = signal<TabId>('pipeline');
  statusFilter = signal<string>('all');
  prospectRunning = signal(false);
  digestRunning = signal(false);

  statusFilters = ['all', 'new', 'audited', 'contacted', 'clicked', 'signed_up'];

  tabs = [
    { id: 'pipeline' as TabId, label: 'Pipeline', badge: 0 },
    { id: 'reports' as TabId, label: 'Reports', badge: 0 },
    { id: 'outreach' as TabId, label: 'Outreach', badge: 0 },
    { id: 'warm_leads' as TabId, label: 'Warm Leads', badge: 0 },
  ];

  // Firestore live queries
  private allCandidates = toSignal(
    collectionData(
      query(collection(this.firestore, 'candidates'), orderBy('dateAdded', 'desc'), limit(200)),
      { idField: 'id' }
    ) as any,
    { initialValue: [] as Candidate[] }
  );

  reports = toSignal(
    collectionData(
      query(collection(this.firestore, 'reports'), orderBy('generatedAt', 'desc'), limit(100)),
      { idField: 'id' }
    ) as any,
    { initialValue: [] as Report[] }
  );

  outreach = toSignal(
    collectionData(
      query(collection(this.firestore, 'outreach'), orderBy('sentAt', 'desc'), limit(100)),
      { idField: 'id' }
    ) as any,
    { initialValue: [] as Outreach[] }
  );

  // Computed
  filteredCandidates = computed(() => {
    const filter = this.statusFilter();
    const all = this.allCandidates() as Candidate[];
    return filter === 'all' ? all : all.filter(c => c.status === filter);
  });

  warmLeads = computed(() =>
    (this.allCandidates() as Candidate[]).filter(c => c.status === 'clicked')
  );

  kpiCards = computed(() => {
    const candidates = this.allCandidates() as Candidate[];
    const outreach = this.outreach() as Outreach[];
    const reports = this.reports() as Report[];
    return [
      { label: 'Total Candidates', value: candidates.length, color: 'text-white' },
      { label: 'Reports Generated', value: reports.length, color: 'text-purple-400' },
      { label: 'Emails Sent', value: outreach.length, color: 'text-blue-400' },
      { label: 'Link Opens', value: outreach.filter(o => o.clickCount > 0).length, color: 'text-yellow-400' },
      { label: 'Trial Signups', value: candidates.filter(c => c.status === 'signed_up').length, color: 'text-green-400' },
      {
        label: 'Conversion',
        value: outreach.length > 0
          ? Math.round((candidates.filter(c => c.status === 'signed_up').length / outreach.length) * 100) + '%'
          : '—',
        color: 'text-green-300'
      },
    ];
  });

  pipelineStages = computed(() => {
    const candidates = this.allCandidates() as Candidate[];
    const stages: { status: CandidateStatus; count: number; textColor: string; borderColor: string }[] = [
      { status: 'new', count: 0, textColor: 'text-gray-300', borderColor: 'border-gray-700' },
      { status: 'audited', count: 0, textColor: 'text-purple-400', borderColor: 'border-purple-800' },
      { status: 'contacted', count: 0, textColor: 'text-blue-400', borderColor: 'border-blue-800' },
      { status: 'clicked', count: 0, textColor: 'text-yellow-400', borderColor: 'border-yellow-800' },
      { status: 'signed_up', count: 0, textColor: 'text-green-400', borderColor: 'border-green-700' },
      { status: 'disqualified', count: 0, textColor: 'text-gray-600', borderColor: 'border-gray-800' },
    ];
    candidates.forEach(c => {
      const stage = stages.find(s => s.status === c.status);
      if (stage) stage.count++;
    });
    return stages;
  });

  outreachStats = computed(() => {
    const records = this.outreach() as Outreach[];
    const opened = records.filter(o => o.clickCount > 0).length;
    const signups = records.filter(o => o.signedUp).length;
    const clickTimes = records.filter(o => o.daysToClick !== undefined).map(o => o.daysToClick!);
    return {
      sent: records.length,
      opened,
      openRate: records.length > 0 ? Math.round((opened / records.length) * 100) : 0,
      signups,
      avgDaysToClick: clickTimes.length > 0
        ? Math.round(clickTimes.reduce((a, b) => a + b, 0) / clickTimes.length * 10) / 10
        : null,
    };
  });

  abStats = computed(() => {
    const records = this.outreach() as Outreach[];
    const variantA = records.filter(o => o.abVariant === 'A_score_hook');
    const variantB = records.filter(o => o.abVariant === 'B_gap_count_hook');
    return [
      {
        label: 'Variant A — Score Hook',
        sent: variantA.length,
        opens: variantA.filter(o => o.clickCount > 0).length,
        openRate: variantA.length > 0 ? Math.round((variantA.filter(o => o.clickCount > 0).length / variantA.length) * 100) : 0,
        signups: variantA.filter(o => o.signedUp).length,
      },
      {
        label: 'Variant B — Gap Count Hook',
        sent: variantB.length,
        opens: variantB.filter(o => o.clickCount > 0).length,
        openRate: variantB.length > 0 ? Math.round((variantB.filter(o => o.clickCount > 0).length / variantB.length) * 100) : 0,
        signups: variantB.filter(o => o.signedUp).length,
      },
    ];
  });

  ngOnInit(): void {
    // Update tab badges reactively
    const warmCount = this.warmLeads().length;
    this.tabs[3].badge = warmCount;
  }

  getReport(reportId: string): Report | undefined {
    return (this.reports() as Report[]).find(r => r.id === reportId);
  }

  statusBadgeClass(status: CandidateStatus): string {
    const map: Record<CandidateStatus, string> = {
      new:          'bg-gray-800 text-gray-400',
      audited:      'bg-purple-900 text-purple-300',
      contacted:    'bg-blue-900 text-blue-300',
      clicked:      'bg-yellow-900 text-yellow-300',
      signed_up:    'bg-green-900 text-green-300',
      disqualified: 'bg-gray-900 text-gray-600',
    };
    return map[status] || 'bg-gray-800 text-gray-400';
  }

  gradeColor(grade?: string): string {
    const map: Record<string, string> = {
      A: 'text-green-400', B: 'text-blue-400', C: 'text-yellow-400',
      D: 'text-orange-400', F: 'text-red-400',
    };
    return grade ? (map[grade] || 'text-gray-400') : 'text-gray-400';
  }

  async triggerAudit(candidateId: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'auditCandidateManual');
    await fn({ candidateId });
  }

  async triggerOutreach(candidateId: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'sendOutreachManual');
    await fn({ candidateId });
  }

  async runProspectFinder(): Promise<void> {
    this.prospectRunning.set(true);
    try {
      const fn = httpsCallable(this.functions, 'runProspectFinderManual');
      await fn({});
    } finally {
      this.prospectRunning.set(false);
    }
  }

  async runDigest(): Promise<void> {
    this.digestRunning.set(true);
    try {
      const fn = httpsCallable(this.functions, 'sendDailyDigest');
      await fn({});
    } finally {
      this.digestRunning.set(false);
    }
  }

  async disqualify(candidateId: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'candidates', candidateId), { status: 'disqualified' });
  }
}

// Pipe helpers (inline for simplicity)
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'missingCount', standalone: true })
export class MissingCountPipe implements PipeTransform {
  transform(violations: any[]): number {
    return violations?.filter((v: any) => v.status === 'likely_missing').length ?? 0;
  }
}

@Pipe({ name: 'dateFormat', standalone: true })
export class DateFormatPipe implements PipeTransform {
  transform(ts: any): string {
    if (!ts) return '—';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

@Pipe({ name: 'industryLabel', standalone: true })
export class IndustryLabelPipe implements PipeTransform {
  transform(industry: string): string {
    return industry?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '';
  }
}
