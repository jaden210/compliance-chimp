import { Injectable } from "@angular/core";
import { of, Observable, throwError } from "rxjs";
import { map, catchError, switchMap, take } from "rxjs/operators";
import { AccountService } from "../account.service";
import { Firestore, collection, collectionData, doc, query, orderBy, limit as limitQuery, setDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from "@angular/fire/storage";
import { from } from "rxjs";

@Injectable()
export class LogService {
  constructor(
    private accountService: AccountService,
    private storage: Storage,
    private db: Firestore
  ) {}

  public getLogs(teamId, limit): Observable<any> {
    return collectionData(
      query(collection(this.db, `team/${teamId}/log`), orderBy("createdAt", "desc"), limitQuery(limit)),
      { idField: "id" }
    ).pipe(
      map((actions: any[]) =>
        actions.map((data) => {
          const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
          return { ...data, createdAt };
        })
      ),
      catchError(error => {
        console.error(error);
        return of([]);
      })
    );
  }

  public getAllLogs(teamId): Observable<any> {
    return collectionData(
      query(collection(this.db, `team/${teamId}/log`), orderBy("createdAt", "desc")),
      { idField: "id" }
    ).pipe(
      take(1),
      map((actions: any[]) =>
        actions.map((data) => ({
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
        }))
      )
    );
  }

  public generateLogId(teamId): string {
    return doc(collection(this.db, `team/${teamId}/log`)).id;
  }

  public createLog(log: Log, teamId): Promise<any> {
    let id = log.id;
    let logC = { ...log };
    delete logC.id;
    Object.keys(logC).forEach(key => {
      if (!logC[key]) delete logC[key];
    });
    return setDoc(doc(this.db, `team/${teamId}/log/${id}`), logC)
      .catch(error => {
        console.error("Error creating log", error);
        throw error;
      });
  }

  public uploadImage(image, teamId): Observable<string> {
    const date = new Date().getTime();
    const filePath = `${teamId}/logImages/${date}`;
    const storageRef = ref(this.storage, filePath);
    return from(uploadBytes(storageRef, image)).pipe(
      switchMap(() => getDownloadURL(storageRef)),
      catchError(error => {
        console.error(`Error saving image for topic`, error);
        return throwError(error);
      })
    );
  }

  public updateLog(log, teamId): Promise<void> {
    let id = log.id;
    let logC = { ...log };
    delete logC.id;
    Object.keys(logC).forEach(key => {
      if (!logC[key]) delete logC[key];
    });
    return updateDoc(doc(this.db, `team/${teamId}/log/${id}`), logC)
      .catch(error => {
        console.error("Error updating log", error);
        throw error;
      });
  }

  public deleteLog(logId, teamId): Promise<void> {
    return deleteDoc(doc(this.db, `team/${teamId}/log/${logId}`))
      .catch(e => {
        console.error("Error deleting log.", e);
        throw e;
      });
  }

  /* Removes image from storage if log is deleted */
  public removeImage(imageUrl): void {
    deleteObject(ref(this.storage, imageUrl))
      .catch(e => console.error("Error removing image.", e));
  }
}

export class Log {
  id: string;
  createdAt: Date;
  userId: string;
  description: string;
  images: any[];
  LatPos: number;
  LongPos: number;
}
