import { Injectable, inject } from "@angular/core";
import { Firestore, collection, collectionData, query, orderBy } from "@angular/fire/firestore";
import { Observable } from "rxjs";

@Injectable({ providedIn: "root" })
export class SupportService {
  readonly db = inject(Firestore);

  getInspectionCollection(collectionName: string): Observable<any[]> {
    const inspectionQuery = query(collection(this.db, collectionName), orderBy("order", "asc"));
    return collectionData(inspectionQuery, { idField: "id" });
  }
}