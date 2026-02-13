import { Injectable, inject, OnDestroy } from "@angular/core";
import { BehaviorSubject, combineLatest, Observable, of, Subscription } from "rxjs";
import { Firestore, collection, collectionData, doc, docData, query, where, orderBy, limit, addDoc, updateDoc } from "@angular/fire/firestore";
import { map, catchError, tap, take } from "rxjs/operators";
import { Auth } from "@angular/fire/auth";
import { Router, ActivatedRoute } from "@angular/router";
import { onAuthStateChanged, Unsubscribe } from "firebase/auth";
import { Team, TeamMember } from "../account/account.service";
import { Survey, SurveyResponse, User } from "../app.service";
import { LibraryItem } from "../account/training/training.service";
import { TeamFile as File } from "../account/files/files.component";
import { ResourceFile } from "../account/support/resource-library.service";

@Injectable({
  providedIn: "root"
})
export class UserService implements OnDestroy {
  private readonly db = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly authenticated = new BehaviorSubject<boolean>(false);
  readonly teamObservable = new BehaviorSubject<Team | null>(null);
  readonly teamMemberObservable = new BehaviorSubject<TeamMember | null>(null);
  readonly teamMembersObservable = new BehaviorSubject<TeamMember[] | null>(null);
  readonly teamManagersObservable = new BehaviorSubject<User[] | null>(null);
  readonly surveysObservable = new BehaviorSubject<Survey[] | null>(null);
  
  // Track whether surveys have been loaded from network (not just cache)
  readonly surveysLoaded = new BehaviorSubject<boolean>(false);

  aTeam: Team | null = null;
  teamMember: TeamMember;
  teamMembers: TeamMember[];
  teamManagers: User[];
  files: File[] = [];
  resourceFiles: ResourceFile[] = [];
  
  /**
   * Indicates when an admin/manager is viewing another team member's page.
   * When true, admin-only UI features should be hidden and the experience
   * should be as if the team member themselves is viewing the page.
   */
  isViewingAsMember: boolean = false;
  
  /**
   * Indicates when viewing as a manager (using user-id param instead of member-id).
   * Managers are in the 'user' collection, not 'team-members'.
   */
  isViewingAsManager: boolean = false;
  
  /**
   * The current manager being viewed (when isViewingAsManager is true).
   */
  currentManager: User | null = null;
  
  // Getter/setter for surveys that keeps the BehaviorSubject in sync
  private _surveys: Survey[] | null = null;
  get surveys(): Survey[] | null {
    return this._surveys;
  }
  set surveys(value: Survey[] | null) {
    this._surveys = value;
    this.surveysObservable.next(value);
  }
  isLoggedIn: boolean = false;
  loggedInUser: User;

  private topics: Topic[] = [];
  private activeRoute: string;
  
  // Subscription management
  private userSubscription: Subscription | null = null;
  private teamMembersSubscription: Subscription | null = null;
  private authUnsubscribe: Unsubscribe | null = null;

  public getUser(userId: string): Observable<TeamMember> {
    return docData(doc(this.db, `team-members/${userId}`), { idField: "id" }) as Observable<TeamMember>;
  }

  /**
   * Get a manager/owner from the 'user' collection by their ID.
   */
  public getManager(managerId: string): Observable<User> {
    return docData(doc(this.db, `user/${managerId}`), { idField: "id" }) as Observable<User>;
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
    // When viewing as team member, only show public files (same as when not logged in)
    const showAllFiles = this.isLoggedIn && !this.isViewingAsMember;
    const filesQuery = showAllFiles
      ? query(filesRef)
      : query(filesRef, where("isPublic", "==", true));
    return collectionData(filesQuery, { idField: "id" }) as Observable<File[]>;
  }

