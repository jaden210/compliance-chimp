import { Injectable } from "@angular/core";
import { of, Observable, combineLatest, merge } from "rxjs";
import { Firestore, collection, collectionData, doc, docData, query, where, orderBy, addDoc, deleteDoc } from "@angular/fire/firestore";
import { Router } from "@angular/router";
import { map, catchError, tap, take, mergeMap } from "rxjs/operators";
import { AccountService } from "../account.service";
import { Survey } from "../survey/survey";

@Injectable({
  providedIn: "root"
})
export class TrainingService {
  private industries: Industry[] = [];
  private topics: Topic[] = [];
  private articles: Article[] = [];
  private myContent: MyContent[] = [];
  private activeRoute: string;

  constructor(
    public db: Firestore,
    public accountService: AccountService,
    public router: Router
  ) {}

  public getIndustries(): Observable<Industry[]> {
    return this.industries.length
      ? of(this.industries)
      : collectionData(query(collection(this.db, "industry"), orderBy("name", "asc")), { idField: "id" })
          .pipe(
            take(1),
            map((industries: any[]) => industries as Industry[]),
            tap(industries => (this.industries = industries)),
            catchError(error => {
              console.error(`Error loading industries collection. ${error}`);
              alert(`Error loading industries collection`);
              return of([]);
            })
          );
  }

  /* will automatically unsubscribe with async pipe */
  /* This function merges two collections together */
  public getTopics(
    industryId,
    teamId,
    forceRefresh = false
  ): Observable<Topic[]> {
    if (forceRefresh) this.topics = [];
    const topics = this.topics.filter(t => t.industryId == industryId);
    return topics.length
      ? of(topics)
      : combineLatest(
          collectionData(query(collection(this.db, "topic"), where("industryId", "==", industryId)), { idField: "id" }),
          collectionData(query(collection(this.db, `team/${teamId}/topic`), where("industryId", "==", industryId)), { idField: "id" })
        ).pipe(
          take(1),
          map(topics => {
            const [generalTopics, customTopics] = topics;
            const combined = generalTopics.concat(customTopics);
            return combined as Topic[];
          }),
          map(topics => {
            return topics.sort((a, b) =>
              a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
            );
          }),
          tap(topics => (this.topics = topics)),
          catchError(error => {
            console.error(`Error loading topics collection. ${error}`);
            alert(`Error loading topics collection for `);
            return of([]);
          })
        );
  }

  /* Called from create-edit component to get fresh data on back route */
  public wipeArticles(): void {
    this.articles = [];
  }

  /* This function merges two collections together */
  public getArticles(teamId, topicId?): Observable<Article[]> {
    const articles = topicId
      ? this.articles.filter(a => a.topicId == topicId)
      : [];
    return articles.length
      ? of(articles)
      : this.getMyContent(teamId).pipe(
          mergeMap(mYContent =>
            combineLatest(
              collectionData(query(collection(this.db, "article"), where("topicId", "==", topicId)), { idField: "id" }),
              collectionData(query(collection(this.db, `team/${teamId}/article`), where("topicId", "==", topicId)), { idField: "id" })
            ).pipe(
              take(1),
              map(articles => {
                const [generalArticles, customArticles] = articles;
                const combined = generalArticles.concat(customArticles);
                return combined.map(article => {
                  const data = article as Article;
                  const id = data.id;
                  const myContent = mYContent.find(mc => mc.articleId == id);
                  const favorited = myContent ? !myContent.disabled : false;
                  return { ...data, id, myContent, favorited };
                });
              }),
              map(articles => {
                return articles.sort((a, b) =>
                  a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
                );
              }),
              tap(articles => {
                this.articles = articles;
              }),
              catchError(error => {
                console.error(`Error loading articles collection. ${error}`);
                alert(`Error loading articles collection`);
                return of([]);
              })
            )
          )
        );
  }

  /* This function merges two collections together */
  public getOshaContent(): Observable<any[]> {
    return combineLatest([
      collectionData(collection(this.db, "article"), { idField: "id" }),
      collectionData(collection(this.db, "topic"), { idField: "id" }),
      collectionData(collection(this.db, "industry"), { idField: "id" })
    ]);
  }

