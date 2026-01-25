import { Injectable, signal } from "@angular/core";
import { Firestore, collection, collectionData, query, orderBy } from "@angular/fire/firestore";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { HelpArticle } from "src/app/help-dialog/help-dialog.component";

@Injectable()
export class SupportService {
  readonly makeArticle = signal(false);
  readonly article = signal<HelpArticle | null>(null);

  constructor(public db: Firestore) {}

  getInspectionCollection(collectionName: string): Observable<any[]> {
    const inspectionQuery = query(collection(this.db, collectionName), orderBy("order", "asc"));
    return collectionData(inspectionQuery, { idField: "id" });
  }

  getHelpArticles(): Observable<HelpArticle[]> {
    return collectionData(collection(this.db, "help-article"), { idField: "id" }).pipe(
      map((actions: any[]) =>
        actions.map((data: any) => ({
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
        }))
      )
    );
  }
}