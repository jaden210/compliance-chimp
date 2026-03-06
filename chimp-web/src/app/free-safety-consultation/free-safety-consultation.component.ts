import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
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
  ConsultationObligation,
  ConsultationPrefill,
  US_STATE_OPTIONS
} from '../shared/osha-consultation';
import { ChallengeService } from '../challenge/challenge.service';
import { exportConsultationAssessmentPdf } from '../shared/osha-pdf';

interface ComplianceWheelItem {
  label: string;
  description: string;
  count: number;
  accentClass: string;
}

type ScoreSeverity = 'low' | 'medium' | 'high' | 'critical';

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
    MatSelectModule
  ]
})
export class FreeSafetyConsultationComponent implements OnInit {
  private fb = inject(FormBuilder);
  private functions = inject(Functions);
  private seoService = inject(SeoService);
  private router = inject(Router);
  private challengeService = inject(ChallengeService);

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

  ngOnInit(): void {
    this.seoService.setCustomSeo({
      title: 'Free OSHA Safety Consultation | Compliance Chimp',
      description: 'Get a free OSHA safety consultation with a tailored compliance report, required documents, poster guidance, recordkeeping obligations, and a fast path into setup.',
      keywords: 'free OSHA consultation, OSHA compliance assessment, OSHA report, safety compliance checklist, OSHA documents required',
      url: 'https://compliancechimp.com/free-safety-consultation'
    });
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

      this.assessment = result.data as ConsultationAssessment;
    } catch (error: any) {
      console.error('Error generating OSHA consultation report:', error);
      this.errorMessage = error?.message || 'There was a problem generating your report. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  startOnboarding(): void {
    if (!this.assessment) return;

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
    this.errorMessage = '';
  }

  async downloadPdf(): Promise<void> {
    if (!this.assessment) return;
    await exportConsultationAssessmentPdf(this.assessment);
  }

  get scoreSeverity(): ScoreSeverity {
    const score = this.assessment?.importanceScore ?? 0;
    if (score >= 85) return 'critical';
    if (score >= 70) return 'high';
    if (score >= 55) return 'medium';
    return 'low';
  }

  get scoreSeverityClass(): string {
    return `score-${this.scoreSeverity}`;
  }

  get scoreMeaningTitle(): string {
    switch (this.scoreSeverity) {
      case 'critical':
        return 'Immediate compliance attention needed';
      case 'high':
        return 'High compliance urgency';
      case 'medium':
        return 'Meaningful compliance workload';
      default:
        return 'Lower immediate complexity';
    }
  }

  get scoreMeaningDescription(): string {
    switch (this.scoreSeverity) {
      case 'critical':
        return 'A higher score means this business likely has more OSHA duties, more documentation, and more risk exposure to manage right away.';
      case 'high':
        return 'This score suggests a fairly serious OSHA workload with several areas that should be documented and controlled early.';
      case 'medium':
        return 'This score suggests a moderate set of OSHA requirements, with some formal programs and recordkeeping likely needed.';
      default:
        return 'This does not mean no OSHA responsibility. It means the business appears less complex than higher-risk operations.';
    }
  }

  get complianceWheel(): ComplianceWheelItem[] {
    if (!this.assessment) return [];

    const federal = this.assessment.federalRequirements;
    const recommended = this.assessment.recommendedProcesses;
    const state = this.assessment.stateRequirements;

    const posters = federal.filter(item => item.category === 'posters-and-notices');
    const recordkeeping = federal.filter(item => item.category === 'recordkeeping-and-reporting');
    const writtenPlans = federal.filter(item => item.category === 'written-programs-and-plans');
    const training = federal.filter(item =>
      item.category.includes('training') ||
      item.title.toLowerCase().includes('train')
    );
    const operationalControls = federal.filter(item =>
      ['fall-protection', 'construction-safety', 'machine-safety', 'training-and-equipment', 'healthcare-and-biohazards'].includes(item.category)
    );

    return [
      {
        label: 'Posters',
        description: posters.length ? posters[0].title : 'Required notice posting',
        count: posters.length,
        accentClass: 'wheel-posters'
      },
      {
        label: 'Recordkeeping',
        description: recordkeeping.length ? recordkeeping[0].title : 'OSHA logs and reporting',
        count: recordkeeping.length,
        accentClass: 'wheel-recordkeeping'
      },
      {
        label: 'Written Plans',
        description: writtenPlans.length ? writtenPlans[0].title : 'Core written safety plans',
        count: writtenPlans.length,
        accentClass: 'wheel-written-plans'
      },
      {
        label: 'Training',
        description: training.length ? training[0].title : 'Employee training duties',
        count: training.length,
        accentClass: 'wheel-training'
      },
      {
        label: 'Operational Controls',
        description: operationalControls.length ? operationalControls[0].title : 'Jobsite and equipment controls',
        count: operationalControls.length,
        accentClass: 'wheel-controls'
      },
      {
        label: 'State Rules',
        description: state.length ? state[0].title : 'State-plan checks and overlays',
        count: state.length || recommended.length,
        accentClass: 'wheel-state'
      }
    ];
  }

  trackByObligation(_: number, obligation: ConsultationObligation): string {
    return obligation.id;
  }

  trackByText(_: number, value: string): string {
    return value;
  }

  trackByCitation(_: number, citation: { url: string }): string {
    return citation.url;
  }

  trackByWheelItem(_: number, item: ComplianceWheelItem): string {
    return item.label;
  }
}
