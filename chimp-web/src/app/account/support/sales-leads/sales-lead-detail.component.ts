import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { NgxEditorModule, Editor, Toolbar, toHTML, toDoc, schema } from 'ngx-editor';
import {
  SalesLeadsService,
  SalesLead,
  LeadActivity,
  LeadChatMessage,
  SalesLeadStatus,
  ActivityType,
  FlowAction,
  KnowledgeEntry,
  AccountInsights,
  SequenceTrack,
  LEAD_STATUS_OPTIONS,
} from './sales-leads.service';

@Component({
  selector: 'app-sales-lead-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    TextFieldModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDividerModule,
    NgxEditorModule,
  ],
  templateUrl: './sales-lead-detail.component.html',
  styleUrl: './sales-lead-detail.component.css',
  providers: [SalesLeadsService],
})
export class SalesLeadDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly service = inject(SalesLeadsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly sanitizer = inject(DomSanitizer);
  private subs: Subscription[] = [];

  readonly statusOptions = LEAD_STATUS_OPTIONS;

  lead = signal<SalesLead | null>(null);
  activities = signal<LeadActivity[]>([]);
  private leadId = '';

  // Email conversation
  emailThreadOpen = signal(false);
  emailThreads = computed(() => {
    const emails = this.activities()
      .filter((a) => a.type === 'email_sent' || a.type === 'email_received')
      .reverse();

    const threads: { root: LeadActivity; replies: LeadActivity[] }[] = [];
    const threadMap = new Map<string, { root: LeadActivity; replies: LeadActivity[] }>();

    for (const email of emails) {
      const baseSubject = (email.emailSubject || '')
        .replace(/^(Re:\s*)+/i, '')
        .trim()
        .toLowerCase();

      if (email.type === 'email_sent' && !email.emailSubject?.match(/^Re:\s/i)) {
        const thread = { root: email, replies: [] as LeadActivity[] };
        threads.push(thread);
        if (baseSubject) threadMap.set(baseSubject, thread);
      } else if (baseSubject && threadMap.has(baseSubject)) {
        threadMap.get(baseSubject)!.replies.push(email);
      } else {
        threads.push({ root: email, replies: [] });
      }
    }
    return threads;
  });

  // Email composer
  showEmailComposer = signal(false);
  emailSubject = '';
  emailBody = '';
  emailInReplyTo: string | undefined;
  emailEditorDoc: any = null;
  emailEditor: Editor = new Editor();
  emailToolbar: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['ordered_list', 'bullet_list'],
    ['link'],
    ['align_left', 'align_center', 'align_right'],
    ['undo', 'redo'],
  ];
  emailGenerating = signal(false);
  emailSending = signal(false);

  // AI chat
  detailChatText = '';
  detailChatSending = signal(false);
  chatMessages = signal<LeadChatMessage[]>([]);

  // Flow
  flowSnoozeLeadId = signal<string | null>(null);
  flowSnoozeDate: Date | null = null;
  flowAnalyzingId = signal<string | null>(null);

  // Phone scripts (when next action is a call)
  phoneScriptsLoading = signal(false);
  phoneSuggestions = signal<{ title: string; body: string }[]>([]);
  phoneLibrary = signal<{ id: string; title: string; body: string; useCount: number; successCount: number }[]>([]);
  private phoneScriptsLoadedForLeadId: string | null = null;
  callFeedbackText = '';
  callLogSubmitting = signal(false);
  /** Legacy call activities may still have structured outcome */
  private readonly legacyCallOutcomeLabels: { value: string; label: string }[] = [
    { value: 'connected_positive', label: 'Connected, went well' },
    { value: 'connected_neutral', label: 'Connected, unclear / follow up later' },
    { value: 'connected_negative', label: 'Connected, not interested' },
    { value: 'voicemail', label: 'Voicemail' },
    { value: 'no_answer', label: 'No answer' },
    { value: 'wrong_number', label: 'Wrong number' },
  ];

  // Note
  noteText = '';

  // Consultation
  generatingConsultationId = signal<string | null>(null);

  // Sequence
  sequenceTrack = signal<SequenceTrack | null>(null);
  private sequenceTrackSub: Subscription | null = null;
  private loadedSequenceTrackId: string | null = null;

  // Account Insights
  accountInsights = signal<AccountInsights | null>(null);
  accountInsightsLoading = signal(false);
  accountInsightsOpen = signal(false);
  private insightsLoadedForTeamId: string | null = null;

  ngOnInit() {
    this.leadId = this.route.snapshot.paramMap.get('id')!;
    this.subs.push(
      this.service.getLead(this.leadId).subscribe((lead) => {
        this.lead.set(lead || null);
        if (lead?.hasUnviewedInbound) {
          this.service.markInboundViewed(this.leadId).catch(() => {});
        }
        const teamId = (lead as any)?.teamId;
        if (teamId && teamId !== this.insightsLoadedForTeamId) {
          this.loadAccountInsights(teamId);
        }
        const trackId = lead?.sequenceTrackId;
        if (trackId && trackId !== this.loadedSequenceTrackId) {
          this.loadedSequenceTrackId = trackId;
          this.sequenceTrackSub?.unsubscribe();
          this.sequenceTrackSub = this.service.getSequenceTrack(trackId).subscribe((t) => {
            this.sequenceTrack.set(t || null);
            const L = this.lead();
            if (L && this.shouldShowPhoneScripts(L) && this.phoneScriptsLoadedForLeadId !== L.id) {
              this.loadPhoneScripts();
            }
          });
        } else if (!trackId) {
          this.loadedSequenceTrackId = null;
          this.sequenceTrackSub?.unsubscribe();
          this.sequenceTrack.set(null);
        }

        if (lead && this.shouldShowPhoneScripts(lead)) {
          if (this.phoneScriptsLoadedForLeadId !== lead.id) {
            this.loadPhoneScripts();
          }
        } else {
          this.phoneScriptsLoadedForLeadId = null;
        }
      }),
      this.service.getLeadActivities(this.leadId).subscribe((a) =>
        this.activities.set(a)
      ),
      this.service.getLeadChatMessages(this.leadId).subscribe((msgs) =>
        this.chatMessages.set(msgs)
      )
    );
  }

  private async loadAccountInsights(teamId: string) {
    this.insightsLoadedForTeamId = teamId;
    this.accountInsightsLoading.set(true);
    try {
      const insights = await this.service.getAccountInsights(teamId);
      this.accountInsights.set(insights);
    } catch {
      this.accountInsights.set(null);
    } finally {
      this.accountInsightsLoading.set(false);
    }
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    this.sequenceTrackSub?.unsubscribe();
    this.emailEditor.destroy();
  }

  goBack() {
    this.location.back();
  }

  // ── Sequence ──

  async pauseSequence() {
    try {
      await this.service.pauseLeadSequence(this.leadId);
      this.snackBar.open('Sequence paused', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to pause sequence', '', { duration: 3000 });
    }
  }

  async resumeSequence() {
    try {
      await this.service.resumeLeadSequence(this.leadId);
      this.snackBar.open('Sequence resumed', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to resume sequence', '', { duration: 3000 });
    }
  }

  getSequenceProgress(lead: SalesLead): number {
    const track = this.sequenceTrack();
    if (!track?.steps?.length) return 0;
    const current = lead.sequenceCurrentStep ?? 0;
    return Math.round((current / track.steps.length) * 100);
  }

  formatSequenceNextAction(lead: SalesLead): string {
    if (!lead.sequenceNextActionAt) return '';
    const ts = lead.sequenceNextActionAt;
    const date = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return this.formatRelativeTime({ toDate: () => date, seconds: date.getTime() / 1000 });
  }

  // ── Status & Follow-up ──

  async changeStatus(lead: SalesLead, newStatus: SalesLeadStatus) {
    try {
      await this.service.updateLead(lead.id, { status: newStatus });
      this.snackBar.open(`Status updated to ${newStatus}`, '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to update status', '', { duration: 3000 });
    }
  }

  // ── Knowledge ──
  knowledgeOpen = signal(false);
  activityOpen = signal(false);
  chatHistoryOpen = signal(false);
  knowledgeText = '';

  async addKnowledge() {
    if (!this.knowledgeText.trim()) return;
    try {
      await this.service.addKnowledge(this.leadId, this.knowledgeText.trim(), 'manual');
      this.knowledgeText = '';
      this.snackBar.open('Added to knowledge base', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to save knowledge', '', { duration: 3000 });
    }
  }

  getKnowledgeSourceIcon(source: string): string {
    switch (source) {
      case 'research': return 'search';
      case 'chat': return 'auto_awesome';
      case 'manual': return 'edit_note';
      default: return 'info';
    }
  }

  // ── Notes ──

  async addNote() {
    if (!this.noteText.trim()) return;
    try {
      await this.service.addNote(this.leadId, this.noteText.trim());
      this.noteText = '';
      this.snackBar.open('Note added', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to add note', '', { duration: 3000 });
    }
  }

  // ── Email Composer ──

  async openEmailComposer() {
    this.showEmailComposer.set(true);
    this.emailSubject = '';
    this.emailBody = '';
    this.emailInReplyTo = undefined;
    this.emailEditorDoc = toDoc('', schema);
    await this.generateEmail();
  }

  async replyToEmail(activity: LeadActivity) {
    this.showEmailComposer.set(true);
    const originalSubject = (activity.emailSubject || '').replace(/^Re:\s*/i, '').trim();
    this.emailSubject = `Re: ${originalSubject}`;
    this.emailInReplyTo = (activity as any).messageId || undefined;
    this.emailBody = '';
    this.emailEditorDoc = toDoc('', schema);
    await this.generateEmail();
  }

  async generateEmail(context?: string) {
    this.emailGenerating.set(true);
    try {
      const result = await this.service.generateEmail(this.leadId, context);
      this.emailSubject = result.subject;
      this.emailBody = result.bodyHtml;
      if (!this.emailInReplyTo) {
        this.emailInReplyTo = result.inReplyTo;
      }
      this.emailEditorDoc = toDoc(result.bodyHtml || '', schema);
    } catch {
      this.snackBar.open('Failed to generate email', '', { duration: 3000 });
    } finally {
      this.emailGenerating.set(false);
    }
  }

  onEmailEditorChange(doc: any) {
    this.emailEditorDoc = doc;
    this.emailBody = toHTML(doc, schema);
  }

  async sendEmail() {
    if (!this.emailSubject) return;
    const html = toHTML(this.emailEditorDoc, schema);
    if (!html || html === '<p></p>') return;
    this.emailSending.set(true);
    try {
      await this.service.sendEmail(this.leadId, this.emailSubject, html, this.emailInReplyTo);
      this.showEmailComposer.set(false);
      this.snackBar.open('Email sent', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to send email', '', { duration: 3000 });
    } finally {
      this.emailSending.set(false);
    }
  }

  // ── AI Chat ──

  onChatKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendDetailLeadChat();
    }
  }

  async sendDetailLeadChat() {
    const lead = this.lead();
    if (!lead || !this.detailChatText.trim() || this.detailChatSending()) return;

    const text = this.detailChatText.trim();
    this.detailChatSending.set(true);
    this.detailChatText = '';

    try {
      const result = await this.service.chatWithLead(lead.id, text);

      if (result.actionsExecuted?.length) {
        this.snackBar.open(result.actionsExecuted.join(' · '), '', { duration: 4000 });
      }
    } catch {
      this.snackBar.open('Failed to reach AI, try again', '', { duration: 3000 });
    } finally {
      this.detailChatSending.set(false);
    }
  }

  // ── Calling ──

  async initiateCall() {
    const lead = this.lead();
    if (!lead?.phone) return;

    window.open(`tel:${lead.phone}`, '_self');

    try {
      await this.service.addNote(lead.id, `Call initiated to ${lead.phone}`);
    } catch {}
  }

  shouldShowPhoneScripts(lead: SalesLead): boolean {
    if (!lead.phone) return false;
    if (lead.flow?.recommendedAction === 'call') return true;
    const track = this.sequenceTrack();
    const idx = lead.sequenceCurrentStep ?? -1;
    const step = track?.steps?.[idx];
    if (lead.sequenceStatus === 'active' && step?.type === 'call') return true;
    return false;
  }

  async loadPhoneScripts(force = false) {
    const lead = this.lead();
    if (!lead?.id || !this.shouldShowPhoneScripts(lead)) return;
    if (!force && this.phoneScriptsLoadedForLeadId === lead.id) return;
    this.phoneScriptsLoading.set(true);
    try {
      const data = await this.service.generatePhoneScripts(lead.id);
      this.phoneSuggestions.set(data.suggestions || []);
      this.phoneLibrary.set(data.libraryScripts || []);
      this.phoneScriptsLoadedForLeadId = lead.id;
    } catch {
      this.snackBar.open('Could not load phone scripts', '', { duration: 3000 });
    } finally {
      this.phoneScriptsLoading.set(false);
    }
  }

  formatLegacyCallOutcome(outcome: string): string {
    return this.legacyCallOutcomeLabels.find((o) => o.value === outcome)?.label || outcome;
  }

  onCallLogKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submitCallLog();
    }
  }

  async submitCallLog() {
    const lead = this.lead();
    if (!lead?.id || !this.callFeedbackText.trim() || this.callLogSubmitting()) return;
    this.callLogSubmitting.set(true);
    try {
      await this.service.logPhoneCall(lead.id, this.callFeedbackText.trim());
      this.snackBar.open('Call logged', '', { duration: 2000 });
      this.callFeedbackText = '';
    } catch {
      this.snackBar.open('Failed to log call', '', { duration: 3000 });
    } finally {
      this.callLogSubmitting.set(false);
    }
  }

  // ── Flow ──

  private toDate(ts: any): Date | null {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (ts instanceof Date) return ts;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  getLeadFlowGroup(lead: SalesLead): 'overdue' | 'today' | 'upcoming' | null {
    const d = this.toDate(lead.flow?.nextActionAt);
    if (!d) return null;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86400000);
    if (d < startOfToday) return 'overdue';
    if (d < endOfToday) return 'today';
    return 'upcoming';
  }

  executeFlowAction() {
    const lead = this.lead();
    if (!lead) return;
    if (lead.flow?.recommendedAction === 'call') {
      this.initiateCall();
    } else {
      this.openEmailComposer();
    }
  }

  getFlowActionIcon(action?: FlowAction): string {
    switch (action) {
      case 'email': return 'email';
      case 'call': return 'phone';
      case 'follow_up': return 'reply';
      case 'close': return 'close';
      default: return 'play_arrow';
    }
  }

  getFlowActionLabel(action?: FlowAction): string {
    switch (action) {
      case 'email': return 'Send Email';
      case 'call': return 'Make Call';
      case 'follow_up': return 'Follow Up';
      case 'close': return 'Close Lead';
      default: return 'Take Action';
    }
  }

  getPriorityColor(priority?: string): string {
    switch (priority) {
      case 'high': return '#c62828';
      case 'medium': return '#f57c00';
      case 'low': return '#757575';
      default: return '#757575';
    }
  }

  formatRelativeTime(ts: any): string {
    const d = this.toDate(ts);
    if (!d) return '';
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const absDiffMs = Math.abs(diffMs);

    if (absDiffMs < 60000) return 'just now';

    const minutes = Math.floor(absDiffMs / 60000);
    const hours = Math.floor(absDiffMs / 3600000);
    const days = Math.floor(absDiffMs / 86400000);

    if (diffMs < 0) {
      if (days > 0) return `${days}d overdue`;
      if (hours > 0) return `${hours}h overdue`;
      return `${minutes}m overdue`;
    }

    if (days > 0) return `in ${days}d`;
    if (hours > 0) return `in ${hours}h`;
    return `in ${minutes}m`;
  }

  openFlowSnooze(lead: SalesLead) {
    this.flowSnoozeLeadId.set(lead.id);
    this.flowSnoozeDate = null;
  }

  async confirmFlowSnooze() {
    const leadId = this.flowSnoozeLeadId();
    if (!leadId || !this.flowSnoozeDate) return;
    try {
      await this.service.snoozeLeadFlow(leadId, this.flowSnoozeDate);
      this.flowSnoozeLeadId.set(null);
      this.snackBar.open('Snoozed', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to snooze', '', { duration: 3000 });
    }
  }

  async dismissFlowAction(lead: SalesLead) {
    try {
      await this.service.dismissFlowAction(lead.id);
      this.snackBar.open('Dismissed', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to dismiss', '', { duration: 3000 });
    }
  }

  async refreshSingleFlow(lead: SalesLead) {
    this.flowAnalyzingId.set(lead.id);
    try {
      await this.service.analyzeLeadFlow(lead.id);
      this.snackBar.open('Analysis updated', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to analyze lead', '', { duration: 3000 });
    } finally {
      this.flowAnalyzingId.set(null);
    }
  }

  // ── Consultation ──

  async generateConsultation(lead: SalesLead) {
    this.generatingConsultationId.set(lead.id);
    try {
      const result = await this.service.generateConsultation(lead.id);
      if (result.consultationUrl) {
        this.snackBar.open('Consultation created and emailed', '', { duration: 3000 });
      } else {
        this.snackBar.open('Consultation created', '', { duration: 2000 });
      }
    } catch {
      this.snackBar.open('Failed to generate consultation', '', { duration: 3000 });
    } finally {
      this.generatingConsultationId.set(null);
    }
  }

  // ── Archive / Delete ──

  async archiveLead(lead: SalesLead) {
    const archive = !lead.archived;
    try {
      await this.service.archiveLead(lead.id, archive);
      this.snackBar.open(archive ? 'Lead archived' : 'Lead unarchived', '', { duration: 2000 });
      if (archive) this.goBack();
    } catch {
      this.snackBar.open('Failed to archive lead', '', { duration: 3000 });
    }
  }

  async deleteLead(lead: SalesLead) {
    if (!confirm(`Delete lead "${lead.businessName}"? This cannot be undone.`)) return;
    try {
      await this.service.deleteLead(lead.id);
      this.snackBar.open('Lead deleted', '', { duration: 2000 });
      this.goBack();
    } catch {
      this.snackBar.open('Failed to delete lead', '', { duration: 3000 });
    }
  }

  // ── Helpers ──

  encodeURIComponent = encodeURIComponent;

  getSubscriptionLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Active',
      trialing: 'Trial',
      past_due: 'Past Due',
      canceled: 'Canceled',
      unpaid: 'Unpaid',
      none: 'No subscription',
    };
    return labels[status] || status;
  }

  getSubscriptionColor(status: string): string {
    const colors: Record<string, string> = {
      active: '#2e7d32',
      trialing: '#1976d2',
      past_due: '#f57c00',
      canceled: '#757575',
      unpaid: '#c62828',
      none: '#9e9e9e',
    };
    return colors[status] || '#757575';
  }

  formatRelativeDate(isoString: string | null): string {
    if (!isoString) return 'Never';
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  }

  getStatusColor(status: SalesLeadStatus): string {
    return this.statusOptions.find((s) => s.value === status)?.color || '#757575';
  }

  getStatusLabel(status: SalesLeadStatus): string {
    return this.statusOptions.find((s) => s.value === status)?.label || status;
  }

  formatDate(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatTime(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  sanitizeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  contactMethodIcon(method: string): string {
    switch (method) {
      case 'facebook': return 'thumb_up';
      case 'linkedin': return 'work';
      case 'in_person': return 'storefront';
      case 'website_form': return 'language';
      case 'email': return 'email';
      case 'phone': return 'phone';
      default: return 'contact_page';
    }
  }

  contactMethodLabel(method: string): string {
    switch (method) {
      case 'facebook': return 'Facebook message';
      case 'linkedin': return 'LinkedIn';
      case 'in_person': return 'In person / walk-in';
      case 'website_form': return 'Website contact form';
      case 'email': return 'Email';
      case 'phone': return 'Phone call';
      default: return method;
    }
  }

  getActivityIcon(type: ActivityType): string {
    switch (type) {
      case 'note': return 'edit_note';
      case 'call': return 'phone';
      case 'email_sent': return 'email';
      case 'email_received': return 'mark_email_unread';
      case 'status_change': return 'swap_horiz';
      case 'lead_created': return 'add_circle';
      case 'lead_archived': return 'archive';
      case 'lead_unarchived': return 'unarchive';
      case 'email_generated': return 'auto_awesome';
      case 'consultation_generated': return 'assignment';
      case 'flow_snoozed': return 'snooze';
      case 'flow_dismissed': return 'close';
      case 'flow_analyzed': return 'analytics';
      case 'link_clicked': return 'ads_click';
      default: return 'circle';
    }
  }

  getActivityLabel(type: ActivityType): string {
    switch (type) {
      case 'note': return 'Note';
      case 'call': return 'Call';
      case 'email_sent': return 'Email Sent';
      case 'email_received': return 'Reply Received';
      case 'status_change': return 'Status Changed';
      case 'lead_created': return 'Lead Created';
      case 'lead_archived': return 'Archived';
      case 'lead_unarchived': return 'Unarchived';
      case 'email_generated': return 'Email Generated';
      case 'consultation_generated': return 'Consultation Generated';
      case 'flow_snoozed': return 'Flow Snoozed';
      case 'flow_dismissed': return 'Flow Dismissed';
      case 'flow_analyzed': return 'Flow Analyzed';
      case 'link_clicked': return 'Link Clicked';
      default: return type;
    }
  }

  getLeadGaps(lead: { contactName?: string; phone?: string; email?: string; website?: string; city?: string; state?: string; employeeEstimate?: string }): { icon: string; label: string }[] {
    const gaps: { icon: string; label: string }[] = [];
    if (!lead.contactName) gaps.push({ icon: 'person_off', label: 'No contact name' });
    if (!lead.phone) gaps.push({ icon: 'phone_disabled', label: 'No phone' });
    if (!lead.email) gaps.push({ icon: 'mail_lock', label: 'No email' });
    if (!lead.website) gaps.push({ icon: 'link_off', label: 'No online presence' });
    if (!lead.city && !lead.state) gaps.push({ icon: 'location_off', label: 'No location' });
    if (!lead.employeeEstimate) gaps.push({ icon: 'group_off', label: 'No size estimate' });
    return gaps;
  }
}
