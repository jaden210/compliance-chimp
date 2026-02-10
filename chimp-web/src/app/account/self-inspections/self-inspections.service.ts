import { Injectable, Component, inject, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Observable, from } from "rxjs";
import { collection, collectionData, doc, docData, Firestore, orderBy, query, setDoc, addDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { map, take } from "rxjs/operators";
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

@Injectable()
export class SelfInspectionsService {
  private readonly functions = inject(Functions);

  constructor(
    public db: Firestore,
    private accountService: AccountService
  ) {}

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
   * Create a new self-inspection and save it to Firestore
   * Returns a Promise that resolves when saved
   */
  createSelfInspection(inspection: Partial<SelfInspection>): Promise<any> {
    const data = {
      ...inspection,
      teamId: inspection.teamId || this.accountService.aTeam.id,
      createdAt: inspection.createdAt || new Date()
    };

    const inspectionsRef = collection(this.db, `team/${this.accountService.aTeam.id}/self-inspection`);
    const dataToSave = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    return addDoc(inspectionsRef, dataToSave);
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