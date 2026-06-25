import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  collectionGroup,
  doc,
  docData,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  addDoc,
  arrayUnion,
  serverTimestamp,
  onSnapshot,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { map, Observable } from 'rxjs';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SalesLeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost'
  | 'test';

export type SalesLeadSource = 'manual' | 'referral' | 'signup' | (string & {});

export type ActivityType =
  | 'note'
  | 'call'
  | 'email_sent'
  | 'email_received'
  | 'status_change'
  | 'lead_created'
  | 'lead_archived'
  | 'lead_unarchived'
  | 'email_generated'
  | 'consultation_generated'
  | 'flow_snoozed'
  | 'flow_dismissed'
  | 'flow_analyzed'
  | 'account_signup'
  | 'link_clicked';

export type FlowAction = 'email' | 'call' | 'follow_up' | 'close';
export type FlowPriority = 'high' | 'medium' | 'low';

export interface LeadFlowAnalysis {
  nextActionAt?: any;
  recommendedAction?: FlowAction;
  actionReason?: string;
  suggestedContent?: string;
  priority?: FlowPriority;
  touchCount?: number;
  analyzedAt?: any;
  recommendedOwner?: string;
}

export interface SalesLead {
  id: string;
  contactName?: string;
  email?: string;
  phone?: string;
  businessName: string;
  website?: string;
  industry?: string;
  state?: string;
  city?: string;
  zip?: string;
  source: SalesLeadSource;
  status: SalesLeadStatus;
  researchSessionId?: string;
  nextFollowUp?: any;
  createdAt: any;
  updatedAt: any;
  lastContactedAt?: any;
  createdBy: string;
  employeeEstimate?: string;
  yearEstablished?: string;
  fitReason?: string;
  bestContactMethod?: ContactMethod;
  flow?: LeadFlowAnalysis;
  consultationLeadId?: string;
  consultationUrl?: string;
  consultationStatus?: 'pending' | 'generating' | 'complete' | 'failed';
  archived?: boolean;
  googleMapsUrl?: string;
  verificationSignals?: VerificationSignals;
  knowledge?: KnowledgeEntry[];
  hasUnviewedInbound?: boolean;
  unviewedInboundCount?: number;
  teamId?: string;
  sequenceTrackId?: string;
  sequenceCurrentStep?: number;
  sequenceStartedAt?: any;
  sequenceNextActionAt?: any;
  sequenceStatus?: 'active' | 'paused' | 'completed';
  linkClickCount?: number;
  lastLinkClickAt?: any;
}

export interface LeadActivity {
  id: string;
  type: ActivityType;
  content: string;
  createdAt: any;
  createdBy: string;
  actorName?: string;
  actorType?: 'user' | 'agent';
  callSid?: string;
  callDuration?: number;
  recordingUrl?: string;
  transcript?: string;
  emailSubject?: string;
  emailHtml?: string;
  emailPlainText?: string;
  senderEmail?: string;
  messageId?: string;
  fromStatus?: string;
  toStatus?: string;
  callStatus?: string;
  /** Logged from phone script flow */
  callOutcome?: string;
  phoneScriptId?: string;
  phoneScriptTitle?: string;
  scriptChoice?: 'none' | 'suggested_0' | 'suggested_1' | 'library';
  scriptDeviationNotes?: string;
}

export interface PhoneScriptSuggestion {
  title: string;
  body: string;
}

export interface PhoneLibraryScript {
  id: string;
  title: string;
  body: string;
  useCount: number;
  successCount: number;
}

export interface ResearchMessage {
  role: 'user' | 'assistant';
  content: string;
  leadsFound?: ResearchLead[];
  timestamp: string;
  uid?: string;
  userName?: string;
}

export interface LeadFeedbackEntry {
  feedback: string;
  reply: string;
  timestamp: string;
}

export interface LeadChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actorName?: string;
  actionsExecuted?: string[];
  createdAt: any;
}

export type ContactMethod = 'email' | 'phone' | 'facebook' | 'linkedin' | 'in_person' | 'website_form';

