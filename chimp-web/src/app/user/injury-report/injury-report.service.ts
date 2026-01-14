import { Injectable } from "@angular/core";
import { Storage, ref, uploadBytes, uploadString, getDownloadURL } from "@angular/fire/storage";
import { catchError, switchMap } from "rxjs/operators";
import { Observable, throwError, from } from "rxjs";
import { Firestore, collection, addDoc } from "@angular/fire/firestore";

@Injectable()
export class InjuryReportService {
  constructor(
    private storage: Storage,
    private db: Firestore
  ) {}

  public uploadSignature(signature, userId): Observable<string> {
    const date = new Date().getTime();
    const filePath = `signatures/${userId}/${date}`;
    const storageRef = ref(this.storage, filePath);
    return from(uploadString(storageRef, signature, "data_url")).pipe(
      switchMap(() => getDownloadURL(storageRef)),
      catchError(error => {
        console.error(`Error saving signature`, error);
        return throwError(error);
      })
    );
  }

  public createIncidentReport(
    teamId,
    incidentReport: IncidentReport
  ): Promise<any> {
    return addDoc(collection(this.db, "incident-report"), { ...incidentReport })
      .catch(error => {
        console.error(`Error creating incident report`, error);
        throw error;
      });
  }

  public uploadImage(image, userId): Observable<string> {
    const date = new Date().getTime();
    const filePath = `incidentPhotos/${userId}/${date}`;
    const storageRef = ref(this.storage, filePath);
    return from(uploadBytes(storageRef, image)).pipe(
      switchMap(() => getDownloadURL(storageRef)),
      catchError(error => {
        console.error(`Error saving image for topic`, error);
        return throwError(error);
      })
    );
  }
}

export class IncidentReport {
  createdAt: any;
  type: string;
  teamId: string;
  submittedBy: string;
  questions: any[] = [];
}

export class Question {
  description: string;
  type?: Type;
  radioOptions?: { name: string; value: string }[];
  next?: boolean;
  submit?: boolean;
  value?: any;
  skip?: boolean;
  showIf: { question: string; value: any };
  getStarted?: boolean;
}

export enum Type {
  signature = "signature",
  photos = "photos",
  radio = "radio",
  text = "text",
  date = "date"
}
