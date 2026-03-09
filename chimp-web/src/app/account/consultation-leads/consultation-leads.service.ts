import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, getDoc, limit, orderBy, query } from '@angular/fire/firestore';
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

  async resendLeadEmail(leadId: string, testEmail?: string): Promise<void> {
    const resend = httpsCallable<{ leadId: string; testEmail?: string }, { success: boolean }>(
      this.functions,
      'resendConsultationLeadEmail'
    );
    await resend(testEmail ? { leadId, testEmail } : { leadId });
  }
}
