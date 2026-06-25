import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  ConsultationAssessment,
  ConsultationLanguage,
  ConsultationObligation,
  ConsultationTrainingRecommendation,
} from './osha-consultation';

interface ComplianceWheelItem {
  label: string;
  description: string;
  count: number;
  accentClass: string;
}

type ScoreSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ConsultationLabels {
  assessmentReady: string;
  complianceUrgencyScore: string;
  scoreHelper: string;
  industryProfile: string;
  oshaTrack: string;
  employees: string;
  state: string;
  ulyssesTake: string;
  compliance: string;
  allElementsOfCompliance: string;
  wheelIntro: string;
  whatYouGet: string;
  pricingHeadline: string;
  pricingFeature1: string;
  pricingFeature2: string;
  pricingFeature3: string;
  pricingFeature4: string;
  perMonth: string;
  noContracts: string;
  downloadPdf: string;
  runAnother: string;
  requiredFederalActions: string;
  federalIntro: string;
  stateSpecificFlags: string;
  stateIntro: string;
  noStateOverlay: string;
  recommendedProcesses: string;
  recommendedIntro: string;
  recommended: string;
  whatToDoNext: string;
  nextIntro: string;
  assumptionsAndCaveats: string;
  readyToFixIt: string;
  bottomCtaHeadline: string;
  bottomCtaDescription: string;
  demoHeadline: string;
  demoSub1: string;
  demoSub2: string;
  collapse: string;
  fullScreen: string;
  wheelPosters: string;
  wheelPostersDefault: string;
  wheelRecordkeeping: string;
  wheelRecordkeepingDefault: string;
  wheelWrittenPlans: string;
  wheelWrittenPlansDefault: string;
  wheelTraining: string;
  wheelTrainingDefault: string;
  wheelOperationalControls: string;
  wheelOperationalControlsDefault: string;
  wheelStateRules: string;
  wheelStateRulesDefault: string;
  scoreCriticalTitle: string;
  scoreCriticalDesc: string;
  scoreHighTitle: string;
  scoreHighDesc: string;
  scoreMediumTitle: string;
  scoreMediumDesc: string;
  scoreLowTitle: string;
  scoreLowDesc: string;
  primaryCtaDefault: string;
  bottomCtaDefault: string;
  tabOsha: string;
  tabTrainings: string;
  trainingsHeadline: string;
  trainingsIntro: string;
  trainingsFeature1: string;
  trainingsFeature2: string;
  trainingsFeature3: string;
  trainingCategoryOsha: string;
  trainingCategoryOperational: string;
  trainingCategoryEquipment: string;
  trainingCategoryHealth: string;
  trainingCadenceLabel: string;
  tabOshaDescription: string;
  tabTrainingsDescription: string;
  trainingsCtaHeadline: string;
  trainingsCtaDescription: string;
  trainingsPricingHeadline: string;
  trainingsPricingFeature1: string;
  trainingsPricingFeature2: string;
  trainingsPricingFeature3: string;
  trainingsPricingFeature4: string;
}

