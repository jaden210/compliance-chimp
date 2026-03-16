import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  orderBy,
  limit,
  updateDoc,
  arrayUnion,
  serverTimestamp,
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
  | 'account_signup';

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
  archived?: boolean;
  verificationSignals?: VerificationSignals;
  knowledge?: KnowledgeEntry[];
  hasUnviewedInbound?: boolean;
  unviewedInboundCount?: number;
  teamId?: string;
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
  verificationSignals?: VerificationSignals;
  feedbackLog?: LeadFeedbackEntry[];
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
      orderBy('createdAt', 'desc'),
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

  // ── Account Insights ──

  async getAccountInsights(teamId: string): Promise<AccountInsights> {
    const fn = httpsCallable<{ teamId: string }, AccountInsights>(
      this.functions,
      'getSalesLeadAccountInsights'
    );
    const result = await fn({ teamId });
    return result.data;
  }
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
