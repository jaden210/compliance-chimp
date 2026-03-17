import { Component, inject, signal, computed, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatBadgeModule } from '@angular/material/badge';
import { Subscription } from 'rxjs';
import { NgxEditorModule, Editor, Toolbar, toHTML, toDoc, schema } from 'ngx-editor';
import {
  SalesLeadsService,
  SalesLead,
  ResearchSession,
  ResearchMessage,
  ResearchLead,
  LeadFeedbackEntry,
  SalesLeadStatus,
  FlowAction,
  AccountInsights,
  LEAD_STATUS_OPTIONS,
} from './sales-leads.service';

type ViewMode = 'research' | 'leads' | 'flow';

@Component({
  selector: 'app-sales-leads',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTabsModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatBadgeModule,
    MatDividerModule,
    NgxEditorModule,
  ],
  templateUrl: './sales-leads.component.html',
  styleUrl: './sales-leads.component.css',
  providers: [SalesLeadsService],
})
export class SalesLeadsComponent implements OnInit, OnDestroy {
  private readonly service = inject(SalesLeadsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private subs: Subscription[] = [];

  @ViewChild('chatInput') chatInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('chatMessages') chatMessages?: ElementRef<HTMLDivElement>;

  readonly statusOptions = LEAD_STATUS_OPTIONS;

  // ── View State ──
  view = signal<ViewMode>('flow');

  // ── Pipeline ──
  leads = signal<SalesLead[]>([]);
  searchQuery = signal('');
  statusFilter = signal<SalesLeadStatus | 'all'>('all');
  sourceFilter = signal<string>('all');
  showArchived = signal(false);
  sortBy = signal<'newest' | 'unviewed_inbound'>('newest');
  trialFilter = signal(false);
  loadingTrialData = signal(false);
  accountInsights = signal<Map<string, AccountInsights>>(new Map());

  unviewedInboundCount = computed(() =>
    this.leads().filter((l) => l.hasUnviewedInbound && !l.archived).length
  );

  unreadReplyLeads = computed(() =>
    this.leads()
      .filter((l) => l.hasUnviewedInbound && !l.archived && l.status !== 'test')
      .sort((a, b) => (b.unviewedInboundCount || 0) - (a.unviewedInboundCount || 0))
  );

  private unreadReplyIds = computed(() =>
    new Set(this.unreadReplyLeads().map((l) => l.id))
  );

  freeTrialLeadIds = computed(() => {
    const insights = this.accountInsights();
    const ids = new Set<string>();
    for (const lead of this.leads()) {
      if (!lead.teamId) continue;
      const acct = insights.get(lead.teamId);
      if (acct && acct.subscription.status !== 'active') {
        ids.add(lead.id);
      }
    }
    return ids;
  });

  freeTrialCount = computed(() => this.freeTrialLeadIds().size);

  filteredLeads = computed(() => {
    let result = this.leads();
    const q = this.searchQuery().toLowerCase();
    const status = this.statusFilter();
    const source = this.sourceFilter();

    if (!this.showArchived()) {
      result = result.filter((l) => !l.archived);
    }
    if (q) {
      result = result.filter(
        (l) =>
          (l.businessName || '').toLowerCase().includes(q) ||
          (l.contactName || '').toLowerCase().includes(q) ||
          (l.email || '').toLowerCase().includes(q) ||
          (l.city || '').toLowerCase().includes(q) ||
          (l.state || '').toLowerCase().includes(q)
      );
    }
    if (status !== 'all') result = result.filter((l) => l.status === status);
    if (source === 'research') {
      result = result.filter((l) => l.source?.toLowerCase().endsWith('research'));
    } else if (source !== 'all') {
      result = result.filter((l) => l.source === source);
    }

    if (this.trialFilter()) {
      const trialIds = this.freeTrialLeadIds();
      result = result.filter((l) => trialIds.has(l.id));
    }

    if (this.sortBy() === 'unviewed_inbound') {
      result = [...result].sort((a, b) => {
        const aHas = a.hasUnviewedInbound ? 1 : 0;
        const bHas = b.hasUnviewedInbound ? 1 : 0;
        if (bHas !== aHas) return bHas - aHas;
        return (b.unviewedInboundCount || 0) - (a.unviewedInboundCount || 0);
      });
    }

    return result;
  });

  pipelineStats = computed(() => {
    const all = this.leads().filter((l) => !l.archived);
    const byStatus: Record<string, number> = {};
    for (const s of this.statusOptions) byStatus[s.value] = 0;
    all.forEach((l) => {
      if (byStatus[l.status] !== undefined) byStatus[l.status]++;
    });
    return { total: all.length, byStatus };
  });

  leadsByBizName = computed(() => {
    const map = new Map<string, SalesLead>();
    for (const l of this.leads()) {
      map.set(l.businessName.toLowerCase(), l);
    }
    return map;
  });

  // ── Collapse State ──
  collapsedLeads = signal<Set<string>>(new Set());

  isLeadCollapsed(lead: SalesLead): boolean {
    return this.collapsedLeads().has(lead.id);
  }

  toggleCollapse(lead: SalesLead, event: Event) {
    event.stopPropagation();
    const set = new Set(this.collapsedLeads());
    if (set.has(lead.id)) {
      set.delete(lead.id);
    } else {
      set.add(lead.id);
    }
    this.collapsedLeads.set(set);
  }

  hasActivity(lead: SalesLead): boolean {
    return lead.status !== 'new' || !!lead.lastContactedAt || !!lead.nextFollowUp;
  }

  collapseAllLeads() {
    const set = new Set<string>();
    for (const lead of this.filteredLeads()) {
      if (!this.hasActivity(lead)) {
        set.add(lead.id);
      }
    }
    this.collapsedLeads.set(set);
  }

  expandAllLeads() {
    this.collapsedLeads.set(new Set());
  }

  // ── Research Lead Collapse State ──
  collapsedResearchLeads = signal<Set<string>>(new Set());

  researchLeadKey(msgIdx: number, leadIdx: number): string {
    return `${msgIdx}-${leadIdx}`;
  }

  isResearchLeadCollapsed(msgIdx: number, leadIdx: number, pipelineLead: SalesLead | null): boolean {
    if (pipelineLead && this.hasActivity(pipelineLead)) return false;
    return this.collapsedResearchLeads().has(this.researchLeadKey(msgIdx, leadIdx));
  }

  toggleResearchLeadCollapse(msgIdx: number, leadIdx: number, event: Event) {
    event.stopPropagation();
    const key = this.researchLeadKey(msgIdx, leadIdx);
    const set = new Set(this.collapsedResearchLeads());
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    this.collapsedResearchLeads.set(set);
  }

  collapseStaleResearchLeads() {
    const set = new Set<string>();
    const messages = this.chatHistory();
    messages.forEach((msg, msgIdx) => {
      if (msg.leadsFound) {
        msg.leadsFound.forEach((lead, leadIdx) => {
          const pipelineLead = this.getPipelineLead(lead);
          if (!pipelineLead || !this.hasActivity(pipelineLead)) {
            set.add(this.researchLeadKey(msgIdx, leadIdx));
          }
        });
      }
    });
    this.collapsedResearchLeads.set(set);
  }

  expandAllResearchLeads() {
    this.collapsedResearchLeads.set(new Set());
  }

  hasProgressedPipelineLead(pipelineLead: SalesLead | null): boolean {
    return !!pipelineLead && this.hasActivity(pipelineLead);
  }

  // ── Lead AI Chat (per-lead inline assistant) ──
  leadChatTexts: Record<string, string> = {};
  leadChatSendingKey = signal<string | null>(null);

  isLeadChatSending(key: string): boolean {
    return this.leadChatSendingKey() === key;
  }

  getLeadChatText(key: string): string {
    return this.leadChatTexts[key] || '';
  }

  setLeadChatText(key: string, value: string) {
    this.leadChatTexts[key] = value;
  }

  private buildLeadSummary(lead: { businessName?: string; contactName?: string; email?: string; phone?: string; website?: string; city?: string; state?: string }): string {
    return [
      lead.businessName || 'Unknown Business',
      lead.contactName ? `Contact: ${lead.contactName}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.website ? `Website: ${lead.website}` : null,
      lead.city ? `City: ${lead.city}` : null,
      lead.state ? `State: ${lead.state}` : null,
    ].filter(Boolean).join(', ');
  }

  async sendResearchLeadChat(lead: ResearchLead, msgIdx: number, leadIdx: number) {
    const key = this.researchLeadKey(msgIdx, leadIdx);
    const text = (this.leadChatTexts[key] || '').trim();
    if (!text || this.leadChatSendingKey()) return;

    const contextMessage = `[Re: "${lead.businessName || 'Unknown Business'}" (${this.buildLeadSummary(lead)})]: ${text}`;

    this.leadChatSendingKey.set(key);
    this.leadChatTexts[key] = '';

    try {
      const result = await this.service.research(contextMessage, undefined, true);

      const entry: LeadFeedbackEntry = {
        feedback: text,
        reply: result.reply,
        timestamp: new Date().toISOString(),
      };

      this.chatHistory.update((history) => {
        const updated = [...history];
        const msg = updated[msgIdx];
        if (msg?.leadsFound?.[leadIdx]) {
          const updatedLeads = [...msg.leadsFound];
          let updatedLead = { ...updatedLeads[leadIdx] };

          if (result.leads?.length > 0) {
            const corrected = result.leads[0];
            updatedLead = {
              ...updatedLead,
              ...Object.fromEntries(
                Object.entries(corrected).filter(([_, v]) => v !== undefined && v !== null && v !== '')
              ),
              feedbackLog: [...(updatedLead.feedbackLog || []), entry],
            };
          } else {
            updatedLead = {
              ...updatedLead,
              feedbackLog: [...(updatedLead.feedbackLog || []), entry],
            };
          }

          updatedLeads[leadIdx] = updatedLead;
          updated[msgIdx] = { ...msg, leadsFound: updatedLeads };
        }
        return updated;
      });
    } catch {
      this.snackBar.open('Failed to reach AI, try again', '', { duration: 3000 });
    } finally {
      this.leadChatSendingKey.set(null);
    }
  }


  // ── Research Chat ──
  researchSessions = signal<ResearchSession[]>([]);
  showArchivedSessions = signal(false);
  filteredSessions = computed(() => {
    const sessions = this.researchSessions();
    if (this.showArchivedSessions()) return sessions;
    return sessions.filter((s) => !s.archived);
  });
  activeSessionId = signal<string | null>(null);
  chatHistory = signal<ResearchMessage[]>([]);
  chatInput$ = '';
  researching = signal(false);
  showAddLeadForm = signal(false);
  pendingLead = signal<ResearchLead | null>(null);

  // Manual lead form
  manualLead: Partial<SalesLead> = {};
  showManualLeadForm = signal(false);
  savingLead = signal(false);

  emailToolbar: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['ordered_list', 'bullet_list'],
    ['link'],
    ['align_left', 'align_center', 'align_right'],
    ['undo', 'redo'],
  ];

  // ── Flow ──
  flowRefreshing = signal(false);
  flowAnalyzingId = signal<string | null>(null);
  flowSnoozeLeadId = signal<string | null>(null);
  flowSnoozeDate: Date | null = null;
  flowEmailLeadId = signal<string | null>(null);
  flowEmailLead = computed(() => {
    const id = this.flowEmailLeadId();
    if (!id) return null;
    return this.leads().find((l) => l.id === id) || null;
  });
  flowEmailSubject = '';
  flowEmailBody = '';
  flowEmailInReplyTo: string | undefined;
  flowEmailEditorDoc: any = null;
  flowEmailEditor: Editor = new Editor();
  flowEmailGenerating = signal(false);
  flowEmailSending = signal(false);

  private toDate(ts: any): Date | null {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (ts instanceof Date) return ts;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  flowLeads = computed(() => {
    return this.leads()
      .filter((l) => !l.archived && l.status !== 'test' && l.status !== 'lost' && l.flow?.nextActionAt && l.flow.recommendedAction !== 'close')
      .sort((a, b) => {
        const aDate = this.toDate(a.flow?.nextActionAt);
        const bDate = this.toDate(b.flow?.nextActionAt);
        if (!aDate) return 1;
        if (!bDate) return -1;
        return aDate.getTime() - bDate.getTime();
      });
  });

  overdueFlowLeads = computed(() => {
    const unreadIds = this.unreadReplyIds();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return this.flowLeads().filter((l) => {
      if (unreadIds.has(l.id)) return false;
      const d = this.toDate(l.flow?.nextActionAt);
      return d && d < startOfToday;
    });
  });

  todayFlowLeads = computed(() => {
    const unreadIds = this.unreadReplyIds();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86400000);
    return this.flowLeads().filter((l) => {
      if (unreadIds.has(l.id)) return false;
      const d = this.toDate(l.flow?.nextActionAt);
      return d && d >= startOfToday && d < endOfToday;
    });
  });

  upcomingFlowLeads = computed(() => {
    const unreadIds = this.unreadReplyIds();
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return this.flowLeads().filter((l) => {
      if (unreadIds.has(l.id)) return false;
      const d = this.toDate(l.flow?.nextActionAt);
      return d && d >= endOfToday;
    });
  });

  flowStats = computed(() => {
    return {
      overdue: this.overdueFlowLeads().length,
      today: this.todayFlowLeads().length,
      upcoming: this.upcomingFlowLeads().length,
      total: this.flowLeads().length,
    };
  });

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

  async refreshAllFlow() {
    this.flowRefreshing.set(true);
    try {
      const result = await this.service.refreshAllLeadFlow();
      this.snackBar.open(`Analyzed ${result.analyzed} leads${result.failed ? `, ${result.failed} failed` : ''}`, '', { duration: 3000 });
    } catch {
      this.snackBar.open('Failed to refresh flow', '', { duration: 3000 });
    } finally {
      this.flowRefreshing.set(false);
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

  executeFlowAction(lead: SalesLead) {
    if (lead.flow?.recommendedAction === 'call') {
      if (lead.phone) {
        window.open(`tel:${lead.phone}`, '_self');
        this.service.addNote(lead.id, `Call initiated to ${lead.phone}`).catch(() => {});
      } else {
        this.openLeadDetail(lead);
      }
    } else {
      this.flowEmailLeadId.set(lead.id);
      this.flowEmailSubject = '';
      this.flowEmailBody = '';
      this.flowEmailInReplyTo = undefined;
      this.flowEmailEditorDoc = toDoc('', schema);
      this.generateFlowEmail(lead);
    }
  }

  async generateFlowEmail(lead: SalesLead) {
    this.flowEmailGenerating.set(true);
    try {
      const context = lead.flow?.suggestedContent || undefined;
      const result = await this.service.generateEmail(lead.id, context);
      this.flowEmailSubject = result.subject;
      this.flowEmailBody = result.bodyHtml;
      this.flowEmailInReplyTo = result.inReplyTo;
      this.flowEmailEditorDoc = toDoc(result.bodyHtml || '', schema);
    } catch {
      this.snackBar.open('Failed to generate email', '', { duration: 3000 });
    } finally {
      this.flowEmailGenerating.set(false);
    }
  }

  onFlowEmailEditorChange(doc: any) {
    this.flowEmailEditorDoc = doc;
    this.flowEmailBody = toHTML(doc, schema);
  }

  async sendFlowEmail() {
    const leadId = this.flowEmailLeadId();
    if (!leadId || !this.flowEmailSubject) return;
    const html = toHTML(this.flowEmailEditorDoc, schema);
    if (!html || html === '<p></p>') return;
    this.flowEmailSending.set(true);
    try {
      await this.service.sendEmail(leadId, this.flowEmailSubject, html, this.flowEmailInReplyTo);
      this.flowEmailLeadId.set(null);
      this.snackBar.open('Email sent', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to send email', '', { duration: 3000 });
    } finally {
      this.flowEmailSending.set(false);
    }
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

  // ── Consultation ──
  generatingConsultationId = signal<string | null>(null);

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

  ngOnInit() {
    const initialView = this.route.snapshot.queryParamMap.get('view') as ViewMode | null;
    if (initialView && ['research', 'leads', 'flow'].includes(initialView)) {
      this.view.set(initialView);
    }

    this.subs.push(
      this.service.getLeads().subscribe((leads) => {
        this.leads.set(leads);
      }),
      this.service.getResearchSessions().subscribe((sessions) => this.researchSessions.set(sessions))
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    this.flowEmailEditor.destroy();
  }

  // ── Navigation ──

  switchView(v: ViewMode) {
    this.view.set(v);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: v },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  openLeadDetail(lead: SalesLead) {
    this.router.navigate(['/account/support/sales-leads', lead.id]);
  }

  // ── Pipeline Actions ──

  async changeStatus(lead: SalesLead, newStatus: SalesLeadStatus) {
    try {
      await this.service.updateLead(lead.id, { status: newStatus });
      this.snackBar.open(`Status updated to ${newStatus}`, '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to update status', '', { duration: 3000 });
    }
  }

  async deleteLead(lead: SalesLead) {
    if (!confirm(`Delete lead "${lead.businessName}"? This cannot be undone.`)) return;
    try {
      await this.service.deleteLead(lead.id);
      this.snackBar.open('Lead deleted', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to delete lead', '', { duration: 3000 });
    }
  }

  // ── Archive ──

  async archiveLead(lead: SalesLead) {
    const archive = !lead.archived;
    try {
      await this.service.archiveLead(lead.id, archive);
      this.snackBar.open(archive ? 'Lead archived' : 'Lead unarchived', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to archive lead', '', { duration: 3000 });
    }
  }

  async archiveSession(session: ResearchSession, event: Event) {
    event.stopPropagation();
    const archive = !session.archived;
    try {
      await this.service.archiveSession(session.id, archive);
      if (archive && this.activeSessionId() === session.id) {
        this.startNewSession();
      }
      this.snackBar.open(archive ? 'Session archived' : 'Session unarchived', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to archive session', '', { duration: 3000 });
    }
  }

  // ── Manual Lead ──

  openManualLeadForm() {
    this.manualLead = { source: 'manual' } as any;
    this.showManualLeadForm.set(true);
  }

  async saveManualLead() {
    if (!this.manualLead.contactName || !this.manualLead.email || !this.manualLead.phone || !this.manualLead.businessName) {
      this.snackBar.open('All four required fields must be filled', '', { duration: 3000 });
      return;
    }
    this.savingLead.set(true);
    try {
      await this.service.createLead(this.manualLead);
      this.showManualLeadForm.set(false);
      this.snackBar.open('Lead created', '', { duration: 2000 });
    } catch (e: any) {
      this.snackBar.open(e?.message || 'Failed to create lead', '', { duration: 3000 });
    } finally {
      this.savingLead.set(false);
    }
  }

  // ── Research Chat ──

  async sendResearchMessage() {
    const message = this.chatInput$.trim();
    if (!message || this.researching()) return;

    this.chatInput$ = '';
    const sessionId = this.activeSessionId();

    this.chatHistory.update((h) => [
      ...h,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
    ]);

    this.researching.set(true);
    this.scrollChat();

    try {
      const result = await this.service.research(message, sessionId || undefined);

      this.activeSessionId.set(result.sessionId);

      this.chatHistory.update((h) => [
        ...h,
        {
          role: 'assistant',
          content: result.reply,
          leadsFound: result.leads || [],
          timestamp: new Date().toISOString(),
        },
      ]);

      this.scrollChat();
    } catch {
      this.chatHistory.update((h) => [
        ...h,
        {
          role: 'assistant',
          content: 'Something went wrong. Try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      this.researching.set(false);
    }
  }

  loadSession(session: ResearchSession) {
    if (this.editingSessionId()) return;
    this.activeSessionId.set(session.id);
    this.chatHistory.set(session.messages || []);
    this.scrollChat();
  }

  startNewSession() {
    this.activeSessionId.set(null);
    this.chatHistory.set([]);
  }

  // ── Session Title Editing ──
  editingSessionId = signal<string | null>(null);
  editingSessionTitle = '';

  startEditingSession(session: ResearchSession, event: Event) {
    event.stopPropagation();
    this.editingSessionId.set(session.id);
    this.editingSessionTitle = session.title || session.messages?.[0]?.content?.substring(0, 50) || '';
    setTimeout(() => {
      const input = document.querySelector('.session-title-input') as HTMLInputElement;
      input?.focus();
      input?.select();
    });
  }

  async saveSessionTitle(sessionId: string) {
    const title = this.editingSessionTitle.trim();
    this.editingSessionId.set(null);
    if (!title) return;
    try {
      await this.service.renameSession(sessionId, title);
    } catch {
      this.snackBar.open('Failed to rename session', '', { duration: 3000 });
    }
  }

  cancelSessionEdit() {
    this.editingSessionId.set(null);
  }

  getPipelineLead(researchLead: ResearchLead): SalesLead | null {
    if (!researchLead.businessName) return null;
    return this.leadsByBizName().get(researchLead.businessName.toLowerCase()) || null;
  }

  async addResearchLeadToPipeline(lead: ResearchLead) {
    if (!lead.businessName?.trim()) {
      this.snackBar.open('Business name is required', '', { duration: 3000 });
      return;
    }
    this.savingLead.set(true);
    try {
      await this.service.createLead({
        contactName: lead.contactName || '',
        email: lead.email || '',
        phone: lead.phone || '',
        businessName: lead.businessName,
        website: lead.website,
        industry: lead.industry,
        city: lead.city,
        state: lead.state,
        source: 'ai_research',
        researchSessionId: this.activeSessionId() || undefined,
        employeeEstimate: lead.employeeEstimate,
        yearEstablished: lead.yearEstablished,
        fitReason: lead.fitReason,
        bestContactMethod: lead.bestContactMethod,
        verificationSignals: lead.verificationSignals,
      } as any);
      this.snackBar.open(`${lead.businessName} added to leads`, '', { duration: 2000 });
    } catch (e: any) {
      this.snackBar.open(e?.message || 'Failed to add lead', '', { duration: 3000 });
    } finally {
      this.savingLead.set(false);
    }
  }

  handleChatKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendResearchMessage();
    }
  }

  private scrollChat() {
    setTimeout(() => {
      const el = this.chatMessages?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  // ── Backfill ──

  backfilling = signal(false);

  async backfillLeads() {
    this.backfilling.set(true);
    try {
      const result = await this.service.backfillLeadsFromTeams();
      this.snackBar.open(
        `Backfill done: ${result.created} created, ${result.updated} updated, ${result.skippedAlreadyLinked} already linked, ${result.errors} errors`,
        'OK',
        { duration: 10000 }
      );
    } catch (err: any) {
      this.snackBar.open(`Backfill failed: ${err.message || err}`, 'OK', { duration: 5000 });
    } finally {
      this.backfilling.set(false);
    }
  }

  // ── Stat Chip Filters ──

  clearStatFilters() {
    this.statusFilter.set('all');
    this.trialFilter.set(false);
  }

  toggleStatusChip(status: SalesLeadStatus) {
    this.trialFilter.set(false);
    if (this.statusFilter() === status) {
      this.statusFilter.set('all');
    } else {
      this.statusFilter.set(status);
    }
  }

  async toggleTrialChip() {
    const newValue = !this.trialFilter();
    this.trialFilter.set(newValue);
    if (newValue) {
      this.statusFilter.set('all');
      await this.loadFreeTrialData();
    }
  }

  private async loadFreeTrialData() {
    const currentInsights = this.accountInsights();
    const leadsWithTeam = this.leads().filter((l) => l.teamId && !currentInsights.has(l.teamId!));
    if (leadsWithTeam.length === 0) return;

    this.loadingTrialData.set(true);
    try {
      const updated = new Map(currentInsights);
      await Promise.all(
        leadsWithTeam.map(async (lead) => {
          try {
            const insights = await this.service.getAccountInsights(lead.teamId!);
            updated.set(lead.teamId!, insights);
          } catch { /* skip leads whose team can't be looked up */ }
        })
      );
      this.accountInsights.set(updated);
    } finally {
      this.loadingTrialData.set(false);
    }
  }

  // ── Helpers ──

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

  isOverdue(lead: SalesLead): boolean {
    if (!lead.nextFollowUp) return false;
    const d = lead.nextFollowUp.toDate ? lead.nextFollowUp.toDate() : new Date(lead.nextFollowUp.seconds ? lead.nextFollowUp.seconds * 1000 : lead.nextFollowUp);
    return d < new Date();
  }

  encodeURIComponent(s: string): string {
    return encodeURIComponent(s);
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

  getConfidenceClass(score: number): string {
    if (score >= 70) return 'confidence-high';
    if (score >= 40) return 'confidence-medium';
    return 'confidence-low';
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

  exportLeadsCsv() {
    const leads = this.filteredLeads();
    const headers = ['Business Name', 'Contact', 'Email', 'Phone', 'Industry', 'City', 'State', 'Status', 'Source'];
    const rows = leads.map((l) => [
      l.businessName, l.contactName, l.email, l.phone,
      l.industry || '', l.city || '', l.state || '', l.status, l.source
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-leads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