const LABELS_EN: ConsultationLabels = {
  assessmentReady: 'Assessment Ready',
  complianceUrgencyScore: 'Compliance Urgency Score',
  scoreHelper: 'Higher score = more OSHA obligations and more urgency to get controls in place.',
  industryProfile: 'Industry profile',
  oshaTrack: 'OSHA track',
  employees: 'Employees',
  state: 'State',
  ulyssesTake: "Ulysses's Take",
  compliance: 'Compliance',
  allElementsOfCompliance: 'All The Elements Of Compliance',
  wheelIntro: 'Think of this as the wheel you have to keep turning. Each slice is one part of a complete OSHA program.',
  whatYouGet: 'What You Get',
  pricingHeadline: 'The full program, built and managed for you.',
  pricingFeature1: 'Every written plan, policy, and procedure from your report, built out completely',
  pricingFeature2: 'Training assignments tracked per employee with completion records',
  pricingFeature3: 'Inspection-ready documentation you can hand to OSHA on the spot',
  pricingFeature4: 'Ongoing compliance monitoring so nothing falls through the cracks',
  perMonth: '/month',
  noContracts: 'Free forever. No credit card required.',
  downloadPdf: 'Download PDF',
  runAnother: 'Run Another Assessment',
  requiredFederalActions: 'Required Federal Actions',
  federalIntro: 'These are the baseline federal items most likely to apply to this business profile.',
  stateSpecificFlags: 'State-Specific Flags',
  stateIntro: 'Federal OSHA is not always the whole story. These are the state-plan items and caveats to check.',
  noStateOverlay: 'No extra private-sector state-plan overlay was detected from the state you selected. Federal OSHA likely remains the primary baseline.',
  recommendedProcesses: 'Recommended Processes',
  recommendedIntro: 'These are the systems most businesses need in practice to stay organized and inspection-ready.',
  recommended: 'recommended',
  whatToDoNext: 'What To Do Next',
  nextIntro: 'Use this as your first pass through the work.',
  assumptionsAndCaveats: 'Assumptions And Caveats',
  readyToFixIt: 'Ready To Fix It',
  bottomCtaHeadline: 'Let Ulysses build the system instead of leaving you with a very expensive to-do list.',
  bottomCtaDescription: 'You have the score, the documents, and the weak spots. The next step is getting the program built, assigned, and tracked before any of this turns into a fine, an injury, or both.',
  demoHeadline: 'See what happens after the report.',
  demoSub1: 'Ulysses takes everything above and builds the full safety program in about 75 seconds.',
  demoSub2: 'Not a summary. The actual system.',
  collapse: 'Collapse',
  fullScreen: 'Full Screen',
  wheelPosters: 'Posters',
  wheelPostersDefault: 'Required notice posting',
  wheelRecordkeeping: 'Recordkeeping',
  wheelRecordkeepingDefault: 'OSHA logs and reporting',
  wheelWrittenPlans: 'Written Plans',
  wheelWrittenPlansDefault: 'Core written safety plans',
  wheelTraining: 'Training',
  wheelTrainingDefault: 'Employee training duties',
  wheelOperationalControls: 'Operational Controls',
  wheelOperationalControlsDefault: 'Jobsite and equipment controls',
  wheelStateRules: 'State Rules',
  wheelStateRulesDefault: 'State-plan checks and overlays',
  scoreCriticalTitle: 'Immediate compliance attention needed',
  scoreCriticalDesc: 'A higher score means this business likely has more OSHA duties, more documentation, and more risk exposure to manage right away.',
  scoreHighTitle: 'High compliance urgency',
  scoreHighDesc: 'This score suggests a fairly serious OSHA workload with several areas that should be documented and controlled early.',
  scoreMediumTitle: 'Meaningful compliance workload',
  scoreMediumDesc: 'This score suggests a moderate set of OSHA requirements, with some formal programs and recordkeeping likely needed.',
  scoreLowTitle: 'Lower immediate complexity',
  scoreLowDesc: 'This does not mean no OSHA responsibility. It means the business appears less complex than higher-risk operations.',
  primaryCtaDefault: 'Start Building My Program',
  bottomCtaDefault: 'Get Started With Ulysses',
  tabOsha: 'OSHA Compliance',
  tabTrainings: 'Trainings',
  trainingsHeadline: 'Trainings Built For Your Business',
  trainingsIntro: 'These are the trainings Ulysses would build for your team. Not just OSHA requirements, but the practical, day-to-day training your crew actually needs to work safely and stay sharp.',
  trainingsFeature1: 'Customized training content generated for your industry and equipment',
  trainingsFeature2: 'Completion tracking per employee with automated reminders',
  trainingsFeature3: 'Cadence management so recurring trainings never slip through the cracks',
  trainingCategoryOsha: 'OSHA Required',
  trainingCategoryOperational: 'Operational',
  trainingCategoryEquipment: 'Equipment',
  trainingCategoryHealth: 'Health & Wellness',
  trainingCadenceLabel: 'Cadence',
  tabOshaDescription: 'Your OSHA obligations, required documents, and compliance score.',
  tabTrainingsDescription: 'Customized trainings Ulysses would build for your team, beyond just OSHA.',
  trainingsCtaHeadline: 'Stop guessing what your team needs to know.',
  trainingsCtaDescription: 'Ulysses builds the training program, assigns it by role, tracks completions, and sends reminders when something is due. All you have to do is sign up.',
  trainingsPricingHeadline: 'Every training, built, assigned, and tracked.',
  trainingsPricingFeature1: 'Custom training articles generated for your exact business and equipment',
  trainingsPricingFeature2: 'Assign trainings by role, tag, or team with flexible cadences',
  trainingsPricingFeature3: 'Automatic reminders and completion tracking per employee',
  trainingsPricingFeature4: 'In-person training scheduling and sign-off documentation',
};

