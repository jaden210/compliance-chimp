import { Injectable, Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Observable } from "rxjs";
import { collection, collectionData, doc, docData, Firestore, orderBy, query, setDoc, addDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import { map, take } from "rxjs/operators";
import { AccountService } from "../account.service";
import { MatDialogRef, MatDialogModule } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";

@Injectable()
export class SelfInspectionsService {

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
    
  setSelfInspectionWithTemplate(selfInspection?): void {
    let tempBaseQuestions = [];
    const templateRef = collection(this.db, "osha-assesment-template-en");
    const templateQuery = query(templateRef, orderBy("order", "asc"));
    collectionData(templateQuery, { idField: "id" }).pipe(
      take(1),
      map((actions: any[]) => actions.map((data) => {
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
        return data;
      }))
    ).subscribe(() => {
      selfInspection.baseQuestions = tempBaseQuestions;
    });
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
      return setDoc(inspectionRef, { ...selfInspection });
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