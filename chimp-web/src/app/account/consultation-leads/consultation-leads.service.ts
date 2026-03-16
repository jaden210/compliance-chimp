import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, deleteDoc, doc, getDoc, limit, orderBy, query, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { map, Observable } from 'rxjs';
import { ConsultationLeadRecord, LeadJourney } from '../../shared/osha-consultation';

@Injectable()
export class ConsultationLeadsService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);

  getLeads(): Observable<ConsultationLeadRecord[]> {
    const leadsQuery = query(
      collection(this.firestore, 'osha-consultation-leads'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );

    return collectionData(leadsQuery, { idField: 'id' }).pipe(
      map((docs) => docs as ConsultationLeadRecord[])
    );
  }

  async fetchJourneys(publicConsultationIds: string[]): Promise<Map<string, LeadJourney>> {
    const journeyMap = new Map<string, LeadJourney>();
    const unique = [...new Set(publicConsultationIds.filter(Boolean))];

    const results = await Promise.allSettled(
      unique.map(async (id) => {
        const snap = await getDoc(doc(this.firestore, `public-osha-consultations/${id}`));
        if (snap.exists()) {
          const data = snap.data();
          if (data?.['journey']) {
            journeyMap.set(id, data['journey'] as LeadJourney);
          }
        }
      })
    );

    return journeyMap;
  }

  async updateLeadContact(leadId: string, fields: { email?: string; website?: string }): Promise<void> {
    const leadRef = doc(this.firestore, `osha-consultation-leads/${leadId}`);
    await updateDoc(leadRef, {
      ...fields,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteLead(leadId: string): Promise<void> {
    const leadRef = doc(this.firestore, `osha-consultation-leads/${leadId}`);
    await deleteDoc(leadRef);
  }

  async resendLeadEmail(leadId: string, testEmail?: string): Promise<void> {
    const resend = httpsCallable<{ leadId: string; testEmail?: string }, { success: boolean }>(
      this.functions,
      'resendConsultationLeadEmail'
    );
    await resend(testEmail ? { leadId, testEmail } : { leadId });
  }

  async testFollowupEmail(leadId: string, type: 'video' | 'w1' | 'w2', testEmail?: string): Promise<void> {
    const fn = httpsCallable<
      { leadId: string; type: string; testEmail?: string },
      { success: boolean }
    >(this.functions, 'testConsultationLeadFollowupEmail');
    await fn(testEmail ? { leadId, type, testEmail } : { leadId, type });
  }
}