const LABELS_ES: ConsultationLabels = {
  assessmentReady: 'Evaluacion Lista',
  complianceUrgencyScore: 'Puntaje de Urgencia de Cumplimiento',
  scoreHelper: 'Mayor puntaje = mas obligaciones de OSHA y mas urgencia para implementar controles.',
  industryProfile: 'Perfil de industria',
  oshaTrack: 'Categoria OSHA',
  employees: 'Empleados',
  state: 'Estado',
  ulyssesTake: 'La Opinion de Ulysses',
  compliance: 'Cumplimiento',
  allElementsOfCompliance: 'Todos Los Elementos del Cumplimiento',
  wheelIntro: 'Piense en esto como la rueda que tiene que seguir girando. Cada seccion es una parte de un programa completo de OSHA.',
  whatYouGet: 'Lo Que Recibe',
  pricingHeadline: 'El programa completo, construido y administrado para usted.',
  pricingFeature1: 'Cada plan escrito, politica y procedimiento de su informe, completamente desarrollado',
  pricingFeature2: 'Asignaciones de capacitacion rastreadas por empleado con registros de finalizacion',
  pricingFeature3: 'Documentacion lista para inspeccion que puede entregar a OSHA en el momento',
  pricingFeature4: 'Monitoreo continuo de cumplimiento para que nada se le escape',
  perMonth: '/mes',
  noContracts: 'Gratis para siempre. Sin tarjeta de credito.',
  downloadPdf: 'Descargar PDF',
  runAnother: 'Ejecutar Otra Evaluacion',
  requiredFederalActions: 'Acciones Federales Requeridas',
  federalIntro: 'Estos son los requisitos federales basicos que probablemente aplican a este perfil de negocio.',
  stateSpecificFlags: 'Alertas Especificas del Estado',
  stateIntro: 'OSHA federal no siempre es toda la historia. Estos son los requisitos estatales y advertencias a revisar.',
  noStateOverlay: 'No se detecto ninguna capa adicional de plan estatal del sector privado para el estado seleccionado. OSHA federal probablemente sigue siendo la base principal.',
  recommendedProcesses: 'Procesos Recomendados',
  recommendedIntro: 'Estos son los sistemas que la mayoria de los negocios necesitan en la practica para mantenerse organizados y listos para inspecciones.',
  recommended: 'recomendado',
  whatToDoNext: 'Que Hacer a Continuacion',
  nextIntro: 'Use esto como su primera revision del trabajo.',
  assumptionsAndCaveats: 'Suposiciones y Advertencias',
  readyToFixIt: 'Listo Para Corregirlo',
  bottomCtaHeadline: 'Deje que Ulysses construya el sistema en vez de dejarlo con una lista de tareas muy costosa.',
  bottomCtaDescription: 'Tiene el puntaje, los documentos y los puntos debiles. El siguiente paso es construir, asignar y rastrear el programa antes de que algo se convierta en una multa, una lesion, o ambas.',
  demoHeadline: 'Vea lo que pasa despues del informe.',
  demoSub1: 'Ulysses toma todo lo anterior y construye el programa completo de seguridad en unos 75 segundos.',
  demoSub2: 'No es un resumen. Es el sistema real.',
  collapse: 'Contraer',
  fullScreen: 'Pantalla Completa',
  wheelPosters: 'Carteles',
  wheelPostersDefault: 'Publicacion de avisos requeridos',
  wheelRecordkeeping: 'Registros',
  wheelRecordkeepingDefault: 'Registros e informes de OSHA',
  wheelWrittenPlans: 'Planes Escritos',
  wheelWrittenPlansDefault: 'Planes de seguridad escritos principales',
  wheelTraining: 'Capacitacion',
  wheelTrainingDefault: 'Obligaciones de capacitacion de empleados',
  wheelOperationalControls: 'Controles Operacionales',
  wheelOperationalControlsDefault: 'Controles de sitio de trabajo y equipos',
  wheelStateRules: 'Reglas Estatales',
  wheelStateRulesDefault: 'Revisiones y capas del plan estatal',
  scoreCriticalTitle: 'Se necesita atencion inmediata de cumplimiento',
  scoreCriticalDesc: 'Un puntaje mas alto significa que este negocio probablemente tiene mas deberes de OSHA, mas documentacion y mas exposicion a riesgos que manejar de inmediato.',
  scoreHighTitle: 'Alta urgencia de cumplimiento',
  scoreHighDesc: 'Este puntaje sugiere una carga de trabajo de OSHA bastante seria con varias areas que deben documentarse y controlarse pronto.',
  scoreMediumTitle: 'Carga de trabajo de cumplimiento significativa',
  scoreMediumDesc: 'Este puntaje sugiere un conjunto moderado de requisitos de OSHA, con algunos programas formales y mantenimiento de registros probablemente necesarios.',
  scoreLowTitle: 'Menor complejidad inmediata',
  scoreLowDesc: 'Esto no significa que no haya responsabilidad ante OSHA. Significa que el negocio parece menos complejo que operaciones de mayor riesgo.',
  primaryCtaDefault: 'Comenzar a Construir Mi Programa',
  bottomCtaDefault: 'Comenzar Con Ulysses',
  tabOsha: 'Cumplimiento OSHA',
  tabTrainings: 'Capacitaciones',
  trainingsHeadline: 'Capacitaciones Creadas Para Su Negocio',
  trainingsIntro: 'Estas son las capacitaciones que Ulysses construiria para su equipo. No solo requisitos de OSHA, sino la capacitacion practica y diaria que su equipo realmente necesita para trabajar de forma segura.',
  trainingsFeature1: 'Contenido de capacitacion personalizado generado para su industria y equipo',
  trainingsFeature2: 'Seguimiento de finalizacion por empleado con recordatorios automaticos',
  trainingsFeature3: 'Gestion de cadencia para que las capacitaciones recurrentes nunca se pasen',
  trainingCategoryOsha: 'Requerido por OSHA',
  trainingCategoryOperational: 'Operacional',
  trainingCategoryEquipment: 'Equipo',
  trainingCategoryHealth: 'Salud y Bienestar',
  trainingCadenceLabel: 'Cadencia',
  tabOshaDescription: 'Sus obligaciones de OSHA, documentos requeridos y puntaje de cumplimiento.',
  tabTrainingsDescription: 'Capacitaciones personalizadas que Ulysses construiria para su equipo, mas alla de OSHA.',
  trainingsCtaHeadline: 'Deje de adivinar lo que su equipo necesita saber.',
  trainingsCtaDescription: 'Ulysses construye el programa de capacitacion, lo asigna por rol, rastrea las finalizaciones y envia recordatorios cuando algo vence. Solo tiene que registrarse.',
  trainingsPricingHeadline: 'Cada capacitacion, creada, asignada y rastreada.',
  trainingsPricingFeature1: 'Articulos de capacitacion personalizados generados para su negocio y equipo exacto',
  trainingsPricingFeature2: 'Asigne capacitaciones por rol, etiqueta o equipo con cadencias flexibles',
  trainingsPricingFeature3: 'Recordatorios automaticos y seguimiento de finalizacion por empleado',
  trainingsPricingFeature4: 'Programacion de capacitacion presencial y documentacion de firma',
};

