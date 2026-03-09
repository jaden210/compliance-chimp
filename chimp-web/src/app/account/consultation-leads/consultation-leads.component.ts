import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { combineLatest, map, startWith, BehaviorSubject, take } from 'rxjs';
import { ConsultationLeadRecord, LeadJourney } from '../../shared/osha-consultation';
import { ConsultationLeadsService } from './consultation-leads.service';

@Component({
  standalone: true,
  selector: 'app-consultation-leads',
  templateUrl: './consultation-leads.component.html',
  styleUrls: ['./consultation-leads.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  providers: [ConsultationLeadsService],
})
export class ConsultationLeadsComponent implements OnInit {
  private readonly service = inject(ConsultationLeadsService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly search$ = new BehaviorSubject('');
  readonly statusFilter$ = new BehaviorSubject('all');
  readonly sourceFilter$ = new BehaviorSubject('all');
  readonly resendingById: Record<string, boolean> = {};
  readonly emailPreviewById: Record<string, SafeResourceUrl | null> = {};
  readonly testEmailById: Record<string, string> = {};
  readonly sendingTestById: Record<string, boolean> = {};

  journeyMap = new Map<string, LeadJourney>();
  journeysLoaded = false;

  readonly leads$ = this.service.getLeads().pipe(startWith([] as ConsultationLeadRecord[]));
  readonly filteredLeads$ = combineLatest([
    this.leads$,
    this.search$,
    this.statusFilter$,
    this.sourceFilter$,
  ]).pipe(
    map(([leads, search, status, source]) => {
      const query = search.trim().toLowerCase();
      return leads.filter((lead) => {
        const matchesSearch =
          !query ||
          lead.companyName?.toLowerCase().includes(query) ||
          lead.email?.toLowerCase().includes(query) ||
          lead.sourceMetadata?.source?.toLowerCase().includes(query) ||
          lead.sourceMetadata?.campaign?.toLowerCase().includes(query);
        const matchesStatus = status === 'all' || this.getConversionStatus(lead) === status;
        const matchesSource = source === 'all' || lead.sourceType === source;
        return matchesSearch && matchesStatus && matchesSource;
      });
    })
  );

  readonly summary$ = this.leads$.pipe(
    map((leads) => {
      let viewed = 0;
      let signupStarted = 0;
      let converted = 0;
      for (const lead of leads) {
        const j = this.journeyMap.get(lead.publicConsultationId);
        if (j?.reportViewed) viewed++;
        if (j?.signupStarted) signupStarted++;
        if (j?.accountCreated) converted++;
      }
      return {
        total: leads.length,
        sent: leads.filter((lead) => lead.deliveryStatus === 'sent').length,
        failed: leads.filter((lead) => lead.deliveryStatus === 'send_failed').length,
        viewed,
        signupStarted,
        converted,
      };
    })
  );

  ngOnInit(): void {
    this.leads$.pipe(take(1)).subscribe(async (leads) => {
      if (!leads.length) return;
      const ids = leads.map(l => l.publicConsultationId);
      this.journeyMap = await this.service.fetchJourneys(ids);
      this.journeysLoaded = true;
    });
  }

  getJourney(lead: ConsultationLeadRecord): LeadJourney | undefined {
    return this.journeyMap.get(lead.publicConsultationId);
  }

  getConversionStatus(lead: ConsultationLeadRecord): string {
    const j = this.journeyMap.get(lead.publicConsultationId);
    if (j?.accountCreated) return 'converted';
    if (j?.signupStarted) return 'signup_started';
    if (j?.ctaClicked) return 'clicked';
    if (j?.reportViewed) return 'viewed';
    if (lead.deliveryStatus === 'send_failed') return 'failed';
    if (lead.deliveryStatus === 'sent') return 'sent';
    return 'generated';
  }

  readonly conversionLabels: Record<string, string> = {
    converted: 'Converted',
    signup_started: 'Signup Started',
    clicked: 'CTA Clicked',
    viewed: 'Viewed',
    sent: 'Sent',
    failed: 'Failed',
    generated: 'Generated',
  };

  setSearch(value: string): void {
    this.search$.next(value);
  }

  setStatus(value: string): void {
    this.statusFilter$.next(value);
  }

  setSource(value: string): void {
    this.sourceFilter$.next(value);
  }

  async resendEmail(lead: ConsultationLeadRecord): Promise<void> {
    if (this.resendingById[lead.id]) return;
    this.resendingById[lead.id] = true;
    try {
      await this.service.resendLeadEmail(lead.id);
    } catch (error) {
      console.error('Error resending consultation lead email:', error);
    } finally {
      this.resendingById[lead.id] = false;
    }
  }

  async sendTestEmail(lead: ConsultationLeadRecord): Promise<void> {
    const email = (this.testEmailById[lead.id] || '').trim();
    if (!email || this.sendingTestById[lead.id]) return;
    this.sendingTestById[lead.id] = true;
    try {
      await this.service.resendLeadEmail(lead.id, email);
      this.testEmailById[lead.id] = '';
    } catch (error) {
      console.error('Error sending test email:', error);
    } finally {
      this.sendingTestById[lead.id] = false;
    }
  }

  formatDate(value: unknown): string {
    if (!value) return '—';

    if (typeof value === 'string') {
      return new Date(value).toLocaleString();
    }

    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate().toLocaleString();
    }

    if (typeof maybeTimestamp.seconds === 'number') {
      return new Date(maybeTimestamp.seconds * 1000).toLocaleString();
    }

    return '—';
  }

  trackByLeadId(_: number, lead: ConsultationLeadRecord): string {
    return lead.id;
  }

  toggleEmailPreview(lead: ConsultationLeadRecord): void {
    if (this.emailPreviewById[lead.id]) {
      this.emailPreviewById[lead.id] = null;
      return;
    }
    const html = this.buildEmailHtml(lead);
    this.emailPreviewById[lead.id] = this.sanitizer.bypassSecurityTrustResourceUrl(
      'data:text/html;charset=utf-8,' + encodeURIComponent(html)
    );
  }

  private static readonly ULYSSES_FUN_FACTS: string[] = [
    'I had a banana for lunch. Unrelated, but worth mentioning.',
    'My therapist says I worry too much about fall protection. I say she doesn\'t worry enough.',
    'People ask why a chimp runs a compliance company. I ask why it took this long for one to step up.',
    'I type 40 words per minute. Impressive for someone who also uses his feet.',
    'I can bench press 600 pounds. Unrelated to compliance but I like to bring it up.',
    'Sometimes I just sit and think about PPE. That\'s not a joke. I genuinely do that.',
    'My team wanted casual Fridays. I reminded them that hard hats aren\'t optional. We compromised on Hawaiian hard hats.',
    'I once read the entire OSHA 1910 general industry standard. Cover to cover. On vacation.',
    'They say dress for the job you want. I want the job where everyone goes home safe. So, steel-toed banana peels.',
    'I started this company because I care about two things: safety and bananas. In that order. Usually.',
    'Technically I\'m not licensed to give legal advice. Technically I\'m also a chimp. Lots of technicalities.',
    'I was grooming earlier and found a citation under my fur. Just kidding. But I have found them in stranger places.',
  ];

  private buildEmailHtml(lead: ConsultationLeadRecord): string {
    const { companyName, assessment, publicUrl } = lead;
    const funFact = ConsultationLeadsComponent.ULYSSES_FUN_FACTS[
      Math.floor(Math.random() * ConsultationLeadsComponent.ULYSSES_FUN_FACTS.length)
    ];
    const nextActions = Array.isArray(assessment.nextActions)
      ? assessment.nextActions.slice(0, 3)
      : [];
    const nextActionsHtml = nextActions.length
      ? nextActions
          .map((a: any) => `<li style="margin:0 0 8px;"><strong>${a.title}</strong>: ${a.description}</li>`)
          .join('')
      : `<li style="margin:0;">Open the consultation to review your recommended next steps.</li>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;">
      <div style="font-family:Arial,sans-serif;background:#f6f8fb;margin:0;padding:32px 16px;color:#1b1b1b;">
        <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#054d8a 0%,#04355f 100%);padding:24px 32px;text-align:center;">
            <img src="https://compliancechimp.com/assets/complianceChimpLogoLight.png" alt="Compliance Chimp" style="height:40px;" />
          </div>
          <div style="padding:32px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td style="width:140px;vertical-align:top;padding-right:20px;">
                  <img src="https://compliancechimp.com/assets/chimp.png" alt="Ulysses" style="width:140px;height:auto;display:block;" />
                </td>
                <td style="vertical-align:top;">
                  <h2 style="margin:0 0 6px;font-size:22px;color:#054d8a;">A New Era of Workplace Safety</h2>
                  <p style="margin:0 0 10px;font-size:14px;color:#5b6470;line-height:1.5;">
                    I'm Ulysses, the world's first AI agent for workplace safety with a total mastery of OSHA.
                  </p>
                  <p style="margin:0;line-height:1.7;">
                    I help small businesses put together real safety programs. Training plans, inspections, compliance tracking, record keeping. The whole system, without the price tag of a full-time safety manager.
                  </p>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 24px;line-height:1.7;">
              I went ahead and ran <strong>${companyName}</strong> against current OSHA standards to see where you stand. Here is what I found.
            </p>
            <div style="display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:20px;border-radius:16px;background:#f6f8fb;border:1px solid rgba(5,77,138,0.12);">
              <div>
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#5b6470;">Compliance urgency score</div>
                <div style="font-size:44px;font-weight:700;color:#054d8a;">${assessment.importanceScore}</div>
                <div style="font-size:16px;font-weight:700;color:#1b1b1b;">${assessment.importanceLevel}</div>
              </div>
              <a href="${publicUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#ff9100;color:#ffffff;text-decoration:none;font-weight:700;">Open My Consultation</a>
            </div>
            <div style="margin-top:24px;">
              <h2 style="margin:0 0 12px;font-size:22px;color:#054d8a;">Ulysses's quick read</h2>
              <p style="margin:0;line-height:1.7;">${assessment.ulyssesTake}</p>
            </div>
            <div style="margin-top:24px;">
              <h2 style="margin:0 0 12px;font-size:22px;color:#054d8a;">First things to look at</h2>
              <ul style="margin:0;padding-left:20px;line-height:1.7;">${nextActionsHtml}</ul>
            </div>
            <div style="margin-top:28px;padding-top:20px;border-top:1px solid rgba(5,77,138,0.12);">
              <p style="margin:0;line-height:1.7;color:#4b5563;">
                Full consultation link: <a href="${publicUrl}" style="color:#054d8a;">${publicUrl}</a>
              </p>
            </div>
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;border-radius:14px;background:rgba(5,77,138,0.04);">
              <tr>
                <td style="width:80px;vertical-align:middle;padding:16px 0 16px 16px;">
                  <img src="https://compliancechimp.com/assets/chimpDesk.png" alt="Ulysses" style="width:72px;height:auto;display:block;" />
                </td>
                <td style="vertical-align:middle;padding:16px 20px;">
                  <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;color:#054d8a;">Fun fact about me</p>
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;font-style:italic;">${funFact}</p>
                </td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    </body></html>`;
  }
}