  public getLibrary(teamId: string): Observable<any[]> {
    return collectionData(query(collection(this.db, "library"), where("teamId", "==", teamId)), { idField: "id" });
  }

  public getChimpChats(): Observable<any[]> {
    return collectionData(collection(this.db, "chimp-chats"), { idField: "id" });
  }

  /* if the article id contains the teamId, pull from team/article collection */
  public getArticle(articleId, teamId): Observable<Article> {
    const articleRef = articleId.includes(teamId)
      ? doc(this.db, `team/${teamId}/article/${articleId}`)
      : doc(this.db, `article/${articleId}`);
    return this.getMyContent(teamId).pipe(
      mergeMap(mYContent =>
        docData(articleRef, { idField: "id" }).pipe(
          take(1),
          map((article: any) => {
            const data = article as Article;
            const id = data.id;
            const myContent = mYContent.find(mc => mc.articleId == id);
            const favorited = myContent ? !myContent.disabled : false;
            return { ...data, id, myContent, favorited };
          }),
          catchError(error => {
            console.error(`Error loading article. ${error}`);
            alert(`Error loading article`);
            return of(null);
          })
        )
      )
    );
  }

  /* Gets entire collection, stores in local cache */
  public getMyContent(teamId, forceRefresh = false): Observable<MyContent[]> {
    if (forceRefresh) this.myContent = [];
    return this.myContent.length
      ? of(this.myContent)
      : collectionData(
          query(
            collection(this.db, `training-content/${teamId}/articles`),
            where("disabled", "==", false),
            where("trainingMinutes", ">=", 0),
            orderBy("trainingMinutes", "asc")
          ),
          { idField: "id" }
        ).pipe(
          take(1),
          map((allContent: any[]) =>
            allContent.map((content) => {
              const data = content as MyContent;
              const id = data.id;
              const needsTraining = this.getExpiredTrainees(data);
              const complianceLevel = this.getComplianceLevel(
                data.shouldReceiveTraining,
                needsTraining
              );
              return { ...data, id, needsTraining, complianceLevel };
            })
          ),
            tap(myContent => (this.myContent = myContent || [])),
            catchError(error => {
              console.error(`Error loading my-content collection. ${error}`);
              alert(`Error loading my-content collection`);
              return of([]);
            })
          );
  }

  /* Returns a percentage of people who are current of total trainees */
  private getComplianceLevel(
    trainees: object,
    needsTraining: string[]
  ): number {
    const t = trainees ? Object.keys(trainees).length : 0;
    const nt = needsTraining ? needsTraining.length : 0;
    return Math.ceil(((t - nt) / t) * 100) || 0;
  }

  /* Returns a list of userIds who need a refresh on their training */
  public getExpiredTrainees(
    myContent: MyContent,
    plusMoreDays: number = 0
  ): string[] {
    let expirationDate: Date = this.getTrainingExpirationDate(
      myContent.trainingExpiration
    );
    /* This will show how many will be expired in x number of days */
    if (plusMoreDays)
      expirationDate = new Date(
        expirationDate.setDate(expirationDate.getDate() + plusMoreDays)
      );
    const trainees = myContent.shouldReceiveTraining || {};
    let expiredTrainees = [];
    Object.keys(trainees).forEach(trainee => {
      if (trainees[trainee]) {
        const lastTrainedDate = new Date(trainees[trainee]);
        if (lastTrainedDate < expirationDate) expiredTrainees.push(trainee);
      } else expiredTrainees.push(trainee);
    });
    return expiredTrainees;
  }

  /* Returns the latest date training should have occured in order to be compliant */
  public getTrainingExpirationDate(
    trainingExpiration: TrainingExpiration
  ): Date {
    switch (trainingExpiration) {
      case "Anually":
        return new Date(new Date().setFullYear(new Date().getFullYear() - 1));
      case "Semi-Anually":
        return new Date(new Date().setMonth(new Date().getMonth() - 6));
      case "Quarterly":
        return new Date(new Date().setMonth(new Date().getMonth() - 3));
      case "Monthly":
        return new Date(new Date().setMonth(new Date().getMonth() - 1));
      default:
        return null;
    }
  }

