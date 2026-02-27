import { Injectable } from "@angular/core";
import { Observable, of, firstValueFrom } from "rxjs";
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  serverTimestamp,
  increment,
} from "@angular/fire/firestore";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { map, catchError } from "rxjs/operators";

// ── Campaign interfaces ──

export interface SequenceStep {
  subject: string;
  bodyHtml: string;
  delayDays: number;
}

export interface CampaignStats {
  totalSent: number;
  totalRecipients: number;
}

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface Campaign {
  id: string;
  jobId: string;
  niche: string;
  region: string;
  status: CampaignStatus;
  sequence: SequenceStep[];
  recipientCount: number;
  landingPageSlug?: string;
  stats: CampaignStats;
  createdAt: Date;
  updatedAt: Date;
}

// ── Recipient interfaces ──

export type RecipientStatus =
  | "queued"
  | "sending"
  | "completed"
  | "failed"
  | "unsubscribed"
  | "bounced";

export interface RecipientHistory {
  stepIndex: number;
  sentAt: Date;
  messageId: string;
}

export interface RecipientEmailVerification {
  status: string;
  reason: string;
  score?: number;
  verifiedAt: string;
}

export interface Recipient {
  id: string;
  email: string;
  companyName: string;
  website: string;
  currentStep: number;
  status: RecipientStatus;
  nextSendAt: Date;
  history: RecipientHistory[];
  unsubscribedAt?: Date;
  emailVerification?: RecipientEmailVerification;
}

// ── Global settings ──

export interface OutreachSettings {
  dailySendLimit: number;
  sentToday: number;
  sentTodayDate: string;
}

// ── Landing page interfaces ──

export interface LandingPageHero {
  eyebrow: string;
  headline: string;
  subheadline: string;
}

export interface LandingPagePainPoint {
  title: string;
  description: string;
}

export interface LandingPageFeature {
  icon: string;
  title: string;
  description: string;
}

export interface LandingPageFaq {
  question: string;
  answer: string;
}

export interface LandingPageFinalCta {
  headline: string;
  subheadline: string;
}

export interface OutreachLandingPage {
  slug: string;
  campaignId: string;
  niche: string;
  region: string;
  hero: LandingPageHero;
  painHeadline: string;
  painSubheadline: string;
  painPoints: LandingPagePainPoint[];
  solutionHeadline: string;
  features: LandingPageFeature[];
  midCta: string;
  faq: LandingPageFaq[];
  finalCta: LandingPageFinalCta;
  getStartedParams: { industry: string; source: string };
  seoTitle: string;
  seoDescription: string;
  totalVisits?: number;
  uniqueVisitors?: number;
  visitsByDay?: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

// ── Service ──

@Injectable()
export class CampaignService {
  constructor(private db: Firestore, private fns: Functions) {}

  // ── Campaign CRUD ──

  getCampaigns(): Observable<Campaign[]> {
    return collectionData(
      query(
        collection(this.db, "outreach-campaigns"),
        orderBy("createdAt", "desc")
      ),
      { idField: "id" }
    ).pipe(
      map((docs: any[]) => docs.map((d) => this.mapCampaign(d))),
      catchError((err) => {
        console.error("Error loading campaigns:", err);
        return of([]);
      })
    );
  }

  getCampaignForJob(jobId: string): Observable<Campaign | null> {
    return collectionData(
      query(
        collection(this.db, "outreach-campaigns"),
        where("jobId", "==", jobId)
      ),
      { idField: "id" }
    ).pipe(
      map((docs: any[]) => {
        if (!docs.length) return null;
        return this.mapCampaign(docs[0]);
      }),
      catchError((err) => {
        console.error("Error loading campaign:", err);
        return of(null);
      })
    );
  }

