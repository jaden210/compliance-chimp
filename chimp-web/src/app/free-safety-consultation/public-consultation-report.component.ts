import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Firestore, doc, docData, increment, updateDoc } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ChallengeService } from '../challenge/challenge.service';
import { exportConsultationAssessmentPdf } from '../shared/osha-pdf';
import {
  ConsultationAssessment,
  ConsultationPrefill,
  PublicConsultationRecord,
} from '../shared/osha-consultation';
import { ConsultationAssessmentViewComponent } from '../shared/consultation-assessment-view.component';
import { LeadTrackingService } from '../shared/lead-tracking.service';
import { SeoService } from '../shared/seo.service';

@Component({
  standalone: true,
  selector: 'app-public-consultation-report',
  templateUrl: './public-consultation-report.component.html',
  styleUrls: ['./public-consultation-report.component.css'],
  imports: [CommonModule, ConsultationAssessmentViewComponent],
})
export class PublicConsultationReportComponent implements OnInit, OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly challengeService = inject(ChallengeService);
  private readonly leadTracking = inject(LeadTrackingService);
  private readonly seoService = inject(SeoService);

  loading = true;
  notFound = false;
  assessment: ConsultationAssessment | null = null;
  private recordSub?: Subscription;
  private hasTrackedView = false;

  ngOnInit(): void {
    const consultationId = this.route.snapshot.paramMap.get('consultationId');
    if (!consultationId) {
      this.notFound = true;
      this.loading = false;
      return;
    }

    const ref = this.route.snapshot.queryParamMap.get('ref') || null;
    const leadId = this.route.snapshot.queryParamMap.get('lid') || null;
    this.leadTracking.initFromParams(consultationId, ref, leadId);

    const recordRef = doc(this.firestore, `public-osha-consultations/${consultationId}`);
    this.recordSub = docData(recordRef, { idField: 'id' }).subscribe({
      next: async (record) => {
        const consultation = record as PublicConsultationRecord | undefined;
        this.loading = false;

        if (!consultation?.assessment?.assessmentId) {
          this.notFound = true;
          this.assessment = null;
          return;
        }

        this.notFound = false;
        this.assessment = consultation.assessment;
        this.seoService.setCustomSeo({
          title: `${consultation.companyName} Free Safety Consultation | Compliance Chimp`,
          description: consultation.assessment.summary,
          keywords: 'free safety consultation, OSHA consultation, safety consultation report',
          url: consultation.publicUrl,
        });

        if (!this.hasTrackedView) {
          this.hasTrackedView = true;
          this.leadTracking.trackEvent('report_viewed', `/free-safety-consultation/report/${consultationId}`);
          this.leadTracking.syncToFirestore();
          try {
            await updateDoc(recordRef, {
              viewCount: increment(1),
              lastViewedAt: new Date().toISOString(),
            });
          } catch (error) {
            console.error('Unable to update consultation view count:', error);
          }
        }
      },
      error: (error) => {
        console.error('Error loading public consultation:', error);
        this.loading = false;
        this.notFound = true;
      },
    });
  }

  ngOnDestroy(): void {
    this.recordSub?.unsubscribe();
  }

  async downloadPdf(): Promise<void> {
    if (!this.assessment) return;
    await exportConsultationAssessmentPdf(this.assessment);
  }

  startOnboarding(): void {
    if (!this.assessment) return;

    this.leadTracking.trackEvent('cta_clicked', undefined, 'start_building');
    this.leadTracking.syncToFirestore();

    const prefill: ConsultationPrefill = {
      ...this.assessment.prefill,
      assessmentId: this.assessment.assessmentId,
      importanceScore: this.assessment.importanceScore,
    };

    this.challengeService.setConsultationPrefill(prefill);
    this.router.navigate(['/get-started/welcome'], {
      queryParams: { source: 'osha-consultation' },
    });
  }
}
