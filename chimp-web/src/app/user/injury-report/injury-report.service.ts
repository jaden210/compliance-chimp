import { Injectable, inject } from "@angular/core";
import { Storage, ref, uploadString, getDownloadURL } from "@angular/fire/storage";
import { catchError, switchMap } from "rxjs/operators";
import { Observable, throwError, from } from "rxjs";
import { Firestore, collection, addDoc, doc, updateDoc } from "@angular/fire/firestore";
import { OshaCase } from "../../shared/osha-recordkeeping";

@Injectable()
export class InjuryReportService {
  private readonly storage = inject(Storage);
  private readonly db = inject(Firestore);

  public uploadSignature(signature: string, userId: string): Observable<string> {
    const date = new Date().getTime();
    const filePath = `signatures/${userId}/${date}`;
    const storageRef = ref(this.storage, filePath);
    return from(uploadString(storageRef, signature, "data_url")).pipe(
      switchMap(() => getDownloadURL(storageRef)),
      catchError(error => {
        console.error(`Error saving signature`, error);
        return throwError(() => error);
      })
    );
  }

  public createIncidentReport(
    teamId: string,
    incidentReport: IncidentReport
  ): Promise<any> {
    const cleanedReport = Object.fromEntries(
      Object.entries(incidentReport).filter(([_, v]) => v !== undefined)
    );
    return addDoc(collection(this.db, "incident-report"), cleanedReport)
      .catch(error => {
        console.error(`Error creating incident report`, error);
        throw error;
      });
  }

  public updateIncidentReport(reportId: string, patch: Partial<IncidentReport>): Promise<void> {
    const cleanedPatch = Object.fromEntries(
      Object.entries(patch).filter(([_, v]) => v !== undefined)
    );
    return updateDoc(doc(this.db, `incident-report/${reportId}`), cleanedPatch)
      .catch(error => {
        console.error(`Error updating incident report`, error);
        throw error;
      });
  }
}

export class IncidentReport {
  createdAt: Date;
  type: string;
  teamId: string;
  submittedBy: string;
  oshaCase?: OshaCase;
  questions: QuestionAnswer[] = [];
}

export interface QuestionAnswer {
  description: string;
  fieldId?: string;
  value: any;
  type: Type;
}

export class Question {
  description: string;
  fieldId?: string;
  type?: Type;
  radioOptions?: RadioOption[];
  next?: boolean;
  submit?: boolean;
  value?: any;
  skip?: boolean;
  showIf?: ShowIfCondition;
  getStarted?: boolean;
}

export interface RadioOption {
  name: string;
  value: string;
}

export interface ShowIfCondition {
  question: string;
  value: any;
}

export enum Type {
  signature = "signature",
  photos = "photos",
  radio = "radio",
  text = "text",
  date = "date"
}