  public setActiveRoute(route: string): void {
    setTimeout(() => (this.activeRoute = route), 1);
  }

  public getActiveRoute(): string {
    return this.activeRoute || "";
  }

  public getTrainingHistory(teamId): Observable<Survey[]> {
    const surveyQuery = query(collection(this.db, "survey"), where("teamId", "==", teamId), orderBy("createdAt", "desc"));
    return collectionData(surveyQuery, { idField: "id" }) as Observable<Survey[]>;
  }


  public getTopic(topicId, teamId): Observable<Topic | null> {
    const topicRef = topicId.includes(teamId)
      ? doc(this.db, `team/${teamId}/topic/${topicId}`)
      : doc(this.db, `topic/${topicId}`);
    return (docData(topicRef, { idField: "id" }) as Observable<Topic | null>)
      .pipe(
        take(1),
        map(topic => {
          if (!topic) return null;
          return { ...topic, id: topicId };
        }),
        catchError(error => {
          console.error(`Error loading topic ${topicId}. ${error}`);
          alert(`Error loading topic ${topicId}`);
          return of(null);
        })
      );
  }

  public addToLibrary(item: LibraryItem): Promise<any> {
    return addDoc(collection(this.db, "library"), { ...item });
  }

  public removeFromLibrary(item: LibraryItem): Promise<any> {
    return deleteDoc(doc(this.db, `library/${item.id}`));
  }
}

export class Industry {
  name: string;
  nameEs: string;
  id?: string;
  imageUrl?: string;
  checked?: boolean;
}

export class Topic {
  imageUrl: string;
  industryId: string;
  isGlobal: boolean;
  name: string;
  nameEs: string;
  teamId: string;
  subpart: string;
  subpartEs: string;
  id?: string;
}

export class Article {
  content: string;
  contentEs: string;
  isGlobal: boolean;
  isDefault: boolean;
  name: string;
  nameEs: string;
  topicId: string;
  teamId: string;
  /* word count / 6 */
  trainingLevel: number;
  id?: string;
  myContent?: MyContent;
  favorited?: boolean;
  slugName?: string;
  metaDescription?: string;
  imageUrl?: string;
}

export class OSHAArticle {
  content: string;
  contentEs: string;
  isGlobal: boolean;
  isDefault: boolean;
  name: string;
  nameEs: string;
  topicId: string;
  topic: string;
  industryId: string;
  industry: string;
  teamId: string;
  /* word count / 6 */
  id?: string;
  myContent?: MyContent;
  favorited?: boolean;
  slugName?: string;
  metaDescription?: string;
  thumbnail?: string;
}

export class MyContent {
  constructor(
    public articleId: string,
    public shouldReceiveTraining: object,
    public teamId: string,
    public articleName: string,
    public articleNameEs: string = null,
    public topicId: string,
    public trainingMinutes: number
  ) {}
  trainingExpiration: TrainingExpiration = TrainingExpiration.Anually;
  lastTrainingDate: Date;
  disabled: boolean = false;
  id?: string;
  needsTraining?: string[];
  complianceLevel?: number;
}

export class LibraryItem {
  id?: string;
  name: string;
  topic: string;
  teamId: string;
  industry: string;
  createdAt: Date = new Date();
  addedBy: string; // teamMemberId
  thumbnail?: string;
  content?: any;
  fileUrl?: string;
}

export enum TrainingExpiration {
  Anually = "Anually",
  SemiAnually = "Semi-Anually",
  Quarterly = "Quarterly",
  Montly = "Monthly"
}

//   rememberThis() {
//       const col = this.db.collection('testcol');
//       const ids = ['a', 'b'];
//       const queries = ids.map(el => col.doc(el).valueChanges());
//       const combo = combineLatest(...queries).subscribe();
//   }
