import { Injectable, Component, inject, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Observable, from, Subject, BehaviorSubject } from "rxjs";
import { collection, collectionData, doc, docData, Firestore, orderBy, query, setDoc, addDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { map, take, takeUntil } from "rxjs/operators";
import { AccountService } from "../account.service";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { FormsModule } from "@angular/forms";
import { MatNativeDateModule, DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, NativeDateAdapter, MAT_NATIVE_DATE_FORMATS } from "@angular/material/core";

// Coverage analysis interfaces
export interface CoverageAnalysis {
  success: boolean;
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendations: CoverageRecommendation[];
  industry: string;
  existingCount: number;
  analyzedAt: string;
  error?: string;
}

export interface CoverageRecommendation {
  name: string;
  description: string;
  frequency: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  baseQuestions: Categories[];
  questionCount: number;
}

export interface SelfInspectionTemplate {
  title: string;
  frequency: string;
  baseQuestions: Categories[];
  description?: string;
  reason?: string;
}

// Auto-build progress tracking
export interface AutoBuildProgress {
  phase: 'analyzing' | 'building' | 'complete' | 'error';
  iteration: number;
  maxIterations: number;
  currentScore: number;
  targetScore: number;
  inspectionsCreated: number;
  currentAction: string;
  error?: string;
  log: AutoBuildLogEntry[];
}

export interface AutoBuildLogEntry {
  type: 'analysis' | 'created' | 'info' | 'error';
  message: string;
  timestamp: Date;
}

@Injectable()
export class SelfInspectionsService {
  private readonly functions = inject(Functions);

  // Holds template data when creating from a recommendation
  private pendingTemplate: SelfInspectionTemplate | null = null;

  constructor(
    public db: Firestore,
    private accountService: AccountService
  ) {}

  /**
   * Set a pending template to be used when creating a new self-inspection
   */
  setPendingTemplate(template: SelfInspectionTemplate): void {
    this.pendingTemplate = template;
  }

  /**
   * Get and clear the pending template
   */
  consumePendingTemplate(): SelfInspectionTemplate | null {
    const template = this.pendingTemplate;
    this.pendingTemplate = null;
    return template;
  }

  /**
   * Check if there's a pending template
   */
  hasPendingTemplate(): boolean {
    return this.pendingTemplate !== null;
  }

  getSelfInspections(teamId: string = this.accountService.aTeam.id): Observable<SelfInspection[]> {
    const inspectionsRef = collection(this.db, `team/${teamId}/self-inspection`);
    const inspectionsQuery = query(inspectionsRef, orderBy("createdAt", "desc"));
    return collectionData(inspectionsQuery, { idField: "id" }) as Observable<SelfInspection[]>;
  }

  getSelfInspection(inspectionId: string, teamId: string = this.accountService.aTeam.id): Observable<SelfInspection> {
    const inspectionRef = doc(this.db, `team/${teamId}/self-inspection/${inspectionId}`);
    return docData(inspectionRef, { idField: "id" }) as Observable<SelfInspection>;
  }

  getSelfInspectionInspection(siId: string, iId: string, teamId: string = this.accountService.aTeam.id): Observable<Inspection> {
    const inspectionRef = doc(this.db, `team/${teamId}/self-inspection/${siId}/inspections/${iId}`);
    return docData(inspectionRef, { idField: "id" }) as Observable<Inspection>;
  }

  getInspections(selfInspectionId): Observable<Inspection[]> {
    const inspectionsRef = collection(this.db, `team/${this.accountService.aTeam.id}/self-inspection/${selfInspectionId}/inspections`);
    const inspectionsQuery = query(inspectionsRef, orderBy("createdAt", "desc"));
    return collectionData(inspectionsQuery, { idField: "id" }).pipe(
      map((inspections: any[]) => inspections.map((inspection) => ({
        ...inspection,
        createdAt: inspection.createdAt?.toDate ? inspection.createdAt.toDate() : inspection.createdAt,
        completedAt: inspection.completedAt?.toDate ? inspection.completedAt.toDate() : inspection.completedAt ?? null
      })))
    );
  }
    
  setSelfInspectionWithTemplate(selfInspection?): Observable<Categories[]> {
    let tempBaseQuestions: Categories[] = [];
    const templateRef = collection(this.db, "osha-assesment-template-en");
    const templateQuery = query(templateRef, orderBy("order", "asc"));
    return collectionData(templateQuery, { idField: "id" }).pipe(
      take(1),
      map((actions: any[]) => {
        actions.forEach((data) => {
          if (selfInspection) {
            let tempSubject = selfInspection.baseQuestions.find(category => category.subject === data.subject);
            if (tempSubject && tempSubject.questions) {
              tempSubject.questions.forEach(question => {
                let tQ = data.questions.find(tempQ => tempQ.name == question.name);
                if (tQ) {
                  tQ.selected = true;
                } else {
                  question.selected = true;
                  data.questions.push(question);
                }
              });
            }
          }
          tempBaseQuestions.push(data);
        });
        selfInspection.baseQuestions = tempBaseQuestions;
        return tempBaseQuestions;
      })
    );
  }

  saveOrCreateNewSelfInspection(selfInspection): Promise<any> { //wish I could get this to work the other way around
    let baseQuestions: Categories[] = [];
    selfInspection.baseQuestions.forEach(category => {
      let newQuestions: Question[] = [];
      category.questions.forEach(question => {
        if (question.selected) {
          const q: Question = { name: question.name };
          // Only include expectedAnswer if it's explicitly set to false (No is compliant)
          // Default behavior (undefined or true) means Yes is compliant
          if (question.expectedAnswer === false) {
            q.expectedAnswer = false;
          }
          newQuestions.push(q);
        }
      });
      if (newQuestions.length > 0)
      baseQuestions.push({ subject: category.subject, questions: newQuestions});
    });
    selfInspection.baseQuestions = baseQuestions;
    if (selfInspection.id) {
      const inspectionRef = doc(this.db, `team/${this.accountService.aTeam.id}/self-inspection/${selfInspection.id}`);
      const cleanedInspection = Object.fromEntries(
        Object.entries(selfInspection).filter(([_, v]) => v !== undefined)
      );
      return setDoc(inspectionRef, cleanedInspection);
    } else {
      selfInspection.teamId = this.accountService.aTeam.id;
      selfInspection.createdAt = new Date();
      const inspectionsRef = collection(this.db, `team/${this.accountService.aTeam.id}/self-inspection`);
      // Remove all undefined fields before saving to Firestore
      const dataToSave = Object.fromEntries(
        Object.entries(selfInspection).filter(([_, value]) => value !== undefined)
      );
      return addDoc(inspectionsRef, dataToSave);
    }
  }

  deleteSelfInspection(selfInspection, selfInspectionInspections): Promise<any> {
    let promises = [];
    selfInspectionInspections.forEach((inspection) => {
      let i = this.deleteSelfInspectionInspection(inspection, selfInspection);
      promises.push(i);
    })
    return Promise.all(promises).then(() => {
      const inspectionRef = doc(this.db, `team/${this.accountService.aTeam.id}/self-inspection/${selfInspection.id}`);
      return deleteDoc(inspectionRef);
    });
  }
  
  startInspection(selfInspection): Promise<Inspection> {
    let newInspection = new Inspection();
    newInspection.createdAt = new Date();
    newInspection.categories = selfInspection.baseQuestions;
    const inspectionsRef = collection(this.db, `team/${this.accountService.aTeam.id}/self-inspection/${selfInspection.id}/inspections`);
    // Remove undefined fields before saving to Firestore
    const dataToSave = Object.fromEntries(
      Object.entries(newInspection).filter(([_, value]) => value !== undefined)
    );
    return addDoc(inspectionsRef, dataToSave).then(snapshot => {
      newInspection.id = snapshot.id;
      return newInspection;
    });
  }
  
  deleteSelfInspectionInspection(inspection, selfInspection) {
    const inspectionRef = doc(this.db, `team/${this.accountService.aTeam.id}/self-inspection/${selfInspection.id}/inspections/${inspection.id}`);
    return deleteDoc(inspectionRef);
  }

  finishSelfInspection(inspection, selfInspection): Promise<any> {
    inspection.completedAt = new Date();
    inspection.teamId = this.accountService.aTeam.id;
    inspection.completedBy = this.accountService.user.id;
    selfInspection.lastCompletedAt = new Date();
    const selfInspectionRef = doc(this.db, `team/${this.accountService.aTeam.id}/self-inspection/${selfInspection.id}`);
    // Filter out undefined values to prevent Firebase errors
    const selfInspectionData = Object.fromEntries(
      Object.entries(selfInspection).filter(([_, value]) => value !== undefined)
    );
    updateDoc(selfInspectionRef, selfInspectionData);
    return this.saveSelfInspection(inspection, selfInspection);
  }

  saveSelfInspection(inspection, selfInspection): Promise<any> {
    const inspectionRef = doc(this.db, `team/${this.accountService.aTeam.id}/self-inspection/${selfInspection.id}/inspections/${inspection.id}`);
    // Filter out undefined values to prevent Firebase errors
    const dataToSave = Object.fromEntries(
      Object.entries(inspection).filter(([_, value]) => value !== undefined)
    );
    return setDoc(inspectionRef, dataToSave);
  }

  /**
   * Get OSHA template categories for the category picker
   */
  getOshaCategories(): Observable<Categories[]> {
    const templateRef = collection(this.db, "osha-assesment-template-en");
    const templateQuery = query(templateRef, orderBy("order", "asc"));
    return collectionData(templateQuery, { idField: "id" }).pipe(
      take(1),
      map((categories: any[]) => categories.map(cat => ({
        id: cat.id,
        subject: cat.subject,
        order: cat.order,
        questions: cat.questions || []
      })))
    ) as Observable<Categories[]>;
  }

  /**
   * Create a self-inspection from an AI recommendation immediately
   * Returns the created inspection with its Firestore ID
   */
  createFromRecommendation(recommendation: {
    name: string;
    frequency: string;
    baseQuestions: Categories[];
  }): Promise<SelfInspection> {
    const selfInspection: Partial<SelfInspection> = {
      title: recommendation.name,
      inspectionExpiration: recommendation.frequency,
      baseQuestions: recommendation.baseQuestions.map(cat => ({
        subject: cat.subject,
        questions: cat.questions.map(q => ({ name: q.name }))
      })),
      teamId: this.accountService.aTeam.id,
      createdAt: new Date()
    };

    const inspectionsRef = collection(this.db, `team/${this.accountService.aTeam.id}/self-inspection`);
    const dataToSave = Object.fromEntries(
      Object.entries(selfInspection).filter(([_, value]) => value !== undefined)
    );

    return addDoc(inspectionsRef, dataToSave).then(snapshot => {
      return {
        ...selfInspection,
        id: snapshot.id
      } as SelfInspection;
    });
  }

  /**
   * Update the entire self-inspection document (for real-time saves)
   */
  updateSelfInspection(selfInspection: SelfInspection): Promise<void> {
    if (!selfInspection.id) {
      return Promise.reject('No inspection ID provided');
    }
    const inspectionRef = doc(this.db, `team/${this.accountService.aTeam.id}/self-inspection/${selfInspection.id}`);
    const dataToSave = Object.fromEntries(
      Object.entries(selfInspection).filter(([_, value]) => value !== undefined)
    );
    return setDoc(inspectionRef, dataToSave);
  }

  /**
   * Analyze inspection coverage using AI
   * Compares existing inspections against industry requirements and suggests gaps
   */
  analyzeCoverage(inspections: SelfInspection[]): Observable<CoverageAnalysis> {
    const team = this.accountService.aTeam;
    const industry = team?.industry;
    
    if (!industry) {
      return from(Promise.resolve({
        success: false,
        score: 0,
        summary: '',
        strengths: [],
        gaps: [],
        recommendations: [],
        industry: '',
        existingCount: 0,
        analyzedAt: new Date().toISOString(),
        error: 'No industry set for this team'
      } as CoverageAnalysis));
    }

    // Prepare inspection data for the API call
    const existingInspections = inspections.map(i => ({
      title: i.title,
      inspectionExpiration: i.inspectionExpiration,
      baseQuestions: i.baseQuestions.map(cat => ({
        subject: cat.subject,
        questions: cat.questions.map(q => ({ name: q.name }))
      }))
    }));

    // Prepare team member info with roles
    const teamMembers = this.accountService.teamMembers?.map(tm => ({
      name: tm.name || 'Team member',
      jobTitle: tm.jobTitle || ''
    })) || [];

    // Get unique job titles/roles for context
    const jobTitles = [...new Set(teamMembers.map(tm => tm.jobTitle).filter(Boolean))];

    const analyzeFunction = httpsCallable(this.functions, 'analyzeInspectionCoverage');
    
    return from(
      analyzeFunction({
        // Business context
        businessName: team.name || '',
        businessWebsite: team.website || '',
        industry: industry,
        teamId: team.id,
        // Team context
        teamSize: teamMembers.length,
        jobTitles: jobTitles,
        teamMembers: teamMembers,
        // Existing inspections
        existingInspections: existingInspections
      }).then((result: any) => result.data as CoverageAnalysis)
        .catch(error => ({
          success: false,
          score: 0,
          summary: '',
          strengths: [],
          gaps: [],
          recommendations: [],
          industry: industry,
          existingCount: inspections.length,
          analyzedAt: new Date().toISOString(),
          error: error.message || 'Failed to analyze coverage'
        } as CoverageAnalysis))
    );
  }

  /**
   * Get cached coverage analysis from the team document.
   * Returns the cached analysis if it exists and is not stale, otherwise null.
   */
  getCachedCoverageAnalysis(): CoverageAnalysis | null {
    const team = this.accountService.aTeam;
    if (!team) return null;

    // Check if we have a cached analysis that isn't stale
    if (team.coverageAnalysis && !team.coverageAnalysisStale) {
      return team.coverageAnalysis as CoverageAnalysis;
    }

    return null;
  }

  /**
   * Check if the coverage analysis needs to be refreshed.
   * Returns true if there's no cached analysis or if it's marked as stale.
   */
  isCoverageAnalysisStale(): boolean {
    const team = this.accountService.aTeam;
    if (!team) return true;

    // Stale if no cached analysis or explicitly marked stale
    if (!team.coverageAnalysis || team.coverageAnalysisStale) {
      return true;
    }

    return false;
  }

  /**
   * Auto-build inspections iteratively until reaching target coverage
   * Loops through coverage analysis and inspection creation until:
   * - Coverage score >= targetScore (95%)
   * - No more recommendations
   * - Max iterations reached (5)
   * - Cancelled via the returned cancel function
   */
  autoBuildInspections(): { 
    progress$: BehaviorSubject<AutoBuildProgress>; 
    cancel: () => void;
  } {
    const MAX_ITERATIONS = 5;
    const TARGET_SCORE = 95;
    const MAX_INSPECTIONS_PER_ITERATION = 3;
    
    const cancelSubject = new Subject<void>();
    let cancelled = false;
    
    const progress$ = new BehaviorSubject<AutoBuildProgress>({
      phase: 'analyzing',
      iteration: 1,
      maxIterations: MAX_ITERATIONS,
      currentScore: 0,
      targetScore: TARGET_SCORE,
      inspectionsCreated: 0,
      currentAction: 'Starting coverage analysis...',
      log: [{
        type: 'info',
        message: 'Starting auto-build process',
        timestamp: new Date()
      }]
    });

    const cancel = () => {
      cancelled = true;
      cancelSubject.next();
      cancelSubject.complete();
      const current = progress$.value;
      progress$.next({
        ...current,
        phase: 'error',
        currentAction: 'Build cancelled by user',
        error: 'Build cancelled by user',
        log: [...current.log, {
          type: 'info',
          message: 'Build cancelled by user',
          timestamp: new Date()
        }]
      });
    };

    // Run the auto-build loop
    this.runAutoBuildLoop(progress$, cancelSubject, MAX_ITERATIONS, TARGET_SCORE, MAX_INSPECTIONS_PER_ITERATION);

    return { progress$, cancel };
  }

  private async runAutoBuildLoop(
    progress$: BehaviorSubject<AutoBuildProgress>,
    cancelSubject: Subject<void>,
    maxIterations: number,
    targetScore: number,
    maxInspectionsPerIteration: number
  ): Promise<void> {
    let iteration = 1;
    let totalCreated = 0;
    let currentInspections: SelfInspection[] = [];

    while (iteration <= maxIterations) {
      // Check if cancelled
      if (cancelSubject.closed) return;

      // Update progress - analyzing phase
      const currentProgress = progress$.value;
      progress$.next({
        ...currentProgress,
        phase: 'analyzing',
        iteration,
        currentAction: `Analyzing coverage (iteration ${iteration}/${maxIterations})...`,
        log: [...currentProgress.log, {
          type: 'info',
          message: `Starting iteration ${iteration}`,
          timestamp: new Date()
        }]
      });

      try {
        // Fetch current inspections
        currentInspections = await new Promise<SelfInspection[]>((resolve, reject) => {
          this.getSelfInspections().pipe(
            take(1),
            takeUntil(cancelSubject)
          ).subscribe({
            next: resolve,
            error: reject
          });
        });

        if (cancelSubject.closed) return;

        // Run coverage analysis
        const analysis = await new Promise<CoverageAnalysis>((resolve, reject) => {
          this.analyzeCoverage(currentInspections).pipe(
            take(1),
            takeUntil(cancelSubject)
          ).subscribe({
            next: resolve,
            error: reject
          });
        });

        if (cancelSubject.closed) return;

        if (!analysis.success) {
          throw new Error(analysis.error || 'Coverage analysis failed');
        }

        // Log analysis result
        const afterAnalysis = progress$.value;
        progress$.next({
          ...afterAnalysis,
          currentScore: analysis.score,
          currentAction: `Coverage score: ${analysis.score}%`,
          log: [...afterAnalysis.log, {
            type: 'analysis',
            message: `Coverage analysis complete: ${analysis.score}% score`,
            timestamp: new Date()
          }]
        });

        // Check if target reached
        if (analysis.score >= targetScore) {
          const finalProgress = progress$.value;
          progress$.next({
            ...finalProgress,
            phase: 'complete',
            currentAction: `Target coverage reached: ${analysis.score}%`,
            log: [...finalProgress.log, {
              type: 'info',
              message: `Target coverage of ${targetScore}% reached! Final score: ${analysis.score}%`,
              timestamp: new Date()
            }]
          });
          return;
        }

        // Check if there are recommendations
        const recommendations = analysis.recommendations || [];
        if (recommendations.length === 0) {
          const finalProgress = progress$.value;
          progress$.next({
            ...finalProgress,
            phase: 'complete',
            currentAction: 'No more recommendations available',
            log: [...finalProgress.log, {
              type: 'info',
              message: 'No more recommendations - build complete',
              timestamp: new Date()
            }]
          });
          return;
        }

        // Build inspections from recommendations (high priority first, limited per iteration)
        const sortedRecs = [...recommendations].sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
        });

        const recsToCreate = sortedRecs.slice(0, maxInspectionsPerIteration);

        // Switch to building phase
        const buildingProgress = progress$.value;
        progress$.next({
          ...buildingProgress,
          phase: 'building',
          currentAction: `Creating ${recsToCreate.length} inspection(s)...`,
          log: [...buildingProgress.log, {
            type: 'info',
            message: `Found ${recommendations.length} recommendations, creating top ${recsToCreate.length}`,
            timestamp: new Date()
          }]
        });

        // Create each inspection
        for (const rec of recsToCreate) {
          if (cancelSubject.closed) return;

          const beforeCreate = progress$.value;
          progress$.next({
            ...beforeCreate,
            currentAction: `Creating: ${rec.name}...`
          });

          try {
            await this.createFromRecommendation({
              name: rec.name,
              frequency: rec.frequency,
              baseQuestions: rec.baseQuestions
            });

            totalCreated++;
            const afterCreate = progress$.value;
            progress$.next({
              ...afterCreate,
              inspectionsCreated: totalCreated,
              log: [...afterCreate.log, {
                type: 'created',
                message: `Created: ${rec.name}`,
                timestamp: new Date()
              }]
            });
          } catch (createError: any) {
            const errorProgress = progress$.value;
            progress$.next({
              ...errorProgress,
              log: [...errorProgress.log, {
                type: 'error',
                message: `Failed to create ${rec.name}: ${createError.message}`,
                timestamp: new Date()
              }]
            });
            // Continue with next recommendation
          }
        }

        iteration++;
      } catch (error: any) {
        const errorProgress = progress$.value;
        progress$.next({
          ...errorProgress,
          phase: 'error',
          currentAction: `Error: ${error.message}`,
          error: error.message,
          log: [...errorProgress.log, {
            type: 'error',
            message: `Error: ${error.message}`,
            timestamp: new Date()
          }]
        });
        return;
      }
    }

    // Max iterations reached
    const finalProgress = progress$.value;
    progress$.next({
      ...finalProgress,
      phase: 'complete',
      currentAction: `Completed after ${maxIterations} iterations`,
      log: [...finalProgress.log, {
        type: 'info',
        message: `Max iterations (${maxIterations}) reached - build complete`,
        timestamp: new Date()
      }]
    });
  }
}