export interface VerificationSignals {
  hasGoogleListing?: boolean;
  googlePlaceId?: string;
  hasReviews?: boolean;
  recentReviews?: boolean;
  hasWebsite?: boolean;
  hasSocialMedia?: boolean;
  hasPhone?: boolean;
  lastActivityIndicator?: string;
  websiteStatus?: 'live' | 'redirect' | 'dead' | 'unchecked';
  emailVerification?: { status: string; reason: string; score?: number };
}

export type KnowledgeSource = 'research' | 'chat' | 'manual';

export interface KnowledgeEntry {
  content: string;
  source: KnowledgeSource;
  addedAt: string;
}

export interface ResearchLead {
  contactName?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  website?: string;
  industry?: string;
  city?: string;
  state?: string;
  notes?: string;
  employeeEstimate?: string;
  yearEstablished?: string;
  fitReason?: string;
  bestContactMethod?: ContactMethod;
  confidence?: number;
  googleMapsUrl?: string;
  verificationSignals?: VerificationSignals;
  feedbackLog?: LeadFeedbackEntry[];
  pipelineLeadId?: string;
}

export interface AgentAction {
  leadId: string;
  businessName: string;
  action: 'email_sent' | 'sequence_started' | 'compliance_report' | 'flagged_for_call' | 'added_only';
  reason: string;
  emailSubject?: string;
}

export interface ResearchSession {
  id: string;
  title?: string;
  messages: ResearchMessage[];
  leadsGenerated: string[];
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  archived?: boolean;
  agentRun?: boolean;
  agentActions?: AgentAction[];
  agentLearnings?: string;
  autoResearch?: AutoResearchConfig;
}

// ── Sequence Track Types ──────────────────────────────────────────────────────

export type SequenceStepType = 'email' | 'call' | 'consultation_followup';

export type ConsultationFollowupVariant = 'auto' | 'w2';

export interface SequenceTrackStep {
  type: SequenceStepType;
  delayDays: number;
  subject?: string;
  bodyHtml?: string;
  callNotes?: string;
  followupVariant?: ConsultationFollowupVariant;
}

export interface SequenceTrack {
  id: string;
  name: string;
  steps: SequenceTrackStep[];
  createdAt: any;
  updatedAt: any;
  createdBy: string;
}

