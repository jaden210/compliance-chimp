import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, combineLatest, Observable, of } from "rxjs";
import { Firestore, collection, collectionData, doc, docData, query, where, orderBy, limit, addDoc, updateDoc } from "@angular/fire/firestore";
import { map, catchError, tap, mergeMap } from "rxjs/operators";
import { Auth } from "@angular/fire/auth";
import { Router, ActivatedRoute } from "@angular/router";
import { onAuthStateChanged } from "firebase/auth";
import { Team, TeamMember } from "../account/account.service";
import { Survey, SurveyResponse, User } from "../app.service";
import { LibraryItem } from "../account/training/training.service";
import { TeamFile as File } from "../account/files/files.component";

@Injectable({
  providedIn: "root"
})
export class UserService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly authenticated = new BehaviorSubject<boolean>(false);
  readonly teamObservable = new BehaviorSubject<Team | null>(null);
  readonly teamMemberObservable = new BehaviorSubject<TeamMember | null>(null);
  readonly teamMembersObservable = new BehaviorSubject<TeamMember[] | null>(null);
  readonly teamManagersObservable = new BehaviorSubject<User[] | null>(null);

  aTeam: Team = new Team();
  teamMember: TeamMember;
  teamMembers: TeamMember[];
  teamManagers: User[];
  surveys: Survey[];
  files: File[] = [];
  isLoggedIn: boolean = false;
  loggedInUser: User;

  private topics: Topic[] = [];
  private activeRoute: string;

  public getUser(userId: string): Observable<TeamMember> {
    return docData(doc(this.db, `team-members/${userId}`), { idField: "id" }) as Observable<TeamMember>;
  }

  public getSurvey(surveyId: string): Observable<Survey> {
    return docData(doc(this.db, `survey/${surveyId}`), { idField: "id" }) as Observable<Survey>;
  }

  public getLatestSurvey(libraryId: string): Observable<Survey[]> {
    const surveyRef = collection(this.db, "survey");
    const surveyQuery = query(surveyRef, where("libraryId", "==", libraryId), orderBy("createdAt", "desc"), limit(1));
    return collectionData(surveyQuery, { idField: "id" }) as Observable<Survey[]>;
  }

  public getFiles(teamId: string): Observable<File[]> {
    const filesRef = collection(this.db, `team/${teamId}/file`);
    const filesQuery = this.isLoggedIn
      ? query(filesRef)
      : query(filesRef, where("isPublic", "==", true));
    return collectionData(filesQuery, { idField: "id" }) as Observable<File[]>;
  }

  public getTeamManagers(teamId: string): Observable<User[]> {
    const usersQuery = query(collection(this.db, "user"), where("teamId", "==", teamId));
    return collectionData(usersQuery, { idField: "id" }) as Observable<User[]>;
  }

  public getTeam(id: string): Observable<Team> {
    return docData(doc(this.db, `team/${id}`), { idField: "id" }) as Observable<Team>;
  }

  public getLibraryItem(id: string): Observable<LibraryItem> {
    return docData(doc(this.db, `library/${id}`), { idField: "id" }) as Observable<LibraryItem>;
  }

  public getSurveyResponses(id: string): Observable<SurveyResponse[]> {
    const responsesQuery = query(collection(this.db, "survey-response"), where("surveyId", "==", id));
    return collectionData(responsesQuery, { idField: "id" }) as Observable<SurveyResponse[]>;
  }

  public createResponse(response: SurveyResponse): Promise<any> {
    // Filter out undefined values to avoid Firebase errors
    const cleanResponse = Object.fromEntries(
      Object.entries(response).filter(([_, value]) => value !== undefined)
    );
    return addDoc(collection(this.db, "survey-response"), cleanResponse);
  }

  public setIsLoggedIn(): void {
    onAuthStateChanged(this.auth, (u) => {
      if (u && u.uid) {
        this.isLoggedIn = true;
        const userRef = doc(this.db, `user/${u.uid}`);
        docData(userRef, { idField: "id" }).subscribe((user) => {
          this.loggedInUser = user as User;
        });
        this.teamObservable.subscribe(t => {
          if (t) {
            const membersCollection = collection(this.db, "team-members");
            const membersQuery = query(membersCollection, where("teamId", "==", t.id));
            collectionData(membersQuery, { idField: "id" }).subscribe((tm: TeamMember[]) => {
              if (tm) {
                this.teamMembers = tm;
                this.teamMembersObservable.next(tm);
              }
            });
          }
        });
      }
    });
  }

  private getTopics(teamId: string): Observable<Topic[]> {
    return this.topics.length
      ? of(this.topics)
      : combineLatest([
          collectionData(collection(this.db, "topic"), { idField: "id" }),
          collectionData(collection(this.db, `team/${teamId}/topic`), { idField: "id" })
        ]).pipe(
          map(topics => {
            const [generalTopics, customTopics] = topics;
            const combined = generalTopics.concat(customTopics);
            return combined.map(topic => ({ ...topic })) as Topic[];
          }),
          map(topics => {
            return topics.sort((a, b) =>
              a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
            );
          }),
          tap(topics => (this.topics = topics)),
          catchError(error => {
            console.error(`Error loading topics collection. ${error}`);
            return of([]);
          })
        );
  }

  public getMyContent(teamId: string): Observable<LibraryItem[]> {
    const contentQuery = query(collection(this.db, "library"), where("teamId", "==", teamId));
    return collectionData(contentQuery, { idField: "id" }) as Observable<LibraryItem[]>;
  }

  public getArticle(articleId: string, teamId: string): Observable<LibraryItem> {
    return docData(doc(this.db, `library/${articleId}`), { idField: "id" }) as Observable<LibraryItem>;
  }

  public getTopic(topicId: string, teamId: string): Observable<Topic | null> {
    const topicRef = topicId.includes(teamId)
      ? doc(this.db, `team/${teamId}/topic/${topicId}`)
      : doc(this.db, `topic/${topicId}`);
    return (docData(topicRef, { idField: "id" }) as Observable<Topic | null>)
      .pipe(
        map(topic => {
          if (!topic) return null;
          return { ...topic, id: topicId };
        }),
        catchError(error => {
          console.error(`Error loading topic ${topicId}. ${error}`);
          return of(null);
        })
      );
  }

  public setActiveRoute(route: string): void {
    setTimeout(() => (this.activeRoute = route), 1);
  }

  public getActiveRoute(): string {
    return this.activeRoute || "";
  }

  public updateMyContent(myContent: MyContent, teamId: string): Promise<any> {
    const mc = { ...myContent };
    const id = mc.id;
    delete mc.id;
    delete mc.needsTraining;
    return updateDoc(doc(this.db, `team/${teamId}/my-training-content/${id}`), { ...mc })
      .catch(error => {
        console.error(
          `An error occured updating my-content collection with myContent`,
          myContent,
          error
        );
        throw error;
      });
  }

  public createSurvey(survey: Survey, teamId: string): Promise<any> {
    return addDoc(collection(this.db, `team/${teamId}/survey`), { ...survey })
      .then(data => data)
      .catch(error => {
        console.error("Error creating survey.", error);
        throw error;
      });
  }

  public getSurveys(teamId: string, userId: string): Observable<Survey[]> {
    const surveysQuery = query(
      collection(this.db, "survey"),
      where("teamId", "==", teamId),
      where("trainees", "array-contains", userId)
    );
    return collectionData(surveysQuery, { idField: "id" }) as Observable<Survey[]>;
  }

  public cache(): void {
    sessionStorage.setItem("complianceAuth", 'true');
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
  id?: string;
  articleCount?: string;
}

export class Article {
  content: string;
  contentEs: string;
  isGlobal: boolean;
  name: string;
  nameEs: string;
  topicIds: string[] = [];
  teamId: string;
  trainingLevel: number;
  id?: string;
  myContent?: MyContent;
  favorited?: boolean;
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
  topic?: Topic;
  trainingMetric?: string;
  thumbnail?: string;
  name?: string;
  industry?: string;
  latestSurvey?: any;
}

export enum TrainingExpiration {
  Anually = "Anually",
  SemiAnually = "Semi-Anually",
  Quarterly = "Quarterly",
  Montly = "Monthly"
}
