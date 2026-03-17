import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { Firestore, doc, docData, getDoc, increment, updateDoc } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { ChallengeService } from '../challenge/challenge.service';
import { exportConsultationAssessmentPdf } from '../shared/osha-pdf';
import {
  ConsultationAssessment,
  ConsultationLanguage,
  ConsultationPrefill,
  PublicConsultationRecord,
  persistConsultationLanguage,
  resolveConsultationLanguage,
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
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly challengeService = inject(ChallengeService);
  private readonly leadTracking = inject(LeadTrackingService);
  private readonly seoService = inject(SeoService);

  loading = true;
  notFound = false;
  assessment: ConsultationAssessment | null = null;
  assessmentEs: ConsultationAssessment | null = null;
  currentLanguage: ConsultationLanguage = 'en';
  private recordSub?: Subscription;
  private hasTrackedView = false;
  private isAdmin: boolean | null = null;

  get activeAssessment(): ConsultationAssessment | null {
    if (this.currentLanguage === 'es' && this.assessmentEs) return this.assessmentEs;
    return this.assessment;
  }

  get hasSpanishAssessment(): boolean {
    return !!this.assessmentEs;
  }

  ngOnInit(): void {
    const langParam = this.route.snapshot.queryParamMap.get('lang');
    this.currentLanguage = resolveConsultationLanguage(langParam);

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
          this.assessmentEs = null;
          return;
        }

        this.notFound = false;
        this.assessment = consultation.assessment;
        this.assessmentEs = consultation.assessment_es || null;
        this.seoService.setCustomSeo({
          title: `${consultation.companyName} Free Safety Consultation | Compliance Chimp`,
          description: consultation.assessment.summary,
          keywords: 'free safety consultation, OSHA consultation, safety consultation report',
          url: consultation.publicUrl,
        });

        if (!this.hasTrackedView) {
          this.hasTrackedView = true;
          if (await this.checkIsAdmin()) return;

          const createdAt = (consultation as any).createdAt?.toDate ? (consultation as any).createdAt.toDate() : null;
          if (createdAt && Date.now() - createdAt.getTime() < 60000) return;

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

  onLanguageChange(lang: ConsultationLanguage): void {
    this.currentLanguage = lang;
    persistConsultationLanguage(lang);
  }

  async downloadPdf(): Promise<void> {
    const target = this.activeAssessment;
    if (!target) return;
    await exportConsultationAssessmentPdf(target, this.currentLanguage);
  }

  startOnboarding(): void {
    if (!this.assessment) return;

    if (this.isAdmin !== true) {
      this.leadTracking.trackEvent('cta_clicked', undefined, 'start_building');
      this.leadTracking.syncToFirestore();
    }

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

  private async checkIsAdmin(): Promise<boolean> {
    if (this.isAdmin !== null) return this.isAdmin;
    const currentUser = await firstValueFrom(authState(this.auth));
    if (!currentUser) {
      this.isAdmin = false;
      return false;
    }
    try {
      const snap = await getDoc(doc(this.firestore, `user/${currentUser.uid}`));
      this.isAdmin = snap.exists() && snap.data()?.['isDev'] === true;
    } catch {
      this.isAdmin = false;
    }
    return this.isAdmin;
  }
}
