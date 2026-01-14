import { Injectable, Component } from "@angular/core";
import { Observable } from "rxjs";
import { collection, collectionData, doc, docData, Firestore, orderBy, query, setDoc, addDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import { map, take } from "rxjs/operators";
import { UserService } from "../user.service";
import { MatDialogRef } from "@angular/material/dialog";

@Injectable()
export class SelfInspectionsService {

  constructor(
    public db: Firestore,
    private userService: UserService
  ) {}

  getSelfInspections(teamId: string = this.userService.aTeam.id): Observable<SelfInspection[]> {
    const inspectionsRef = collection(this.db, `team/${teamId}/self-inspection`);
    const inspectionsQuery = query(inspectionsRef, orderBy("createdAt", "desc"));
    return collectionData(inspectionsQuery, { idField: "id" }) as Observable<SelfInspection[]>;
  }

  getSelfInspection(inspectionId: string, teamId: string = this.userService.aTeam.id): Observable<SelfInspection> {
    const inspectionRef = doc(this.db, `team/${teamId}/self-inspection/${inspectionId}`);
    return docData(inspectionRef, { idField: "id" }) as Observable<SelfInspection>;
  }

  getSelfInspectionInspection(siId: string, iId: string, teamId: string = this.userService.aTeam.id): Observable<Inspection> {
    const inspectionRef = doc(this.db, `team/${teamId}/self-inspection/${siId}/inspections/${iId}`);
    return docData(inspectionRef, { idField: "id" }) as Observable<Inspection>;
  }

  getInspections(selfInspectionId): Observable<Inspection[]> {
    const inspectionsRef = collection(this.db, `team/${this.userService.aTeam.id}/self-inspection/${selfInspectionId}/inspections`);
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
        if (question.selected)
        newQuestions.push({name: question.name});
      });
      if (newQuestions.length > 0)
      baseQuestions.push({subject: category.subject, questions: newQuestions});
    });
    selfInspection.baseQuestions = baseQuestions;
    if (selfInspection.id) {
      const inspectionRef = doc(this.db, `team/${this.userService.aTeam.id}/self-inspection/${selfInspection.id}`);
      return setDoc(inspectionRef, { ...selfInspection });
    } else {
      selfInspection.teamId = this.userService.aTeam.id;
      selfInspection.createdAt = new Date();
      const inspectionsRef = collection(this.db, `team/${this.userService.aTeam.id}/self-inspection`);
      return addDoc(inspectionsRef, { ...selfInspection });
    }
  }

  deleteSelfInspection(selfInspection, selfInspectionInspections): Promise<any> {
    let promises = [];
    selfInspectionInspections.forEach((inspection) => {
      let i = this.deleteSelfInspectionInspection(inspection, selfInspection);
      promises.push(i);
    })
    return Promise.all(promises).then(() => {
      const inspectionRef = doc(this.db, `team/${this.userService.aTeam.id}/self-inspection/${selfInspection.id}`);
      return deleteDoc(inspectionRef);
    });
  }
  
  startInspection(selfInspection): Promise<Inspection> {
    let newInspection = new Inspection();
    newInspection.createdAt = new Date();
    newInspection.categories = selfInspection.baseQuestions;
    const inspectionsRef = collection(this.db, `team/${this.userService.aTeam.id}/self-inspection/${selfInspection.id}/inspections`);
    return addDoc(inspectionsRef, { ...newInspection }).then(snapshot => {
      newInspection.id = snapshot.id;
      return newInspection;
    });
  }
  
  deleteSelfInspectionInspection(inspection, selfInspection) {
    const inspectionRef = doc(this.db, `team/${this.userService.aTeam.id}/self-inspection/${selfInspection.id}/inspections/${inspection.id}`);
    return deleteDoc(inspectionRef);
  }

  finishSelfInspection(inspection, selfInspection): Promise<any> {
    inspection.completedAt = new Date();
    inspection.teamId = this.userService.aTeam.id;
    inspection.completedBy = this.userService.loggedInUser.id;
    selfInspection.lastCompletedAt = new Date();
    const selfInspectionRef = doc(this.db, `team/${this.userService.aTeam.id}/self-inspection/${selfInspection.id}`);
    updateDoc(selfInspectionRef, { ...selfInspection });
    return this.saveSelfInspection(inspection, selfInspection);
  }

  saveSelfInspection(inspection, selfInspection): Promise<any> {
    const inspectionRef = doc(this.db, `team/${this.userService.aTeam.id}/self-inspection/${selfInspection.id}/inspections/${inspection.id}`);
    return setDoc(inspectionRef, { ...inspection });
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