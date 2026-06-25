import { Component, inject, signal, computed, effect, untracked, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
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
  SequenceTrack,
  SequenceTrackStep,
  SequenceStepType,
  ConsultationFollowupVariant,
  AutoResearchConfig,
  AutoResearchAddMode,
  AutoResearchLogEntry,
  AgentLearnings,
  InboxEmail,
  LEAD_STATUS_OPTIONS,
} from './sales-leads.service';

type ViewMode = 'research' | 'leads' | 'flow' | 'sequences' | 'inbox';

interface InboxThread {
  lead: SalesLead;
  emails: InboxEmail[];
  latestEmail: InboxEmail;
  latestDirection: 'inbound' | 'outbound';
  hasUnread: boolean;
  unreplied: boolean;
}

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
    MatSlideToggleModule,
    NgxEditorModule,
  ],
  templateUrl: './sales-leads.component.html',
  styleUrl: './sales-leads.component.css',
  providers: [SalesLeadsService],
})
export class SalesLeadsComponent implements OnInit, OnDestroy {
  private readonly service = inject(SalesLeadsService);
  private readonly firestore = inject(Firestore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly sanitizer = inject(DomSanitizer);
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
  /** Filter by `SalesLead.createdBy` (creator uid or system keys like agent, auto_research). */
  ownerFilter = signal<string>('all');
  /** Resolved display names for Firebase uid creators (from user/{uid}). */
  createdByLabels = signal<Map<string, string>>(new Map());
  sourceFilter = signal<string>('all');
  showArchived = signal(false);
  sortBy = signal<'newest' | 'unviewed_inbound'>('newest');
  trialFilter = signal(false);
  loadingTrialData = signal(false);
  accountInsights = signal<Map<string, AccountInsights>>(new Map());

  unviewedInboundCount = computed(() =>
    this.leads().filter((l) => l.hasUnviewedInbound && !l.archived).length
  );

  /** Unread inbound count scoped to current owner filter (for Leads toolbar copy). */
  unviewedInboundCountForScope = computed(() => {
    const owner = this.ownerFilter();
    return this.leads().filter(
      (l) => l.hasUnviewedInbound && !l.archived && this.leadMatchesOwner(l, owner)
    ).length;
  });

  unreadReplyLeads = computed(() => {
    const owner = this.ownerFilter();
    return this.leads()
      .filter((l) => l.hasUnviewedInbound && !l.archived && l.status !== 'test')
      .filter((l) => this.leadMatchesOwner(l, owner))
      .sort((a, b) => (b.unviewedInboundCount || 0) - (a.unviewedInboundCount || 0));
  });

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

  freeTrialCount = computed(() => {
    const trialIds = this.freeTrialLeadIds();
    const owner = this.ownerFilter();
    if (owner === 'all') return trialIds.size;
    let n = 0;
    for (const lead of this.leads()) {
      if (!trialIds.has(lead.id)) continue;
      if (this.leadMatchesOwner(lead, owner)) n++;
    }
    return n;
  });

  /** Backend uses `ulysses` for the autonomous agent; older rows may say `agent`. */
  private static readonly CREATOR_KNOWN_LABELS: Record<string, string> = {
    ulysses: 'Ulysses (autonomous agent)',
    agent: 'Ulysses (autonomous agent)',
    auto_research: 'Auto-research',
    system: 'System (signup sync)',
  };

  /** Normalizes `createdBy` so `agent` and `ulysses` filter together. */
  private normalizeCreatedByKey(c: string | undefined | null): string {
    if (c == null || c === '') return '';
    if (c === 'agent') return 'ulysses';
    return c;
  }

  private leadMatchesOwner(lead: SalesLead, owner: string): boolean {
    if (owner === 'all') return true;
    return this.normalizeCreatedByKey(lead.createdBy) === this.normalizeCreatedByKey(owner);
  }

  /** Select options for owner filter, derived from creators present in the loaded leads list. */
  leadOwnerFilterOptions = computed(() => {
    const ids = new Set<string>();
    for (const l of this.leads()) {
      const c = l.createdBy;
      if (c) ids.add(this.normalizeCreatedByKey(c));
    }
    const labelMap = this.createdByLabels();
    const opts: { id: string; label: string }[] = [];
    for (const id of ids) {
      const label =
        SalesLeadsComponent.CREATOR_KNOWN_LABELS[id] ??
        labelMap.get(id) ??
        (id.length > 12 ? `${id.slice(0, 8)}…` : id);
      opts.push({ id, label });
    }
    opts.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return opts;
  });

  filteredLeads = computed(() => {
    let result = this.leads();
    const q = this.searchQuery().toLowerCase();
    const status = this.statusFilter();
    const source = this.sourceFilter();
    const owner = this.ownerFilter();

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
    if (owner !== 'all') {
      result = result.filter((l) => this.leadMatchesOwner(l, owner));
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

  /** Summary chips: counts respect the owner filter (non-archived only). */
  pipelineStats = computed(() => {
    const owner = this.ownerFilter();
    const all = this.leads().filter(
      (l) => !l.archived && this.leadMatchesOwner(l, owner)
    );
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

  private pendingLeadCreatorUidFetch = new Set<string>();

  /** Display label for a lead's creator (for UI). */
  getLeadOwnerLabel(lead: SalesLead): string {
    const raw = lead.createdBy || '';
    if (!raw) return 'Unknown';
    const key = this.normalizeCreatedByKey(raw);
    return (
      SalesLeadsComponent.CREATOR_KNOWN_LABELS[key] ??
      SalesLeadsComponent.CREATOR_KNOWN_LABELS[raw] ??
      this.createdByLabels().get(raw) ??
      (raw.length > 12 ? `${raw.slice(0, 8)}…` : raw)
    );
  }

  private async resolveLeadCreatorLabels(leads: SalesLead[]) {
    const known = new Set(Object.keys(SalesLeadsComponent.CREATOR_KNOWN_LABELS));
    const uidPattern = /^[a-zA-Z0-9]{20,}$/;
    const toResolve: string[] = [];
    for (const l of leads) {
      const c = l.createdBy;
      if (!c || known.has(c) || !uidPattern.test(c)) continue;
      if (this.createdByLabels().has(c) || this.pendingLeadCreatorUidFetch.has(c)) continue;
      toResolve.push(c);
    }
    const unique = [...new Set(toResolve)];
    for (const uid of unique) {
      this.pendingLeadCreatorUidFetch.add(uid);
    }
    await Promise.all(
      unique.map(async (uid) => {
        try {
          const snap = await getDoc(doc(this.firestore, 'user', uid));
          const name = (snap.data()?.['name'] as string | undefined)?.trim();
          const email = snap.data()?.['email'] as string | undefined;
          const label = name || email || `${uid.slice(0, 8)}…`;
          const next = new Map(this.createdByLabels());
          next.set(uid, label);
          this.createdByLabels.set(next);
        } finally {
          this.pendingLeadCreatorUidFetch.delete(uid);
        }
      })
    );
  }

  flowLeads = computed(() => {
    const owner = this.ownerFilter();
    return this.leads()
      .filter((l) => !l.archived && l.status !== 'test' && l.status !== 'lost' && l.flow?.nextActionAt && l.flow.recommendedAction !== 'close')
      .filter((l) => this.leadMatchesOwner(l, owner))
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

  // ── Sequences ──
  sequenceTracks = signal<SequenceTrack[]>([]);
  selectedTrackId = signal<string | null>(null);
  selectedStepIndex = signal<number>(-1);
  seqEditor: Editor = new Editor();
  seqEditorDoc: any = null;
  private defaultTrackSeeded = false;

  selectedTrack = computed(() => {
    const id = this.selectedTrackId();
    if (!id) return null;
    return this.sequenceTracks().find((t) => t.id === id) || null;
  });

  selectTrack(track: SequenceTrack) {
    this.selectedTrackId.set(track.id);
    this.selectedStepIndex.set(-1);
    this.seqEditorDoc = null;
  }

  selectStep(index: number) {
    this.selectedStepIndex.set(index);
    const track = this.selectedTrack();
    if (track && track.steps[index]?.type === 'email') {
      const html = track.steps[index].bodyHtml || '';
      this.seqEditorDoc = toDoc(html, schema);
    } else {
      this.seqEditorDoc = null;
    }
  }

  async createNewTrack() {
    try {
      const id = await this.service.createSequenceTrack({
        name: 'New Sequence',
        steps: [],
      });
      this.selectedTrackId.set(id);
      this.selectedStepIndex.set(-1);
    } catch {
      this.snackBar.open('Failed to create sequence', '', { duration: 3000 });
    }
  }

  async deleteTrack(track: SequenceTrack, event: Event) {
    event.stopPropagation();
    if (!confirm(`Delete "${track.name}"? This cannot be undone.`)) return;
    try {
      await this.service.deleteSequenceTrack(track.id);
      if (this.selectedTrackId() === track.id) {
        this.selectedTrackId.set(null);
        this.selectedStepIndex.set(-1);
      }
      this.snackBar.open('Sequence deleted', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to delete sequence', '', { duration: 3000 });
    }
  }

  async saveTrackName(track: SequenceTrack, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === track.name) return;
    try {
      await this.service.updateSequenceTrack(track.id, { name: trimmed });
    } catch {
      this.snackBar.open('Failed to rename sequence', '', { duration: 3000 });
    }
  }

  async addStep(track: SequenceTrack, type: SequenceStepType) {
    const newStep: SequenceTrackStep = {
      type,
      delayDays: track.steps.length === 0 ? 0 : (type === 'consultation_followup' ? 7 : 3),
      ...(type === 'email' ? { subject: '', bodyHtml: '' } : {}),
      ...(type === 'call' ? { callNotes: '' } : {}),
      ...(type === 'consultation_followup' ? { followupVariant: 'auto' as ConsultationFollowupVariant } : {}),
    };
    const updatedSteps = [...track.steps, newStep];
    try {
      await this.service.updateSequenceTrack(track.id, { steps: updatedSteps });
      this.selectStep(updatedSteps.length - 1);
    } catch {
      this.snackBar.open('Failed to add step', '', { duration: 3000 });
    }
  }

  async updateStepFollowupVariant(track: SequenceTrack, index: number, variant: ConsultationFollowupVariant) {
    const updatedSteps = [...track.steps];
    updatedSteps[index] = { ...updatedSteps[index], followupVariant: variant };
    await this.service.updateSequenceTrack(track.id, { steps: updatedSteps });
  }

  getFollowupVariantLabel(variant?: ConsultationFollowupVariant): string {
    switch (variant) {
      case 'auto': return 'Auto (video if viewed, obligation if not)';
      case 'w2': return 'Second obligation (non-viewers only)';
      default: return 'Auto';
    }
  }

  getStepTypeIcon(type: SequenceStepType): string {
    switch (type) {
      case 'email': return 'email';
      case 'call': return 'phone';
      case 'consultation_followup': return 'assignment_turned_in';
    }
  }

  getStepTypeLabel(type: SequenceStepType): string {
    switch (type) {
      case 'email': return 'Email';
      case 'call': return 'Call';
      case 'consultation_followup': return 'Report Follow-Up';
    }
  }

  async removeStep(track: SequenceTrack, index: number, event: Event) {
    event.stopPropagation();
    const updatedSteps = track.steps.filter((_, i) => i !== index);
    try {
      await this.service.updateSequenceTrack(track.id, { steps: updatedSteps });
      if (this.selectedStepIndex() === index) {
        this.selectedStepIndex.set(-1);
        this.seqEditorDoc = null;
      } else if (this.selectedStepIndex() > index) {
        this.selectedStepIndex.update((i) => i - 1);
      }
    } catch {
      this.snackBar.open('Failed to remove step', '', { duration: 3000 });
    }
  }

  async updateStepDelay(track: SequenceTrack, index: number, days: number) {
    if (isNaN(days) || days < 0) return;
    const updatedSteps = [...track.steps];
    updatedSteps[index] = { ...updatedSteps[index], delayDays: days };
    await this.service.updateSequenceTrack(track.id, { steps: updatedSteps });
  }

  async updateStepField(track: SequenceTrack, index: number, field: string, value: string) {
    const updatedSteps = [...track.steps];
    updatedSteps[index] = { ...updatedSteps[index], [field]: value };
    await this.service.updateSequenceTrack(track.id, { steps: updatedSteps });
  }

  onSeqEditorChange(track: SequenceTrack, index: number, doc: any) {
    this.seqEditorDoc = doc;
    const html = toHTML(doc, schema);
    const updatedSteps = [...track.steps];
    updatedSteps[index] = { ...updatedSteps[index], bodyHtml: html };
    this.service.updateSequenceTrack(track.id, { steps: updatedSteps });
  }

  insertTrackedLink(url: string, label: string) {
    const track = this.selectedTrack();
    const stepIndex = this.selectedStepIndex();
    if (!track || stepIndex < 0) return;

    const step = track.steps[stepIndex];
    if (step?.type !== 'email') return;

    const linkHtml = `<a href="${url}">${label}</a>`;
    const currentHtml = step.bodyHtml || '';
    const updatedHtml = currentHtml.replace(/<\/p>\s*$/, ` ${linkHtml}</p>`) || linkHtml;

    const updatedSteps = [...track.steps];
    updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], bodyHtml: updatedHtml };
    this.service.updateSequenceTrack(track.id, { steps: updatedSteps });
    this.seqEditorDoc = toDoc(updatedHtml, schema);
  }

  private async seedMissingDefaultTracks(existing: SequenceTrack[]) {
    const existingNames = new Set(existing.map((t) => t.name));
    const toCreate: { name: string; steps: SequenceTrackStep[] }[] = [];

    if (!existingNames.has('Standard Outreach')) {
      toCreate.push({
        name: 'Standard Outreach',
        steps: [
          {
            type: 'email',
            delayDays: 0,
            subject: 'Quick question about OSHA compliance',
            bodyHtml: `<p>Hi {companyName},</p>
<p>Quick question: how are you handling OSHA compliance right now?</p>
<p>Fines can hit $15k+ per violation, and most companies don't realize they're exposed until it's too late.</p>
<p>We built ComplianceChimp to make it simple:</p>
<ul>
<li>Track employee training</li>
<li>Run safety inspections</li>
<li>Log incidents + OSHA records</li>
<li>Keep everything in one place</li>
</ul>
<p>It's free to use right now, no contracts, no credit card.</p>
<p>Most teams get organized in just a few days.</p>
<p>Worth a quick 10-minute look?</p>
<p>Ryan</p>`,
          },
          {
            type: 'call',
            delayDays: 3,
            callNotes: 'First follow-up call. Reference the email sent a few days ago. Ask if they saw it and if OSHA compliance is something on their radar. Keep it casual.',
          },
          {
            type: 'email',
            delayDays: 1,
            subject: 'Following up on OSHA compliance',
            bodyHtml: `<p>Hi {companyName},</p>
<p>Just wanted to follow up: are you currently handling OSHA compliance internally or using a system?</p>
<p>Most companies we talk to are surprised how much easier it is once everything (training, inspections, logs) is in one place.</p>
<p>ComplianceChimp is free to use right now, no contracts.</p>
<p>Open to a quick 10-minute look?</p>
<p>Ryan</p>`,
          },
          {
            type: 'call',
            delayDays: 3,
            callNotes: 'Second follow-up call. This is the last call attempt. Mention you\'ll send one more email. Gauge interest level.',
          },
          {
            type: 'email',
            delayDays: 1,
            subject: 'Should I close this out?',
            bodyHtml: `<p>Hi {companyName},</p>
<p>Not sure if this is a priority right now. Should I close this out?</p>
<p>If OSHA compliance (training, inspections, logs) ever becomes something you want to simplify, happy to show you ComplianceChimp.</p>
<p>Either way, appreciate your time.</p>
<p>Ryan</p>`,
          },
        ],
      });
    }

    if (!existingNames.has('Report Follow-Up')) {
      toCreate.push({
        name: 'Report Follow-Up',
        steps: [
          {
            type: 'consultation_followup',
            delayDays: 7,
            followupVariant: 'auto',
          },
          {
            type: 'consultation_followup',
            delayDays: 7,
            followupVariant: 'w2',
          },
        ],
      });
    }

    if (toCreate.length === 0) return;

    try {
      await Promise.all(toCreate.map((t) => this.service.createSequenceTrack(t)));
    } catch {
      // ignore - may have already been created
    }
  }

  // ── Inbox ──
  inboxEmails = signal<InboxEmail[]>([]);
  inboxFilter = signal<'all' | 'unreplied' | 'unread'>('all');
  expandedInboxLeadId = signal<string | null>(null);

  inboxThreads = computed(() => {
    const emails = this.inboxEmails();
    const leads = this.leads();
    const leadsMap = new Map(leads.map(l => [l.id, l]));

    const groups = new Map<string, InboxEmail[]>();
    for (const email of emails) {
      const existing = groups.get(email.leadId) || [];
      existing.push(email);
      groups.set(email.leadId, existing);
    }

    const threads: InboxThread[] = [];
    for (const [leadId, leadEmails] of groups) {
      const lead = leadsMap.get(leadId);
      if (!lead || lead.archived) continue;

      const sorted = [...leadEmails].sort((a, b) => {
        const aDate = this.toDate(a.createdAt);
        const bDate = this.toDate(b.createdAt);
        return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
      });

      const latest = sorted[0];
      const latestDirection: 'inbound' | 'outbound' = latest.type === 'email_received' ? 'inbound' : 'outbound';

      threads.push({
        lead,
        emails: sorted,
        latestEmail: latest,
        latestDirection,
        hasUnread: !!lead.hasUnviewedInbound,
        unreplied: latestDirection === 'inbound',
      });
    }

    threads.sort((a, b) => {
      if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
      const aDate = this.toDate(a.latestEmail.createdAt);
      const bDate = this.toDate(b.latestEmail.createdAt);
      return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
    });

    return threads;
  });

  filteredInboxThreads = computed(() => {
    const threads = this.inboxThreads();
    const filter = this.inboxFilter();
    switch (filter) {
      case 'unreplied': return threads.filter(t => t.unreplied);
      case 'unread': return threads.filter(t => t.hasUnread);
      default: return threads;
    }
  });

  inboxStats = computed(() => {
    const threads = this.inboxThreads();
    return {
      total: threads.length,
      unread: threads.filter(t => t.hasUnread).length,
      unreplied: threads.filter(t => t.unreplied).length,
    };
  });

  toggleInboxThread(thread: InboxThread) {
    if (this.expandedInboxLeadId() === thread.lead.id) {
      this.expandedInboxLeadId.set(null);
    } else {
      this.expandedInboxLeadId.set(thread.lead.id);
      if (thread.hasUnread) {
        this.service.markInboundViewed(thread.lead.id).catch(() => {});
      }
    }
  }

  // ── Auto-Research ──
  autoResearchConfig = signal<AutoResearchConfig | null>(null);
  autoResearchSaving = signal(false);
  autoResearchLog = signal<AutoResearchLogEntry[]>([]);
  agentLearnings = signal<AgentLearnings | null>(null);
  showAutoResearchLog = signal(false);
  showAgentInsights = signal(false);
  showAutoResearchSetup = signal(false);
  targetIndustryInput = '';

  readonly leadsPerDayOptions = [10, 20, 50, 100];
  readonly addModeOptions: { value: AutoResearchAddMode; label: string; icon: string }[] = [
    { value: 'agent', label: 'Ulysses decides', icon: 'pets' },
    { value: 'just_add', label: 'Just Add to Leads', icon: 'person_add' },
    { value: 'compliance_report', label: 'Add & Send Compliance Report', icon: 'assignment' },
    { value: 'sequence', label: 'Add to Sequence', icon: 'linear_scale' },
  ];

  readonly companySizeOptions = [
    { value: '', label: 'Any size (10-250)' },
    { value: '10-25', label: '10-25 employees' },
    { value: '25-50', label: '25-50 employees' },
    { value: '50-100', label: '50-100 employees' },
    { value: '100-250', label: '100-250 employees' },
  ];

  readonly industryPresets = [
    'Construction', 'Roofing', 'HVAC', 'Plumbing', 'Electrical',
    'Manufacturing', 'Warehousing', 'Landscaping', 'Auto Repair',
    'Welding/Fabrication', 'General Contracting', 'Painting',
    'Demolition', 'Concrete', 'Flooring', 'Masonry',
  ];

  readonly statePresets = [
    'TX', 'CA', 'FL', 'OH', 'PA', 'IL', 'GA', 'NC', 'MI', 'NJ',
    'NY', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI',
    'CO', 'MN', 'SC', 'AL', 'LA', 'KY', 'OR', 'OK', 'CT', 'UT',
  ];

  async toggleAutoResearch(enabled: boolean) {
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateAutoResearchConfig({ enabled });
      this.snackBar.open(enabled ? 'Auto-research activated' : 'Auto-research stopped', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to update auto-research', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  // ── Per-Session Auto-Research ──

  async startNewAgentSession() {
    this.autoResearchSaving.set(true);
    try {
      const sessionId = await this.service.createAgentSession({
        leadsPerDay: 10,
        addMode: 'agent',
      });
      this.activeSessionId.set(sessionId);
      this.chatHistory.set([]);
      this.snackBar.open('Ulysses session created. Configure targeting and hit Activate.', '', { duration: 4000 });
    } catch {
      this.snackBar.open('Failed to create session', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  private async updateSessionConfig(updates: Partial<AutoResearchConfig>) {
    const sessionId = this.activeSessionId();
    if (!sessionId) return;
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateSessionAutoResearch(sessionId, updates);
    } catch {
      this.snackBar.open('Failed to update session config', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  setSessionLeadsPerDay(leadsPerDay: number) {
    this.updateSessionConfig({ leadsPerDay });
  }

  setSessionAddMode(addMode: AutoResearchAddMode) {
    this.updateSessionConfig({ addMode });
  }

  setSessionSequence(sequenceTrackId: string) {
    this.updateSessionConfig({ sequenceTrackId });
  }

  setSessionCompanySize(targetCompanySize: string) {
    this.updateSessionConfig({ targetCompanySize });
  }

  toggleSessionIndustry(industry: string) {
    const current = this.activeSession()?.autoResearch?.targetIndustries || [];
    const updated = current.includes(industry)
      ? current.filter((i) => i !== industry)
      : [...current, industry];
    this.updateSessionConfig({ targetIndustries: updated } as any);
  }

  addSessionCustomIndustry() {
    const val = this.targetIndustryInput.trim();
    if (!val) return;
    const current = this.activeSession()?.autoResearch?.targetIndustries || [];
    if (!current.includes(val)) {
      this.updateSessionConfig({ targetIndustries: [...current, val] } as any);
    }
    this.targetIndustryInput = '';
  }

  toggleSessionState(state: string) {
    const current = this.activeSession()?.autoResearch?.targetStates || [];
    const updated = current.includes(state)
      ? current.filter((s) => s !== state)
      : [...current, state];
    this.updateSessionConfig({ targetStates: updated } as any);
  }

  async activateSessionAutoResearch() {
    const sessionId = this.activeSessionId();
    if (!sessionId) return;
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateSessionAutoResearch(sessionId, { enabled: true });
      this.snackBar.open('Ulysses activated. First run within 2 hours.', '', { duration: 4000 });
    } catch {
      this.snackBar.open('Failed to activate Ulysses', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  async convertToAgentSession() {
    const sessionId = this.activeSessionId();
    if (!sessionId) return;
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateSessionAutoResearch(sessionId, {
        leadsPerDay: 10,
        addMode: 'agent',
      } as any);
      this.snackBar.open('Session converted. Configure targeting and hit Activate.', '', { duration: 4000 });
    } catch {
      this.snackBar.open('Failed to convert session', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  async stopSessionAutoResearch() {
    const sessionId = this.activeSessionId();
    if (!sessionId) return;
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateSessionAutoResearch(sessionId, { enabled: false });
      this.snackBar.open('Ulysses stopped.', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to stop Ulysses', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  async setLeadsPerDay(leadsPerDay: number) {
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateAutoResearchConfig({ leadsPerDay });
    } catch {
      this.snackBar.open('Failed to update leads per day', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  async setAddMode(addMode: AutoResearchAddMode) {
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateAutoResearchConfig({ addMode });
    } catch {
      this.snackBar.open('Failed to update add mode', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  async setAutoResearchSequence(sequenceTrackId: string) {
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateAutoResearchConfig({ sequenceTrackId });
    } catch {
      this.snackBar.open('Failed to update sequence', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  async setTargetCompanySize(targetCompanySize: string) {
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateAutoResearchConfig({ targetCompanySize });
    } catch {
      this.snackBar.open('Failed to update company size', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  async toggleTargetIndustry(industry: string) {
    const current = this.autoResearchConfig()?.targetIndustries || [];
    const updated = current.includes(industry)
      ? current.filter((i) => i !== industry)
      : [...current, industry];
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateAutoResearchConfig({ targetIndustries: updated } as any);
    } catch {
      this.snackBar.open('Failed to update industries', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  async addCustomIndustry() {
    const val = this.targetIndustryInput.trim();
    if (!val) return;
    const current = this.autoResearchConfig()?.targetIndustries || [];
    if (current.includes(val)) { this.targetIndustryInput = ''; return; }
    this.targetIndustryInput = '';
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateAutoResearchConfig({ targetIndustries: [...current, val] } as any);
    } catch {
      this.snackBar.open('Failed to add industry', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  async toggleTargetState(state: string) {
    const current = this.autoResearchConfig()?.targetStates || [];
    const updated = current.includes(state)
      ? current.filter((s) => s !== state)
      : [...current, state];
    this.autoResearchSaving.set(true);
    try {
      await this.service.updateAutoResearchConfig({ targetStates: updated } as any);
    } catch {
      this.snackBar.open('Failed to update states', '', { duration: 3000 });
    } finally {
      this.autoResearchSaving.set(false);
    }
  }

  formatLogTime(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 1) {
      const mins = Math.floor(diffMs / 60000);
      return mins < 1 ? 'just now' : `${mins}m ago`;
    }
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
    if (initialView && ['research', 'leads', 'flow', 'sequences', 'inbox'].includes(initialView)) {
      this.view.set(initialView);
    }

    this.subs.push(
      this.service.getLeads().subscribe((leads) => {
        this.leads.set(leads);
        const owner = this.ownerFilter();
        if (
          owner !== 'all' &&
          !leads.some((l) => this.leadMatchesOwner(l, owner))
        ) {
          this.ownerFilter.set('all');
        }
        void this.resolveLeadCreatorLabels(leads);
      }),
      this.service.getResearchSessions().subscribe((sessions) => this.researchSessions.set(sessions)),
      this.service.getSequenceTracks().subscribe((tracks) => {
        this.sequenceTracks.set(tracks);
        if (!this.defaultTrackSeeded) {
          this.defaultTrackSeeded = true;
          this.seedMissingDefaultTracks(tracks);
        }
      }),
      this.service.getAutoResearchConfig().subscribe((config) => {
        this.autoResearchConfig.set(config || null);
      }),
      this.service.getAutoResearchLog().subscribe((log) => {
        this.autoResearchLog.set(log);
      }),
      this.service.getAgentLearnings().subscribe((learnings) => {
        this.agentLearnings.set(learnings);
      }),
      this.service.getInboxEmails().subscribe((emails) => {
        this.inboxEmails.set(emails);
      })
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    this.flowEmailEditor.destroy();
    this.seqEditor.destroy();
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

  activeSession = computed(() => {
    const id = this.activeSessionId();
    if (!id) return null;
    return this.researchSessions().find((s) => s.id === id) || null;
  });

  private syncChatFromFirestore = effect(() => {
    const session = this.activeSession();
    if (!session?.messages) return;
    const firestoreLen = session.messages.length;
    const localLen = untracked(() => this.chatHistory().length);
    if (firestoreLen > localLen) {
      this.chatHistory.set(session.messages);
      this.scrollChat();
    }
  }, { allowSignalWrites: true });

  getAgentActionForLead(lead: ResearchLead): { action: string; reason: string; emailSubject?: string } | null {
    const session = this.activeSession();
    if (!session?.agentActions) return null;
    const match = session.agentActions.find(
      (a) => a.businessName?.toLowerCase() === lead.businessName?.toLowerCase()
    );
    return match || null;
  }

  getAgentActionIcon(action: string): string {
    switch (action) {
      case 'email_sent': return 'send';
      case 'sequence_started': return 'linear_scale';
      case 'compliance_report': return 'assignment';
      case 'flagged_for_call': return 'phone';
      case 'added_only': return 'person_add';
      default: return 'smart_toy';
    }
  }

  getAgentActionLabel(action: string): string {
    switch (action) {
      case 'email_sent': return 'Email sent';
      case 'sequence_started': return 'Sequence started';
      case 'compliance_report': return 'Report sent';
      case 'flagged_for_call': return 'Needs call';
      case 'added_only': return 'Added';
      default: return action;
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
    if (researchLead.pipelineLeadId) {
      const byId = this.leads().find((l) => l.id === researchLead.pipelineLeadId);
      if (byId) return byId;
    }
    if (!researchLead.businessName) return null;
    return this.leadsByBizName().get(researchLead.businessName.toLowerCase()) || null;
  }

  async addResearchLeadToPipeline(lead: ResearchLead, msgIdx: number, leadIdx: number) {
    if (!lead.businessName?.trim()) {
      this.snackBar.open('Business name is required', '', { duration: 3000 });
      return;
    }
    this.savingLead.set(true);
    try {
      const result = await this.service.createLead({
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
        googleMapsUrl: lead.googleMapsUrl,
        verificationSignals: lead.verificationSignals,
      } as any);

      this.chatHistory.update((history) => {
        const updated = [...history];
        const msg = updated[msgIdx];
        if (msg?.leadsFound?.[leadIdx]) {
          const updatedLeads = [...msg.leadsFound];
          updatedLeads[leadIdx] = { ...updatedLeads[leadIdx], pipelineLeadId: result.id };
          updated[msgIdx] = { ...msg, leadsFound: updatedLeads };
        }
        return updated;
      });

      this.snackBar.open(`${lead.businessName} added to leads`, '', { duration: 2000 });
    } catch (e: any) {
      this.snackBar.open(e?.message || 'Failed to add lead', '', { duration: 3000 });
    } finally {
      this.savingLead.set(false);
    }
  }

  async addLeadAndSendReport(lead: ResearchLead, msgIdx: number, leadIdx: number) {
    if (!lead.businessName?.trim()) {
      this.snackBar.open('Business name is required', '', { duration: 3000 });
      return;
    }
    this.savingLead.set(true);
    try {
      const result = await this.service.createLead({
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
        googleMapsUrl: lead.googleMapsUrl,
        verificationSignals: lead.verificationSignals,
      } as any);

      this.chatHistory.update((history) => {
        const updated = [...history];
        const msg = updated[msgIdx];
        if (msg?.leadsFound?.[leadIdx]) {
          const updatedLeads = [...msg.leadsFound];
          updatedLeads[leadIdx] = { ...updatedLeads[leadIdx], pipelineLeadId: result.id };
          updated[msgIdx] = { ...msg, leadsFound: updatedLeads };
        }
        return updated;
      });

      this.service.generateConsultation(result.id).catch(() => {});
      this.snackBar.open(`${lead.businessName} added, compliance report generating...`, '', { duration: 3000 });
    } catch (e: any) {
      this.snackBar.open(e?.message || 'Failed to add lead', '', { duration: 3000 });
    } finally {
      this.savingLead.set(false);
    }
  }

  async addLeadToSequence(lead: ResearchLead, msgIdx: number, leadIdx: number, trackId: string) {
    if (!lead.businessName?.trim()) {
      this.snackBar.open('Business name is required', '', { duration: 3000 });
      return;
    }
    this.savingLead.set(true);
    try {
      const result = await this.service.createLead({
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
        googleMapsUrl: lead.googleMapsUrl,
        verificationSignals: lead.verificationSignals,
        skipConsultation: true,
      } as any);

      this.chatHistory.update((history) => {
        const updated = [...history];
        const msg = updated[msgIdx];
        if (msg?.leadsFound?.[leadIdx]) {
          const updatedLeads = [...msg.leadsFound];
          updatedLeads[leadIdx] = { ...updatedLeads[leadIdx], pipelineLeadId: result.id };
          updated[msgIdx] = { ...msg, leadsFound: updatedLeads };
        }
        return updated;
      });

      await this.service.startLeadOnSequence(result.id, trackId);
      const trackName = this.sequenceTracks().find((t) => t.id === trackId)?.name || 'sequence';
      this.snackBar.open(`${lead.businessName} added to "${trackName}"`, '', { duration: 3000 });
    } catch (e: any) {
      this.snackBar.open(e?.message || 'Failed to add lead to sequence', '', { duration: 3000 });
    } finally {
      this.savingLead.set(false);
    }
  }

  findMoreLikeThese(msg: ResearchMessage) {
    const leads = msg.leadsFound || [];
    const industries = [...new Set(leads.map((l) => l.industry).filter(Boolean))];
    const locations = [...new Set(leads.map((l) => [l.city, l.state].filter(Boolean).join(', ')).filter(Boolean))];
    const businesses = leads.map((l) => l.businessName).filter(Boolean).slice(0, 5);

    const prompt = `Find more leads like the ones you just found. Same type of businesses: ${industries.join(', ') || 'same industries'}. Same areas: ${locations.join('; ') || 'same regions'}. Avoid duplicates with these businesses: ${businesses.join(', ')}. Return as many new leads as possible, up to 20.`;

    this.chatInput$ = prompt;
    this.sendResearchMessage();
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
    this.ownerFilter.set('all');
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

  formatTimeAgo(ts: any): string {
    const d = this.toDate(ts);
    if (!d) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60000) return 'just now';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(diffMs / 86400000);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  sanitizeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
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