  public getResourceFiles(): Observable<ResourceFile[]> {
    const resourceQuery = query(
      collection(this.db, "resource-library"),
      orderBy("order", "asc")
    );
    return collectionData(resourceQuery, { idField: "id" }).pipe(
      map((files: any[]) =>
        files.map((file) => ({
          ...file,
          createdAt: file.createdAt?.toDate ? file.createdAt.toDate() : file.createdAt,
          updatedAt: file.updatedAt?.toDate ? file.updatedAt.toDate() : file.updatedAt
        }))
      )
    ) as Observable<ResourceFile[]>;
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

  /**
   * Get all survey responses submitted by a specific team member.
   */
  public getResponsesByTeamMember(teamMemberId: string): Observable<SurveyResponse[]> {
    const responsesQuery = query(
      collection(this.db, "survey-response"),
      where("teamMemberId", "==", teamMemberId)
    );
    return collectionData(responsesQuery, { idField: "id" }) as Observable<SurveyResponse[]>;
  }

  public createResponse(response: SurveyResponse): Promise<any> {
    // Filter out undefined values to avoid Firebase errors
    const cleanResponse = Object.fromEntries(
      Object.entries(response).filter(([_, value]) => value !== undefined)
    );
    return addDoc(collection(this.db, "survey-response"), cleanResponse);
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
      this.userSubscription = null;
    }
    if (this.teamMembersSubscription) {
      this.teamMembersSubscription.unsubscribe();
      this.teamMembersSubscription = null;
    }
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
      this.authUnsubscribe = null;
    }
  }

  /**
   * Check if the current user is authenticated (optional - for enhanced features).
   * This is non-blocking and won't prevent the page from loading for unauthenticated users.
   */
  public checkAuthState(): void {
    try {
      // Check current auth state without triggering OAuth operations
      const currentUser = this.auth.currentUser;
      if (currentUser && currentUser.uid) {
        this.setLoggedInUser(currentUser.uid);
      } else {
        // Clean up previous auth listener if any
        if (this.authUnsubscribe) {
          this.authUnsubscribe();
        }
        // Set up listener for future auth state changes (non-blocking)
        this.authUnsubscribe = onAuthStateChanged(this.auth, (u) => {
          if (u && u.uid) {
            this.setLoggedInUser(u.uid);
          }
        });
      }
    } catch (error) {
      // Auth check failed - continue without authenticated features
      console.info('Auth state check skipped - user is not authenticated');
    }
  }

  private setLoggedInUser(uid: string): void {
    // Clean up previous subscriptions before creating new ones
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
    if (this.teamMembersSubscription) {
      this.teamMembersSubscription.unsubscribe();
    }
    
    this.isLoggedIn = true;
    const userRef = doc(this.db, `user/${uid}`);
    this.userSubscription = docData(userRef, { idField: "id" }).subscribe((user) => {
      this.loggedInUser = user as User;
    });
    
    // Use take(1) to get current team value, then set up a single subscription for members
    this.teamObservable.pipe(take(1)).subscribe(t => {
      if (t) {
        this.subscribeToTeamMembers(t.id);
      }
    });
    
    // Also listen for team changes (but only once per change)
    this.teamMembersSubscription = this.teamObservable.subscribe(t => {
      if (t && (!this.teamMembers || this.teamMembers[0]?.teamId !== t.id)) {
        this.subscribeToTeamMembers(t.id);
      }
    });
  }

  private currentTeamMembersSub: Subscription | null = null;
  
  private subscribeToTeamMembers(teamId: string): void {
    // Clean up previous team members subscription
    if (this.currentTeamMembersSub) {
      this.currentTeamMembersSub.unsubscribe();
    }
    
    const membersCollection = collection(this.db, "team-members");
    const membersQuery = query(membersCollection, where("teamId", "==", teamId));
    this.currentTeamMembersSub = collectionData(membersQuery, { idField: "id" }).subscribe((tm: TeamMember[]) => {
      if (tm) {
        const activeMembers = tm.filter(m => !m.deleted);
        this.teamMembers = activeMembers;
        this.teamMembersObservable.next(activeMembers);
      }
    });
  }

  /** @deprecated Use checkAuthState() instead */
  public setIsLoggedIn(): void {
    this.checkAuthState();
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
    const cleanedMc = Object.fromEntries(
      Object.entries(mc).filter(([_, v]) => v !== undefined)
    );
    return updateDoc(doc(this.db, `team/${teamId}/my-training-content/${id}`), cleanedMc)
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
    const cleanedSurvey = Object.fromEntries(
      Object.entries(survey).filter(([_, v]) => v !== undefined)
    );
    return addDoc(collection(this.db, `team/${teamId}/survey`), cleanedSurvey)
      .then(data => data)
      .catch(error => {
        console.error("Error creating survey.", error);
        throw error;
      });
  }

  public getSurveys(teamId: string, userId: string): Observable<Survey[]> {
    // Note: We only filter by trainees array-contains to avoid needing a composite index.
    // The teamId filter is redundant since team members are already scoped to their team.
    const surveysQuery = query(
      collection(this.db, "survey"),
      where("trainees", "array-contains", userId)
    );
    return collectionData(surveysQuery, { idField: "id" }) as Observable<Survey[]>;
  }

  /**
   * Get ALL surveys for a team, regardless of who is in the trainees list.
   * Used by managers to see the full survey history.
   */
  public getAllTeamSurveys(teamId: string): Observable<Survey[]> {
    const surveysQuery = query(
      collection(this.db, "survey"),
      where("teamId", "==", teamId)
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