@Component({
  standalone: true,
  selector: 'app-consultation-assessment-view',
  templateUrl: './consultation-assessment-view.component.html',
  styleUrls: ['./consultation-assessment-view.component.css'],
  imports: [CommonModule, MatButtonModule, MatIconModule],
})
export class ConsultationAssessmentViewComponent {
  @Input({ required: true }) assessment!: ConsultationAssessment;
  @Input() language: ConsultationLanguage = 'en';
  @Input() hasSpanishAssessment = false;
  @Input() showResetAction = false;
  @Input() showStartAction = true;
  @Input() showDownloadAction = true;

  @Output() start = new EventEmitter<void>();
  @Output() download = new EventEmitter<void>();
  @Output() reset = new EventEmitter<void>();
  @Output() languageChange = new EventEmitter<ConsultationLanguage>();

  videoExpanded = false;

  get defaultTab(): 'osha' | 'trainings' {
    if (!this.assessment?.trainingRecommendations?.length) return 'osha';
    return (this.assessment?.importanceScore ?? 0) >= 70 ? 'osha' : 'trainings';
  }

  private _activeTab: 'osha' | 'trainings' | null = null;

  get activeTab(): 'osha' | 'trainings' {
    return this._activeTab ?? this.defaultTab;
  }

  get hasTrainings(): boolean {
    return !!this.assessment?.trainingRecommendations?.length;
  }

