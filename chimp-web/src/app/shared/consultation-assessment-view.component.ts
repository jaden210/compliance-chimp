import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  ConsultationAssessment,
  ConsultationObligation,
} from './osha-consultation';

interface ComplianceWheelItem {
  label: string;
  description: string;
  count: number;
  accentClass: string;
}

type ScoreSeverity = 'low' | 'medium' | 'high' | 'critical';

@Component({
  standalone: true,
  selector: 'app-consultation-assessment-view',
  templateUrl: './consultation-assessment-view.component.html',
  styleUrls: ['./consultation-assessment-view.component.css'],
  imports: [CommonModule, MatButtonModule, MatIconModule],
})
export class ConsultationAssessmentViewComponent {
  @Input({ required: true }) assessment!: ConsultationAssessment;
  @Input() showResetAction = false;
  @Input() showStartAction = true;
  @Input() showDownloadAction = true;
  @Input() primaryCtaLabel = 'Start Building My Program';
  @Input() bottomCtaLabel = 'Get Started With Ulysses';

  @Output() start = new EventEmitter<void>();
  @Output() download = new EventEmitter<void>();
  @Output() reset = new EventEmitter<void>();

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

    const posters = federal.filter((item) => item.category === 'posters-and-notices');
    const recordkeeping = federal.filter(
      (item) => item.category === 'recordkeeping-and-reporting'
    );
    const writtenPlans = federal.filter(
      (item) => item.category === 'written-programs-and-plans'
    );
    const training = federal.filter(
      (item) =>
        item.category.includes('training') ||
        item.title.toLowerCase().includes('train')
    );
    const operationalControls = federal.filter((item) =>
      [
        'fall-protection',
        'construction-safety',
        'machine-safety',
        'training-and-equipment',
        'healthcare-and-biohazards',
      ].includes(item.category)
    );

    return [
      {
        label: 'Posters',
        description: posters.length ? posters[0].title : 'Required notice posting',
        count: posters.length,
        accentClass: 'wheel-posters',
      },
      {
        label: 'Recordkeeping',
        description: recordkeeping.length ? recordkeeping[0].title : 'OSHA logs and reporting',
        count: recordkeeping.length,
        accentClass: 'wheel-recordkeeping',
      },
      {
        label: 'Written Plans',
        description: writtenPlans.length ? writtenPlans[0].title : 'Core written safety plans',
        count: writtenPlans.length,
        accentClass: 'wheel-written-plans',
      },
      {
        label: 'Training',
        description: training.length ? training[0].title : 'Employee training duties',
        count: training.length,
        accentClass: 'wheel-training',
      },
      {
        label: 'Operational Controls',
        description: operationalControls.length
          ? operationalControls[0].title
          : 'Jobsite and equipment controls',
        count: operationalControls.length,
        accentClass: 'wheel-controls',
      },
      {
        label: 'State Rules',
        description: state.length ? state[0].title : 'State-plan checks and overlays',
        count: state.length || recommended.length,
        accentClass: 'wheel-state',
      },
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