export const LEAD_STATUS_OPTIONS: { value: SalesLeadStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: '#1976d2' },
  { value: 'contacted', label: 'Contacted', color: '#7b1fa2' },
  { value: 'qualified', label: 'Qualified', color: '#388e3c' },
  { value: 'proposal', label: 'Proposal', color: '#f57c00' },
  { value: 'negotiation', label: 'Negotiation', color: '#c62828' },
  { value: 'won', label: 'Won', color: '#2e7d32' },
  { value: 'lost', label: 'Lost', color: '#757575' },
  { value: 'test', label: 'Test', color: '#9e9e9e' },
];

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SalesLeadsService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);

  // ── Lead Queries ──

  getLead(leadId: string): Observable<SalesLead | undefined> {
    const ref = doc(this.firestore, `sales-leads/${leadId}`);
    return docData(ref, { idField: 'id' }) as Observable<SalesLead | undefined>;
  }

  getLeads(): Observable<SalesLead[]> {
    const q = query(
      collection(this.firestore, 'sales-leads'),
      orderBy('createdAt', 'desc'),
      limit(500)
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map((docs) => docs as SalesLead[])
    );
  }

  getLeadActivities(leadId: string): Observable<LeadActivity[]> {
    const q = query(
      collection(this.firestore, `sales-leads/${leadId}/activity`),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map((docs) => docs as LeadActivity[])
    );
  }

  // ── Research Sessions ──

  getResearchSessions(): Observable<ResearchSession[]> {
    const q = query(
      collection(this.firestore, 'sales-research-sessions'),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map((docs) => docs as ResearchSession[])
    );
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const ref = doc(this.firestore, 'sales-research-sessions', sessionId);
    await updateDoc(ref, { title });
  }

  // ── Cloud Function Calls ──

  async createLead(lead: Partial<SalesLead>): Promise<{ id: string }> {
    const fn = httpsCallable<any, { id: string }>(this.functions, 'createSalesLead');
    const result = await fn(lead);
    return result.data;
  }

  async updateLead(leadId: string, updates: Partial<SalesLead>): Promise<void> {
    const fn = httpsCallable(this.functions, 'updateSalesLead');
    await fn({ leadId, ...updates });
  }

  async deleteLead(leadId: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'deleteSalesLead');
    await fn({ leadId });
  }

  async addNote(leadId: string, content: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'addSalesLeadNote');
    await fn({ leadId, content });
  }

  async research(message: string, sessionId?: string, ephemeral = false): Promise<{
    reply: string;
    leads: ResearchLead[];
    sessionId: string;
  }> {
    const fn = httpsCallable<any, { reply: string; leads: ResearchLead[]; sessionId: string }>(
      this.functions,
      'salesLeadResearch'
    );
    const result = await fn({ message, sessionId, ephemeral });
    return result.data;
  }

  async generateEmail(leadId: string, context?: string): Promise<{ subject: string; bodyHtml: string; inReplyTo?: string }> {
    const fn = httpsCallable<any, { subject: string; bodyHtml: string; inReplyTo?: string }>(
      this.functions,
      'generateSalesEmail'
    );
    const result = await fn({ leadId, context });
    return result.data;
  }

  async generatePhoneScripts(leadId: string): Promise<{
    suggestions: PhoneScriptSuggestion[];
    libraryScripts: PhoneLibraryScript[];
  }> {
    const fn = httpsCallable<
      { leadId: string },
      { suggestions: PhoneScriptSuggestion[]; libraryScripts: PhoneLibraryScript[] }
    >(this.functions, 'generateSalesPhoneScripts');
    const result = await fn({ leadId });
    return result.data;
  }

  async logPhoneCall(leadId: string, feedback: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'logSalesPhoneCall');
    await fn({ leadId, feedback });
  }

  async sendEmail(leadId: string, subject: string, bodyHtml: string, inReplyTo?: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'sendSalesEmail');
    await fn({ leadId, subject, bodyHtml, inReplyTo });
  }


  // ── Flow Analysis ──

  async analyzeLeadFlow(leadId: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'analyzeSalesLeadFlow');
    await fn({ leadId });
  }

  async refreshAllLeadFlow(): Promise<{ analyzed: number; failed: number; total: number }> {
    const fn = httpsCallable<any, { analyzed: number; failed: number; total: number }>(
      this.functions,
      'refreshAllSalesLeadFlow'
    );
    const result = await fn({});
    return result.data;
  }

  async snoozeLeadFlow(leadId: string, snoozeUntil: Date): Promise<void> {
    const fn = httpsCallable(this.functions, 'snoozeSalesLeadFlow');
    await fn({ leadId, snoozeUntil: snoozeUntil.toISOString() });
  }

  async dismissFlowAction(leadId: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'dismissSalesLeadFlow');
    await fn({ leadId });
  }

  // ── Inbound ──

  async markInboundViewed(leadId: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'markSalesLeadInboundViewed');
    await fn({ leadId });
  }

  // ── Knowledge ──

  async addKnowledge(leadId: string, content: string, source: KnowledgeSource): Promise<void> {
    const ref = doc(this.firestore, `sales-leads/${leadId}`);
    const entry: KnowledgeEntry = { content, source, addedAt: new Date().toISOString() };
    await updateDoc(ref, {
      knowledge: arrayUnion(entry),
      updatedAt: serverTimestamp(),
    });
  }

  // ── Archive ──

  async archiveLead(leadId: string, archived: boolean): Promise<void> {
    const fn = httpsCallable(this.functions, 'archiveSalesLead');
    await fn({ leadId, archived });
  }

  async archiveSession(sessionId: string, archived: boolean): Promise<void> {
    const ref = doc(this.firestore, 'sales-research-sessions', sessionId);
    await updateDoc(ref, { archived });
  }

  // ── Lead Chat ──

  getLeadChatMessages(leadId: string): Observable<LeadChatMessage[]> {
    const q = query(
      collection(this.firestore, `sales-leads/${leadId}/chat`),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map((docs) => docs as LeadChatMessage[])
    );
  }

  async chatWithLead(leadId: string, message: string): Promise<{ reply: string; actionsExecuted: string[] }> {
    const fn = httpsCallable<any, { reply: string; actionsExecuted: string[] }>(
      this.functions,
      'salesLeadChat'
    );
    const result = await fn({ leadId, message });
    return result.data;
  }

  // ── Backfill ──

  async backfillLeadsFromTeams(): Promise<{
    totalTeams: number;
    created: number;
    updated: number;
    skippedNoEmail: number;
    skippedAlreadyLinked: number;
    errors: number;
    errorDetails: string[];
  }> {
    const fn = httpsCallable<any, any>(this.functions, 'backfillSalesLeadsFromTeams');
    const result = await fn({});
    return result.data;
  }

  // ── Consultation ──

  async generateConsultation(leadId: string): Promise<{ consultationLeadId: string | null; consultationUrl: string | null }> {
    const fn = httpsCallable<any, { consultationLeadId: string | null; consultationUrl: string | null }>(
      this.functions,
      'createSalesLeadConsultation'
    );
    const result = await fn({ leadId });
    return result.data;
  }

  // ── Sequence Tracks ──

  getSequenceTrack(trackId: string): Observable<SequenceTrack | undefined> {
    return docData(doc(this.firestore, 'sales-sequence-tracks', trackId), { idField: 'id' }).pipe(
      map((d) => d as SequenceTrack | undefined)
    );
  }

  getSequenceTracks(): Observable<SequenceTrack[]> {
    const q = query(
      collection(this.firestore, 'sales-sequence-tracks'),
      orderBy('createdAt', 'desc')
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map((docs) => docs as SequenceTrack[])
    );
  }

  async createSequenceTrack(track: Omit<SequenceTrack, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<string> {
    const ref = await addDoc(collection(this.firestore, 'sales-sequence-tracks'), {
      ...track,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: '',
    });
    return ref.id;
  }

  async updateSequenceTrack(trackId: string, updates: Partial<SequenceTrack>): Promise<void> {
    const ref = doc(this.firestore, 'sales-sequence-tracks', trackId);
    const { id, createdAt, createdBy, ...safeUpdates } = updates as any;
    await updateDoc(ref, { ...safeUpdates, updatedAt: serverTimestamp() });
  }

  async deleteSequenceTrack(trackId: string): Promise<void> {
    const ref = doc(this.firestore, 'sales-sequence-tracks', trackId);
    await deleteDoc(ref);
  }

  async startLeadOnSequence(leadId: string, trackId: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'startLeadOnSequence');
    await fn({ leadId, trackId });
  }

  async pauseLeadSequence(leadId: string): Promise<void> {
    const ref = doc(this.firestore, `sales-leads/${leadId}`);
    await updateDoc(ref, { sequenceStatus: 'paused', updatedAt: serverTimestamp() });
  }

  async resumeLeadSequence(leadId: string): Promise<void> {
    const ref = doc(this.firestore, `sales-leads/${leadId}`);
    await updateDoc(ref, { sequenceStatus: 'active', updatedAt: serverTimestamp() });
  }

  // ── Auto-Research Config ──

  getAutoResearchConfig(): Observable<AutoResearchConfig | undefined> {
    const ref = doc(this.firestore, 'sales-auto-research/config');
    return docData(ref).pipe(
      map((d) => d as AutoResearchConfig | undefined)
    );
  }

  async updateAutoResearchConfig(updates: Partial<AutoResearchConfig>): Promise<void> {
    const fn = httpsCallable(this.functions, 'updateAutoResearchConfig');
    await fn(updates);
  }

  async createAgentSession(config: Partial<AutoResearchConfig>): Promise<string> {
    const fn = httpsCallable<any, { sessionId: string }>(this.functions, 'createAgentSession');
    const result = await fn(config);
    return result.data.sessionId;
  }

  async updateSessionAutoResearch(sessionId: string, updates: Partial<AutoResearchConfig>): Promise<void> {
    const fn = httpsCallable(this.functions, 'updateSessionAutoResearch');
    await fn({ sessionId, ...updates });
  }

  getAutoResearchLog(): Observable<AutoResearchLogEntry[]> {
    const q = query(
      collection(this.firestore, 'sales-auto-research-log'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map((docs) => docs as AutoResearchLogEntry[])
    );
  }

  getAgentLearnings(): Observable<AgentLearnings | null> {
    const q = query(
      collection(this.firestore, 'sales-agent-learnings'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map((docs) => docs.length > 0 ? docs[0] as AgentLearnings : null)
    );
  }

  // ── Account Insights ──

  async getAccountInsights(teamId: string): Promise<AccountInsights> {
    const fn = httpsCallable<{ teamId: string }, AccountInsights>(
      this.functions,
      'getSalesLeadAccountInsights'
    );
    const result = await fn({ teamId });
    return result.data;
  }

  getInboxEmails(): Observable<InboxEmail[]> {
    const q = query(
      collectionGroup(this.firestore, 'activity'),
      where('type', 'in', ['email_sent', 'email_received']),
      orderBy('createdAt', 'desc'),
      limit(500)
    );

    return new Observable<InboxEmail[]>(subscriber => {
      const unsub = onSnapshot(q, (snapshot) => {
        const items: InboxEmail[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          const pathParts = docSnap.ref.path.split('/');
          return {
            id: docSnap.id,
            leadId: pathParts[1],
            type: data['type'],
            content: data['content'] || '',
            emailSubject: data['emailSubject'],
            emailHtml: data['emailHtml'],
            emailPlainText: data['emailPlainText'],
            senderEmail: data['senderEmail'],
            messageId: data['messageId'],
            createdAt: data['createdAt'],
            actorName: data['actorName'],
          };
        });
        subscriber.next(items);
      }, (error) => {
        subscriber.error(error);
      });

      return () => unsub();
    });
  }
}