  switchTab(tab: 'osha' | 'trainings'): void {
    this._activeTab = tab;
  }

  trainingCategoryLabel(category: string): string {
    const labels = this.l;
    switch (category) {
      case 'osha-required': return labels.trainingCategoryOsha;
      case 'operational': return labels.trainingCategoryOperational;
      case 'equipment': return labels.trainingCategoryEquipment;
      case 'health-wellness': return labels.trainingCategoryHealth;
      default: return labels.trainingCategoryOperational;
    }
  }

  trackByTraining(_: number, training: ConsultationTrainingRecommendation): string {
    return training.title;
  }

  get l(): ConsultationLabels {
    return this.language === 'es' ? LABELS_ES : LABELS_EN;
  }

  get primaryCtaLabel(): string {
    return this.l.primaryCtaDefault;
  }

  get bottomCtaLabel(): string {
    return this.l.bottomCtaDefault;
  }

  get showLanguageToggle(): boolean {
    return this.hasSpanishAssessment;
  }

  toggleLanguage(): void {
    const next: ConsultationLanguage = this.language === 'es' ? 'en' : 'es';
    this.languageChange.emit(next);
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
    const labels = this.l;
    switch (this.scoreSeverity) {
      case 'critical': return labels.scoreCriticalTitle;
      case 'high': return labels.scoreHighTitle;
      case 'medium': return labels.scoreMediumTitle;
      default: return labels.scoreLowTitle;
    }
  }

  get scoreMeaningDescription(): string {
    const labels = this.l;
    switch (this.scoreSeverity) {
      case 'critical': return labels.scoreCriticalDesc;
      case 'high': return labels.scoreHighDesc;
      case 'medium': return labels.scoreMediumDesc;
      default: return labels.scoreLowDesc;
    }
  }

  get complianceWheel(): ComplianceWheelItem[] {
    if (!this.assessment) return [];

    const federal = this.assessment.federalRequirements;
    const recommended = this.assessment.recommendedProcesses;
    const state = this.assessment.stateRequirements;
    const labels = this.l;

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
        label: labels.wheelPosters,
        description: posters.length ? posters[0].title : labels.wheelPostersDefault,
        count: posters.length,
        accentClass: 'wheel-posters',
      },
      {
        label: labels.wheelRecordkeeping,
        description: recordkeeping.length ? recordkeeping[0].title : labels.wheelRecordkeepingDefault,
        count: recordkeeping.length,
        accentClass: 'wheel-recordkeeping',
      },
      {
        label: labels.wheelWrittenPlans,
        description: writtenPlans.length ? writtenPlans[0].title : labels.wheelWrittenPlansDefault,
        count: writtenPlans.length,
        accentClass: 'wheel-written-plans',
      },
      {
        label: labels.wheelTraining,
        description: training.length ? training[0].title : labels.wheelTrainingDefault,
        count: training.length,
        accentClass: 'wheel-training',
      },
      {
        label: labels.wheelOperationalControls,
        description: operationalControls.length
          ? operationalControls[0].title
          : labels.wheelOperationalControlsDefault,
        count: operationalControls.length,
        accentClass: 'wheel-controls',
      },
      {
        label: labels.wheelStateRules,
        description: state.length ? state[0].title : labels.wheelStateRulesDefault,
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