  async createCampaign(job: {
    id: string;
    niche: string;
    region: string;
  }): Promise<string> {
    const ref = await addDoc(collection(this.db, "outreach-campaigns"), {
      jobId: job.id,
      niche: job.niche,
      region: job.region,
      status: "draft",
      sequence: [],
      recipientCount: 0,
      stats: { totalSent: 0, totalRecipients: 0 },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateSequence(
    campaignId: string,
    sequence: SequenceStep[]
  ): Promise<void> {
    await updateDoc(doc(this.db, `outreach-campaigns/${campaignId}`), {
      sequence,
      updatedAt: serverTimestamp(),
    });
  }

  // ── Global settings ──

  getGlobalSettings(): Observable<OutreachSettings> {
    return docData(doc(this.db, "outreach-settings/global")).pipe(
      map(
        (data: any) =>
          (data || {
            dailySendLimit: 100,
            sentToday: 0,
            sentTodayDate: "",
          }) as OutreachSettings
      ),
      catchError(() =>
        of({ dailySendLimit: 100, sentToday: 0, sentTodayDate: "" })
      )
    );
  }

  async updateDailySendLimit(limit: number): Promise<void> {
    await setDoc(
      doc(this.db, "outreach-settings/global"),
      { dailySendLimit: limit },
      { merge: true }
    );
  }

  // ── Recipients ──

  getRecipients(campaignId: string): Observable<Recipient[]> {
    return collectionData(
      query(
        collection(
          this.db,
          `outreach-campaigns/${campaignId}/recipients`
        ),
        orderBy("companyName", "asc")
      ),
      { idField: "id" }
    ).pipe(
      map((docs: any[]) =>
        docs.map((d) => ({
          ...d,
          nextSendAt: d.nextSendAt?.toDate
            ? d.nextSendAt.toDate()
            : d.nextSendAt,
          unsubscribedAt: d.unsubscribedAt?.toDate
            ? d.unsubscribedAt.toDate()
            : d.unsubscribedAt,
          history: (d.history || []).map((h: any) => ({
            ...h,
            sentAt: h.sentAt?.toDate ? h.sentAt.toDate() : h.sentAt,
          })),
        }))
      ),
      catchError((err) => {
        console.error("Error loading recipients:", err);
        return of([]);
      })
    );
  }

  async deleteRecipient(
    campaignId: string,
    recipientId: string
  ): Promise<void> {
    await deleteDoc(
      doc(this.db, `outreach-campaigns/${campaignId}/recipients/${recipientId}`)
    );
    await updateDoc(doc(this.db, `outreach-campaigns/${campaignId}`), {
      recipientCount: increment(-1),
      "stats.totalRecipients": increment(-1),
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Called when a contact in the scrape results is manually verified.
   * Finds the campaign for the given job and adds the contact as a queued
   * recipient at step 0, skipping if they're already present.
   * Returns true if added, false if skipped (no campaign or already exists).
   */
  async addVerifiedContactToCampaign(
    jobId: string,
    contact: { email: string; companyName: string; website: string }
  ): Promise<boolean> {
    const campaign = await firstValueFrom(this.getCampaignForJob(jobId));
    if (!campaign || campaign.status === "draft") return false;

    const email = contact.email.trim().toLowerCase();
    const existing = await getDocs(
      query(
        collection(this.db, `outreach-campaigns/${campaign.id}/recipients`),
        where("email", "==", email)
      )
    );
    if (!existing.empty) return false;

    await addDoc(
      collection(this.db, `outreach-campaigns/${campaign.id}/recipients`),
      {
        email,
        companyName: contact.companyName.trim(),
        website: contact.website.trim(),
        currentStep: 0,
        status: "queued",
        nextSendAt: serverTimestamp(),
        history: [],
        addedManually: true,
      }
    );
    await updateDoc(doc(this.db, `outreach-campaigns/${campaign.id}`), {
      recipientCount: increment(1),
      "stats.totalRecipients": increment(1),
      updatedAt: serverTimestamp(),
    });
    return true;
  }

  // ── Cloud Function calls ──

  async populateRecipients(
    campaignId: string
  ): Promise<{ recipientCount: number; skippedInvalid: number; skippedUnverified: number }> {
    const fn = httpsCallable<
      { campaignId: string },
      { recipientCount: number; skippedInvalid: number; skippedUnverified: number }
    >(this.fns, "populateOutreachRecipients");
    const result = await fn({ campaignId });
    return result.data;
  }

  async startCampaign(
    campaignId: string
  ): Promise<{ status: string }> {
    const fn = httpsCallable<
      { campaignId: string },
      { status: string }
    >(this.fns, "startOutreachCampaign");
    const result = await fn({ campaignId });
    return result.data;
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    const fn = httpsCallable<{ campaignId: string }, void>(
      this.fns,
      "pauseOutreachCampaign"
    );
    await fn({ campaignId });
  }

  async syncRecipients(
    campaignId: string
  ): Promise<{ added: number; skippedInvalid: number }> {
    const fn = httpsCallable<
      { campaignId: string },
      { added: number; skippedInvalid: number }
    >(this.fns, "syncOutreachRecipients");
    const result = await fn({ campaignId });
    return result.data;
  }

  async generateEmail(params: {
    niche: string;
    region: string;
    stepNumber: number;
    totalSteps: number;
    prompt?: string;
  }): Promise<{ subject: string; bodyHtml: string }> {
    const fn = httpsCallable<
      typeof params,
      { subject: string; bodyHtml: string }
    >(this.fns, "generateOutreachEmail");
    const result = await fn(params);
    return result.data;
  }

  async sendTestEmail(params: {
    campaignId: string;
    stepIndex: number;
    testEmail: string;
  }): Promise<void> {
    const fn = httpsCallable<typeof params, void>(
      this.fns,
      "sendTestOutreachEmail"
    );
    await fn(params);
  }

  // ── Landing page ──

  async generateLandingPage(
    campaignId: string,
    prompt?: string
  ): Promise<{ slug: string; url: string }> {
    const fn = httpsCallable<
      { campaignId: string; prompt?: string },
      { slug: string; url: string }
    >(this.fns, "generateOutreachLandingPage");
    const result = await fn({ campaignId, prompt: prompt || undefined });
    return result.data;
  }

  getLandingPage(campaignId: string): Observable<OutreachLandingPage | null> {
    return collectionData(
      query(
        collection(this.db, "outreach-landing-pages"),
        where("campaignId", "==", campaignId)
      ),
      { idField: "slug" }
    ).pipe(
      map((docs: any[]) => {
        if (!docs.length) return null;
        return docs[0] as OutreachLandingPage;
      }),
      catchError(() => of(null))
    );
  }

  async updateLandingPage(
    slug: string,
    data: Partial<OutreachLandingPage>
  ): Promise<void> {
    await updateDoc(doc(this.db, `outreach-landing-pages/${slug}`), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  // ── Helpers ──

  private mapCampaign(data: any): Campaign {
    return {
      ...data,
      createdAt: data.createdAt?.toDate
        ? data.createdAt.toDate()
        : data.createdAt,
      updatedAt: data.updatedAt?.toDate
        ? data.updatedAt.toDate()
        : data.updatedAt,
    } as Campaign;
  }
}