export class SelfInspection {
  id?: string;
  teamId: string;
  createdAt: any;
  title: string;
  baseQuestions: Categories[] = [];
  inspectionExpiration?: string = ExperationTimeFrame.Manual;
  lastCompletedAt?: any;
  lastReminderSent?: any;
  nextDueDate?: any; // Optional manual override for next due date
}

export class Inspection {
  id?: string;
  createdAt: any;
  completedAt?: any;
  categories: Categories[] = [];
  completedPercent: number = 0;
  compliantPercent: number = 0;
  teamId?: string;
  completedBy?: string;
}

export class Categories {
  id?: string;
  order?: number;
  subject: string;
  questions: Question[] = [];
  show?: boolean; // used in html
  finished?: boolean = false; // used in html
}

export class Question {
  id?: string;
  name: string;
  selected?: boolean;
  expectedAnswer?: boolean; // true = Yes is compliant, false = No is compliant (defaults to true)
  answer?: boolean;
  comment?: string;
  images?: any = [];
}

export enum ExperationTimeFrame {
  Manual = "Manual",
  Anually = "Anually",
  SemiAnually = "Semi-Anually",
  Quarterly = "Quarterly",
  Montly = "Monthly"
}

@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
  <h2 mat-dialog-title>Are you sure?</h2>
  <mat-dialog-content>Are you sure you want to delete this self-inspection? All data related to this self-inspection will be lost.</mat-dialog-content>
  <mat-dialog-actions style="margin-top:12px" align="end"><button mat-button color="primary" style="margin-right:8px" (click)="close(false)">CANCEL</button>
  <button mat-flat-button color="warn" (click)="close(true)">DELETE</button>
  </mat-dialog-actions>
  `
})
export class DeleteInspectionDialog {
  constructor(
    public dialogRef: MatDialogRef<DeleteInspectionDialog>
  ) {}

  close(shouldDelete) {
    this.dialogRef.close(shouldDelete);
  }
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatNativeDateModule
  ],
  providers: [
    { provide: DateAdapter, useClass: NativeDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MAT_NATIVE_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: 'en-US' }
  ],
  template: `
    <h2 mat-dialog-title>Adjust Next Due Date</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width: 100%; margin-top: 8px;">
        <mat-label>Next Due Date</mat-label>
        <input matInput [matDatepicker]="picker" [(ngModel)]="selectedDate" [min]="minDate">
        <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
        <mat-datepicker #picker></mat-datepicker>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!selectedDate" (click)="save()">Save</button>
    </mat-dialog-actions>
  `
})
export class EditDueDateDialog {
  selectedDate: Date | null;
  minDate: Date;

  constructor(
    public dialogRef: MatDialogRef<EditDueDateDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { currentDate: Date | null }
  ) {
    this.selectedDate = data.currentDate;
    this.minDate = new Date();
    // Set to start of today
    this.minDate.setHours(0, 0, 0, 0);
  }

  save() {
    this.dialogRef.close(this.selectedDate);
  }
}