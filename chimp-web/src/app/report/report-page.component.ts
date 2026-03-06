import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { collection, getDocs, query, where, Firestore } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
import { ComplianceGrade, OshaViolation, Report } from '../models';
import { DateFormatPipe, IndustryLabelPipe } from '../lead-gen.pipes';

@Component({
  selector: 'app-report-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DateFormatPipe, IndustryLabelPipe],
  template: `
    @if (loading()) {
      <section class="report-shell loading-state">
        <div class="spinner"></div>
        <p>Loading your compliance report...</p>
      </section>
    } @else if (!report()) {
      <section class="report-shell empty-state">
        <h1>Report not found</h1>
        <p>This compliance report may have expired or the link may be incorrect.</p>
        <a href="/home">Back to Compliance Chimp</a>
      </section>
    } @else {
      <section class="report-shell">
        <header class="report-header">
          <div>
            <p class="eyebrow">OSHA Compliance Report</p>
            <h1>{{ report()!.businessName }}</h1>
            <p class="subhead">{{ report()!.city }}, {{ report()!.state }} · {{ report()!.industry | industryLabel }}</p>
            <p class="meta">Generated {{ report()!.generatedAt | dateFormat }}</p>
          </div>
          <div class="grade-card" [class]="gradeStyles()[report()!.grade]">
            <span>{{ report()!.grade }}</span>
            <small>Grade</small>
          </div>
        </header>

        <section class="summary-grid">
          <article class="panel alert-panel">
            <p class="panel-label">Estimated Fine Exposure</p>
            <strong>{{ report()!.totalFineExposure | currency:'USD':'symbol':'1.0-0' }}</strong>
            <span>if OSHA walked in today</span>
          </article>
          <article class="panel">
            <p class="panel-label">Gaps Found</p>
            <strong>{{ missingCount() }}</strong>
            <span>likely non-compliant areas</span>
          </article>
          <article class="panel">
            <p class="panel-label">Industry Avg Fine</p>
            <strong>{{ report()!.industryAvgFine | currency:'USD':'symbol':'1.0-0' }}</strong>
            <span>per OSHA inspection</span>
          </article>
        </section>

        @if (report()!.industryFineContext) {
          <section class="context-banner">
            {{ report()!.industryFineContext }}
          </section>
        }

        <section class="panel">
          <h2>OSHA Standards Review</h2>
          <div class="violation-list">
            @for (violation of report()!.violations; track violation.cfr) {
              <article class="violation-card" [class.missing]="violation.status === 'likely_missing'" [class.uncertain]="violation.status === 'uncertain'">
                <div class="violation-top">
                  <div>
                    <div class="violation-title">{{ violation.title }}</div>
                    <div class="violation-meta">{{ violation.cfr }}</div>
                  </div>
                  @if (violation.status === 'likely_missing') {
                    <div class="violation-penalty">
                      {{ violation.fineType === 'willful' ? 'Willful' : 'Serious' }} ·
                      {{ violation.finePerIncident | currency:'USD':'symbol':'1.0-0' }}/incident
                    </div>
                  }
                </div>
                <p>{{ violation.description }}</p>
                @if (violation.evidenceBasis && violation.status !== 'likely_ok') {
                  <p class="violation-meta">{{ violation.evidenceBasis }}</p>
                }
              </article>
            }
          </div>
        </section>

        <section class="panel cta-panel">
          <h2>Fix these gaps</h2>
          <p>
            ComplianceChimp gives your team the training, documentation, and recordkeeping tools
            to close every gap in this report.
          </p>
          <a class="cta-link" href="/get-started">Start My Free 120-Day Trial</a>
        </section>

        <p class="disclaimer">
          This report is an AI-generated compliance assessment based on publicly available information and is not a legal determination of OSHA compliance.
        </p>
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    .report-shell { max-width: 920px; margin: 0 auto; padding: 32px 20px 56px; color: #111827; }
    .loading-state, .empty-state { text-align: center; padding-top: 80px; }
    .spinner { width: 42px; height: 42px; margin: 0 auto 16px; border: 4px solid #cbd5e1; border-top-color: #054d8a; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .eyebrow { margin: 0 0 6px; color: #054d8a; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
    .report-header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 24px; }
    .subhead, .meta, .disclaimer, .violation-meta { color: #6b7280; }
    .meta, .violation-meta, .disclaimer { font-size: 13px; }
    .grade-card { min-width: 110px; border-radius: 20px; padding: 18px 16px; text-align: center; border: 2px solid currentColor; background: #fff; }
    .grade-card span { display: block; font-size: 40px; font-weight: 800; line-height: 1; }
    .grade-card small { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
    .grade-a { color: #166534; background: #ecfdf5; }
    .grade-b { color: #1d4ed8; background: #eff6ff; }
    .grade-c { color: #a16207; background: #fefce8; }
    .grade-d { color: #c2410c; background: #fff7ed; }
    .grade-f { color: #b91c1c; background: #fef2f2; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; box-shadow: 0 6px 18px rgba(5, 77, 138, 0.06); }
    .panel-label { margin: 0 0 10px; color: #6b7280; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
    .panel strong { display: block; font-size: 28px; color: #111827; margin-bottom: 6px; }
    .alert-panel { background: #fff7ed; border-color: #fdba74; }
    .context-banner { margin-bottom: 20px; padding: 16px 18px; border-radius: 16px; background: #eff6ff; color: #054d8a; font-weight: 600; }
    .violation-list { display: grid; gap: 14px; }
    .violation-card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; }
    .violation-card.missing { border-color: #fca5a5; background: #fef2f2; }
    .violation-card.uncertain { border-color: #fcd34d; background: #fffbeb; }
    .violation-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .violation-title { font-weight: 700; }
    .violation-penalty { color: #b91c1c; font-size: 13px; font-weight: 700; }
    .cta-panel { margin-top: 20px; text-align: center; }
    .cta-link { display: inline-block; margin-top: 14px; padding: 12px 20px; border-radius: 999px; background: #ff9100; color: #111827; font-weight: 700; text-decoration: none; }
    .cta-link:hover { filter: brightness(0.98); }
    .disclaimer { margin-top: 24px; text-align: center; }
    a { color: #054d8a; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media (max-width: 720px) {
      .report-header, .violation-top { flex-direction: column; }
      .report-shell { padding: 24px 16px 40px; }
    }
  `],
})
export class ReportPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly firestore = inject(Firestore);

  readonly loading = signal(true);
  readonly report = signal<Report | null>(null);

  readonly missingCount = computed(() =>
    this.report()?.violations.filter(violation => violation.status === 'likely_missing').length ?? 0
  );

  constructor() {
    void this.loadReport();
  }

  gradeStyles(): Record<ComplianceGrade, string> {
    return {
      A: 'grade-a',
      B: 'grade-b',
      C: 'grade-c',
      D: 'grade-d',
      F: 'grade-f',
    };
  }

  private async loadReport(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.loading.set(false);
      return;
    }

    try {
      const reportQuery = query(
        collection(this.firestore, 'reports'),
        where('reportToken', '==', token)
      );
      const snapshot = await getDocs(reportQuery);
      if (!snapshot.empty) {
        this.report.set({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Report);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      this.loading.set(false);
    }
  }
}
