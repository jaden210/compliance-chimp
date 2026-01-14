import { Injectable } from "@angular/core";
import { Firestore, collection, collectionData, doc, updateDoc, query, orderBy, where } from "@angular/fire/firestore";
import { Router } from "@angular/router";
import { AccountService, User } from "../account.service";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { HelpArticle } from "src/app/help-dialog/help-dialog.component";

@Injectable()
export class SupportService {

  makeBlog: boolean = false;
  blog;
  makeArticle: boolean = false;
  article: HelpArticle;

  constructor(
    public db: Firestore,
    public accountService: AccountService,
    public router: Router
  ) {}

  getSupportItems(): Observable<Support[]> {
    const supportQuery = query(collection(this.db, "support"), orderBy("createdAt", "desc"));
    return collectionData(supportQuery, { idField: "id" }).pipe(
      map((actions: any[]) => actions.map((data) => ({
        ...data,
        createdAt: data["createdAt"]?.toDate ? data["createdAt"].toDate() : data["createdAt"]
      })))
    );
  }

  getSupportItemUser(email): Observable<User[]> {
    return collectionData(query(collection(this.db, "user"), where("email", "==", email)), { idField: "id" }) as Observable<User[]>;
  }

  setSupportReplied(id) {
    return updateDoc(doc(this.db, `support/${id}`), { respondedAt: new Date() });
  }

  getFeedbackItems(): Observable<any> {
    const feedbackQuery = query(collection(this.db, "feedback"), orderBy("createdAt", "desc"));
    return collectionData(feedbackQuery, { idField: "id" }).pipe(
      map((actions: any[]) => actions.map((data) => ({
        ...data,
        createdAt: data["createdAt"]?.toDate ? data["createdAt"].toDate() : data["createdAt"]
      })))
    );
  }

  setFeedbackClosed(id): Promise<any> {
    return updateDoc(doc(this.db, `feedback/${id}`), { isClosed: true });
  }

  getInspectionCollection(collectionName): Observable<any> {
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

  getBlogs(): Observable<Blog[]> {
    return collectionData(collection(this.db, "blog"), { idField: "id" }).pipe(
      map((actions: any[]) =>
        actions.map((data: any) => ({
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
        }))
      )
    );
  }

  getBlogTopics(): Observable<any> {
    return collectionData(collection(this.accountService.db, "blog-topic"), { idField: "id" });
  }
}

export class Support {
  id?: string;
  createdAt: any;
  email?: string;
  body: string;
  isUser?: boolean = false;
  user?: User;

  respondedAt?: any;
  notes?: string;
}


export class Blog {
  content: string;
  contentEs: string;
  name: string;
  nameEs: string;
  topicId: string;
  id?: string;
  linkName?: string;
  createdAt: any;
}