export type AutoResearchAddMode = 'sequence' | 'compliance_report' | 'just_add' | 'agent';

export interface AutoResearchConfig {
  enabled: boolean;
  leadsPerDay: number;
  addMode: AutoResearchAddMode;
  sequenceTrackId?: string;
  targetIndustries?: string[];
  targetStates?: string[];
  targetCompanySize?: string;
  leadsAddedToday: number;
  leadsAddedThisMonth: number;
  monthlyCapReached: boolean;
  consecutiveEmptyRuns: number;
  disabledReason?: string;
  disabledAt?: any;
  lastRunAt?: any;
  lastResetDate?: string;
  lastResetMonth?: string;
}

export interface AutoResearchLogEntry {
  id: string;
  createdAt: any;
  leadsFound: number;
  leadsQualified: number;
  leadsAdded: number;
  areasSearched: string[];
  addMode: string;
  pipelineLearning?: string;
  agentActions?: AgentAction[];
  apiCalls?: {
    grok: number;
    googlePlaces: number;
    bouncer: number;
    websiteChecks: number;
  };
}

export interface AgentLearnings {
  id: string;
  createdAt: any;
  totalLeads: number;
  totalEmailed: number;
  totalReplied: number;
  totalProgressed: number;
  totalArchived: number;
  emailReplyRate: number;
  topReplyIndustries: string[];
  topReplyStates: string[];
  successPatterns: string[];
  avoidPatterns: string[];
}

export interface InboxEmail {
  id: string;
  leadId: string;
  type: 'email_sent' | 'email_received';
  content: string;
  emailSubject?: string;
  emailHtml?: string;
  emailPlainText?: string;
  senderEmail?: string;
  messageId?: string;
  createdAt: any;
  actorName?: string;
}

export interface AccountInsights {
  subscription: {
    status: string;
    planId: string | null;
    customerId: string | null;
  };
  memberCount: number;
  usage: {
    inspectionCount: number;
    lastInspectionAt: string | null;
    trainingCount: number;
    lastTrainingAt: string | null;
    incidentCount: number;
  };
  lastActiveAt: string | null;
  recentActivity: {
    actionType: string | null;
    description: string | null;
    source: string | null;
    timestamp: string | null;
  }[];
  teamCreatedAt: string | null;
}
