// ============================================================
// ComplianceChimp — Public OSHA Report Page Component
// src/app/report/report-page.ts
//
// Route: /report/:token
// Public page — no auth required.
// Fetches report from Firestore by token, renders the full
// compliance gap analysis with grade, violations, fine exposure,
// and a prominent CTA to start a ComplianceChimp trial.
//
// Fires engagement tracking events to the Cloud Function:
//   - page_view on load
//   - cta_click on button click
// ============================================================

import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { Report, OshaViolation, ComplianceGrade } from '../models';

@Component({
  selector: 'app-report-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe],
  template: `
    <!-- Loading state -->
    @if (loading()) {
      <div class="min-h-screen bg-gray-950 flex items-center justify-center">
        <div class="text-center">
          <div class="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p class="text-gray-400">Loading your compliance report...</p>
        </div>
      </div>
    }

    <!-- Not found state -->
    @else if (!report() && !loading()) {
      <div class="min-h-screen bg-gray-950 flex items-center justify-center">
        <div class="text-center max-w-md px-4">
          <div class="text-6xl mb-4">🔍</div>
          <h1 class="text-2xl font-bold text-white mb-2">Report not found</h1>
          <p class="text-gray-400 mb-6">This compliance report may have expired or the link may be incorrect.</p>
          <a href="https://compliancechimp.com" class="inline-block bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors">
            Learn about ComplianceChimp
          </a>
        </div>
      </div>
    }

    <!-- Report page -->
    @else if (report()) {
      <div class="min-h-screen bg-gray-950 text-white">

        <!-- Header bar -->
        <header class="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-green-400 font-bold text-lg">ComplianceChimp</span>
            <span class="text-gray-600 text-sm">OSHA Compliance Report</span>
          </div>
          <a
            href="https://compliancechimp.com/signup"
            (click)="trackCta()"
            class="bg-green-500 hover:bg-green-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            Start Free Trial
          </a>
        </header>

        <div class="max-w-3xl mx-auto px-4 py-10 space-y-8">

          <!-- Business identity + grade hero -->
          <div class="bg-gray-900 rounded-2xl p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div class="flex-1">
              <p class="text-green-400 text-sm font-semibold uppercase tracking-wider mb-1">OSHA Compliance Report</p>
              <h1 class="text-3xl font-bold text-white mb-1">{{ report()!.businessName }}</h1>
              <p class="text-gray-400">{{ report()!.city }}, {{ report()!.state }} · {{ report()!.industry | industryLabel }}</p>
              <p class="text-gray-500 text-xs mt-2">Generated {{ report()!.generatedAt | dateFormat }}</p>
            </div>
            <!-- Grade badge -->
            <div class="shrink-0 text-center">
              <div
                class="w-24 h-24 rounded-2xl flex items-center justify-center text-5xl font-black border-4"
                [class]="gradeStyles()[report()!.grade]">
                {{ report()!.grade }}
              </div>
              <p class="text-gray-400 text-sm mt-2">Compliance Grade</p>
            </div>
          </div>

          <!-- Fine exposure summary -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-red-950 border border-red-800 rounded-xl p-5 text-center">
              <p class="text-red-400 text-xs font-semibold uppercase tracking-wider mb-1">Estimated Fine Exposure</p>
              <p class="text-3xl font-black text-red-300">{{ report()!.totalFineExposure | currency:'USD':'symbol':'1.0-0' }}</p>
              <p class="text-red-500 text-xs mt-1">if OSHA walked in today</p>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
              <p class="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Gaps Found</p>
              <p class="text-3xl font-black text-white">{{ missingCount() }}</p>
              <p class="text-gray-500 text-xs mt-1">likely non-compliant areas</p>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
              <p class="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Industry Avg Fine</p>
              <p class="text-3xl font-black text-yellow-400">{{ report()!.industryAvgFine | currency:'USD':'symbol':'1.0-0' }}</p>
              <p class="text-gray-500 text-xs mt-1">per OSHA inspection</p>
            </div>
          </div>

          <!-- Industry context -->
          @if (report()!.industryFineContext) {
            <div class="bg-yellow-950 border border-yellow-800 rounded-xl px-5 py-4 flex gap-3">
              <span class="text-yellow-400 text-xl shrink-0">⚠️</span>
              <p class="text-yellow-200 text-sm">{{ report()!.industryFineContext }}</p>
            </div>
          }

          <!-- Violations checklist -->
          <div>
            <h2 class="text-xl font-bold text-white mb-4">OSHA Standards Review</h2>
            <div class="space-y-3">
              @for (violation of report()!.violations; track violation.cfr) {
                <div
                  class="bg-gray-900 border rounded-xl p-5"
                  [class]="violationBorderClass(violation)">
                  <div class="flex items-start gap-3">
                    <!-- Status icon -->
                    <div
                      class="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm mt-0.5"
                      [class]="statusIconClass(violation)">
                      {{ statusIcon(violation) }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex flex-wrap items-center gap-2 mb-1">
                        <span class="font-semibold text-white">{{ violation.title }}</span>
                        <span class="text-xs text-gray-500 font-mono">{{ violation.cfr }}</span>
                        @if (violation.status === 'likely_missing') {
                          <span class="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full font-semibold">
                            {{ violation.fineType === 'willful' ? 'WILLFUL' : 'SERIOUS' }} — {{ violation.finePerIncident | currency:'USD':'symbol':'1.0-0' }}/incident
                          </span>
                        }
                      </div>
                      <p class="text-gray-300 text-sm">{{ violation.description }}</p>
                      @if (violation.evidenceBasis && violation.status !== 'likely_ok') {
                        <p class="text-gray-500 text-xs mt-1.5 italic">{{ violation.evidenceBasis }}</p>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- CTA block -->
          <div class="bg-gradient-to-br from-green-950 to-gray-900 border border-green-800 rounded-2xl p-8 text-center">
            <h2 class="text-2xl font-bold text-white mb-2">Fix these gaps — free for 120 days</h2>
            <p class="text-gray-300 mb-2 max-w-lg mx-auto">
              ComplianceChimp gives your team the training, documentation, and recordkeeping tools
              to close every gap in this report. No paper. No guesswork. OSHA-ready in days.
            </p>
            <ul class="text-sm text-gray-400 mb-6 space-y-1">
              <li>✓ 1,400+ pre-built OSHA training articles for your industry</li>
              <li>✓ Digital training records — no paper signatures</li>
              <li>✓ Near-miss &amp; injury reporting built in</li>
              <li>✓ No contract · No credit card required to start</li>
            </ul>
            <a
              href="https://compliancechimp.com/signup"
              (click)="trackCta()"
              class="inline-block bg-green-500 hover:bg-green-400 text-white text-lg font-bold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-green-900">
              Start My Free 120-Day Trial →
            </a>
            <p class="text-gray-500 text-xs mt-4">500 free training surveys included. No card required.</p>
          </div>

          <!-- Disclaimer -->
          <p class="text-gray-600 text-xs text-center pb-4">
            This report is an AI-generated compliance assessment based on publicly available information
            and is not a legal determination of OSHA compliance. Fine amounts reflect 2025 OSHA penalty
            schedules for serious and willful violations. Consult a qualified safety professional for a
            formal compliance audit.
          </p>

        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
  `],
})
export class ReportPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);

  loading = signal(true);
  report = signal<Report | null>(null);

  private trackingUrl = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/trackEngagement';

  missingCount = computed(() =>
    this.report()?.violations.filter(v => v.status === 'likely_missing').length ?? 0
  );

  gradeStyles(): Record<ComplianceGrade, string> {
    return {
      A: 'bg-green-950 border-green-500 text-green-400',
      B: 'bg-blue-950 border-blue-500 text-blue-400',
      C: 'bg-yellow-950 border-yellow-500 text-yellow-400',
      D: 'bg-orange-950 border-orange-500 text-orange-400',
      F: 'bg-red-950 border-red-500 text-red-400',
    };
  }

  violationBorderClass(v: OshaViolation): string {
    if (v.status === 'likely_missing') return 'border-red-800';
    if (v.status === 'uncertain')      return 'border-yellow-800';
    return 'border-gray-800';
  }

  statusIconClass(v: OshaViolation): string {
    if (v.status === 'likely_missing') return 'bg-red-900 text-red-400';
    if (v.status === 'uncertain')      return 'bg-yellow-900 text-yellow-400';
    return 'bg-green-900 text-green-400';
  }

  statusIcon(v: OshaViolation): string {
    if (v.status === 'likely_missing') return '✗';
    if (v.status === 'uncertain')      return '?';
    return '✓';
  }

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) { this.loading.set(false); return; }

    try {
      const q = query(
        collection(this.firestore, 'reports'),
        where('reportToken', '==', token)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        this.report.set({ id: snap.docs[0].id, ...snap.docs[0].data() } as Report);
        // Fire page_view tracking event
        this.fireTrackingEvent(token, 'page_view');
      }
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      this.loading.set(false);
    }
  }

  trackCta(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (token) this.fireTrackingEvent(token, 'cta_click');
  }

  private fireTrackingEvent(token: string, eventType: string): void {
    fetch(this.trackingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, eventType }),
    }).catch(() => {}); // fire-and-forget, never block the user
  }
}
