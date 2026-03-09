import { Injectable, inject } from '@angular/core';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { LeadJourney, LeadJourneyEvent } from './osha-consultation';

const STORAGE_KEY = 'chimp_lead_journey';

interface StoredJourney {
  leadId: string | null;
  publicConsultationId: string | null;
  ref: string | null;
  firstVisitAt: string;
  lastActivityAt: string;
  events: LeadJourneyEvent[];
}

@Injectable({ providedIn: 'root' })
export class LeadTrackingService {
  private readonly firestore = inject(Firestore);
  private journey: StoredJourney | null = null;

  constructor() {
    this.load();
  }

  initFromParams(publicConsultationId: string, ref: string | null, leadId: string | null): void {
    if (this.journey && this.journey.publicConsultationId === publicConsultationId) {
      if (ref && !this.journey.ref) {
        this.journey.ref = ref;
      }
      if (leadId && !this.journey.leadId) {
        this.journey.leadId = leadId;
      }
      this.save();
      return;
    }

    this.journey = {
      leadId,
      publicConsultationId,
      ref,
      firstVisitAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      events: [],
    };
    this.save();
  }

  trackEvent(type: LeadJourneyEvent['type'], path?: string, detail?: string): void {
    if (!this.journey) return;

    this.journey.events.push({
      type,
      ...(path ? { path } : {}),
      timestamp: new Date().toISOString(),
      ...(detail ? { detail } : {}),
    });
    this.journey.lastActivityAt = new Date().toISOString();
    this.save();
  }

  trackPageView(path: string): void {
    if (!this.journey) return;

    const last = this.journey.events[this.journey.events.length - 1];
    if (last?.type === 'page_view' && last.path === path) return;

    this.trackEvent('page_view', path);
  }

  getJourney(): StoredJourney | null {
    return this.journey;
  }

  hasActiveJourney(): boolean {
    return this.journey !== null;
  }

  async syncToFirestore(): Promise<void> {
    if (!this.journey?.publicConsultationId) return;

    const summary: LeadJourney = {
      ref: this.journey.ref ?? undefined,
      leadId: this.journey.leadId ?? undefined,
      firstVisitAt: this.journey.firstVisitAt,
      lastActivityAt: this.journey.lastActivityAt,
      reportViewed: this.journey.events.some(e => e.type === 'report_viewed'),
      ctaClicked: this.journey.events.some(e => e.type === 'cta_clicked'),
      signupStarted: this.journey.events.some(e => e.type === 'signup_started'),
      accountCreated: this.journey.events.some(e => e.type === 'account_created'),
      events: this.journey.events,
    };

    const teamEvent = this.journey.events.find(e => e.type === 'account_created');
    if (teamEvent?.detail) {
      summary.teamId = teamEvent.detail;
    }

    try {
      const ref = doc(this.firestore, `public-osha-consultations/${this.journey.publicConsultationId}`);
      await updateDoc(ref, { journey: summary });
    } catch (err) {
      console.error('Failed to sync lead journey to Firestore:', err);
    }
  }

  clear(): void {
    this.journey = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* noop */ }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.journey = JSON.parse(raw);
      }
    } catch {
      this.journey = null;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.journey));
    } catch { /* noop */ }
  }
}
