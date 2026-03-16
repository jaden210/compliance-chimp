import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { SeoService } from '../shared/seo.service';
import {
  ConsultationAssessment,
  ConsultationLanguage,
  ConsultationPrefill,
  US_STATE_OPTIONS,
  persistConsultationLanguage,
  resolveConsultationLanguage,
} from '../shared/osha-consultation';
import { ChallengeService } from '../challenge/challenge.service';
import { exportConsultationAssessmentPdf } from '../shared/osha-pdf';
import { ConsultationAssessmentViewComponent } from '../shared/consultation-assessment-view.component';
import { LeadTrackingService } from '../shared/lead-tracking.service';

const LAST_REPORT_STORAGE_KEY = 'chimp_last_osha_consultation_report';
const LAST_REPORT_ES_STORAGE_KEY = 'chimp_last_osha_consultation_report_es';

@Component({
  standalone: true,
  selector: 'app-free-safety-consultation',
  templateUrl: './free-safety-consultation.component.html',
  styleUrls: ['./free-safety-consultation.component.css'],
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ConsultationAssessmentViewComponent
  ]
})
export class FreeSafetyConsultationComponent implements OnInit {
  private auth = inject(Auth);
  private db = inject(Firestore);
  private fb = inject(FormBuilder);
  private functions = inject(Functions);
  private seoService = inject(SeoService);
  private router = inject(Router);
  private challengeService = inject(ChallengeService);
  private leadTracking = inject(LeadTrackingService);
  private isAdmin: boolean | null = null;

  readonly states = US_STATE_OPTIONS;
  readonly consultForm = this.fb.group({
    companyName: ['', [Validators.required, Validators.minLength(2)]],
    website: [''],
    description: ['', [Validators.required, Validators.minLength(12)]],
    employeeCount: [null as number | null, [Validators.required, Validators.min(1), Validators.max(1000000)]],
    state: ['', Validators.required]
  });

  isSubmitting = false;
  errorMessage = '';
  assessment: ConsultationAssessment | null = null;
  assessmentEs: ConsultationAssessment | null = null;
  currentLanguage: ConsultationLanguage = 'en';
  savedReportPreview: { companyName: string; generatedAt: string } | null = null;

  get activeAssessment(): ConsultationAssessment | null {
    if (this.currentLanguage === 'es' && this.assessmentEs) return this.assessmentEs;
    return this.assessment;
  }

  get hasSpanishAssessment(): boolean {
    return !!this.assessmentEs;
  }

  ngOnInit(): void {
    this.currentLanguage = resolveConsultationLanguage();
    this.seoService.setCustomSeo({
      title: 'Free OSHA Safety Consultation | Compliance Chimp',
      description: 'Get a free OSHA safety consultation with a tailored compliance report, required documents, poster guidance, recordkeeping obligations, and a fast path into setup.',
      keywords: 'free OSHA consultation, OSHA compliance assessment, OSHA report, safety compliance checklist, OSHA documents required',
      url: 'https://compliancechimp.com/free-safety-consultation'
    });
    this.refreshSavedReportPreview();
  }

  async submit(): Promise<void> {
    if (this.consultForm.invalid || this.isSubmitting) {
      this.consultForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      const generateReport = httpsCallable(this.functions, 'generateOshaConsultationReport');
      const result = await generateReport({
        companyName: this.consultForm.value.companyName?.trim(),
        website: this.consultForm.value.website?.trim() || '',
        description: this.consultForm.value.description?.trim(),
        employeeCount: Number(this.consultForm.value.employeeCount),
        state: this.consultForm.value.state
      });

      const data = result.data as any;
      this.assessment = data as ConsultationAssessment;
      this.assessmentEs = data.assessment_es || null;
      this.persistLastReport(this.assessment, this.assessmentEs);
      this.refreshSavedReportPreview();

      if (this.assessment.publicConsultationId && !(await this.checkIsAdmin())) {
        this.leadTracking.initFromParams(this.assessment.publicConsultationId, 'self-serve', null);
        this.leadTracking.trackEvent('report_viewed', '/free-safety-consultation');
        this.leadTracking.syncToFirestore();
      }
    } catch (error: any) {
      console.error('Error generating OSHA consultation report:', error);
      this.errorMessage = error?.message || 'There was a problem generating your report. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  onLanguageChange(lang: ConsultationLanguage): void {
    this.currentLanguage = lang;
    persistConsultationLanguage(lang);
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
      importanceScore: this.assessment.importanceScore
    };

    this.challengeService.setConsultationPrefill(prefill);
    this.router.navigate(['/get-started/welcome'], {
      queryParams: { source: 'osha-consultation' }
    });
  }

  reset(): void {
    this.assessment = null;
    this.assessmentEs = null;
    this.errorMessage = '';
    this.refreshSavedReportPreview();
  }

  async downloadPdf(): Promise<void> {
    const target = this.activeAssessment;
    if (!target) return;
    await exportConsultationAssessmentPdf(target, this.currentLanguage);
  }

  showLastReport(): void {
    const savedReport = this.readLastReport();
    if (!savedReport) return;
    this.assessment = savedReport;
    this.assessmentEs = this.readLastReportEs();
    this.errorMessage = '';
  }

  get hasSavedReport(): boolean {
    return !!this.savedReportPreview;
  }

  get savedReportDateLabel(): string {
    if (!this.savedReportPreview?.generatedAt) return '';

    try {
      return new Date(this.savedReportPreview.generatedAt).toLocaleString();
    } catch {
      return this.savedReportPreview.generatedAt;
    }
  }

  private persistLastReport(report: ConsultationAssessment, reportEs: ConsultationAssessment | null): void {
    try {
      localStorage.setItem(LAST_REPORT_STORAGE_KEY, JSON.stringify(report));
      if (reportEs) {
        localStorage.setItem(LAST_REPORT_ES_STORAGE_KEY, JSON.stringify(reportEs));
      } else {
        localStorage.removeItem(LAST_REPORT_ES_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Error saving consultation report locally:', error);
    }
  }

  private readLastReport(): ConsultationAssessment | null {
    try {
      const raw = localStorage.getItem(LAST_REPORT_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as ConsultationAssessment;
      if (!parsed?.assessmentId || !parsed?.profile?.companyName) {
        return null;
      }

      return parsed;
    } catch (error) {
      console.error('Error reading saved consultation report:', error);
      return null;
    }
  }

  private readLastReportEs(): ConsultationAssessment | null {
    try {
      const raw = localStorage.getItem(LAST_REPORT_ES_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as ConsultationAssessment;
      if (!parsed?.assessmentId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private refreshSavedReportPreview(): void {
    const savedReport = this.readLastReport();
    this.savedReportPreview = savedReport
      ? {
          companyName: savedReport.profile.companyName,
          generatedAt: savedReport.generatedAt
        }
      : null;
  }

  private async checkIsAdmin(): Promise<boolean> {
    if (this.isAdmin !== null) return this.isAdmin;
    const currentUser = await firstValueFrom(authState(this.auth));
    if (!currentUser) {
      this.isAdmin = false;
      return false;
    }
    try {
      const snap = await getDoc(doc(this.db, `user/${currentUser.uid}`));
      this.isAdmin = snap.exists() && snap.data()?.['isDev'] === true;
    } catch {
      this.isAdmin = false;
    }
    return this.isAdmin;
  }
}
