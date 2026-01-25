import { Injectable } from "@angular/core";
import { of, Observable, combineLatest, merge, BehaviorSubject, Subject, from } from "rxjs";
import { Firestore, collection, collectionData, doc, docData, query, where, orderBy, addDoc, deleteDoc, updateDoc } from "@angular/fire/firestore";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Router } from "@angular/router";
import { map, catchError, tap, take, mergeMap, takeUntil } from "rxjs/operators";
import { AccountService } from "../account.service";
import { Survey } from "../survey/survey";
import { Industry, getIndustries } from "../../shared/industries";

// Training Auto-Build Progress Interface
export interface TrainingAutoBuildProgress {
  phase: 'analyzing' | 'building' | 'complete' | 'error';
  iteration: number;
  maxIterations: number;
  currentScore: number;
  targetScore: number;
  trainingsCreated: number;
  currentAction: string;
  log: { type: string; message: string; timestamp: Date }[];
  error?: string;
}

// Training Coverage Analysis Interface
export interface TrainingCoverageAnalysis {
  success: boolean;
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendations: TrainingRecommendation[];
  industry: string;
  existingCount: number;
  analyzedAt: string;
  error?: string;
}

export interface TrainingRecommendation {
  name: string;
  description: string;
  cadence: TrainingCadence;
  priority: 'high' | 'medium' | 'low';
  assignedTags: string[];
  oshaStandards: string[];
  reason: string;
}

// Re-export Industry for backwards compatibility
export type { Industry } from "../../shared/industries";

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
    private functions: Functions,
    public accountService: AccountService,
    public router: Router
  ) {}

  public getIndustries(): Observable<Industry[]> {
    if (!this.industries.length) {
      this.industries = getIndustries();
    }
    return of(this.industries);
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
    // Exclude id (Firestore auto-generates it) and filter out any undefined values
    const { id, ...itemWithoutId } = item;
    const cleanedItem = Object.fromEntries(
      Object.entries(itemWithoutId).filter(([_, value]) => value !== undefined)
    );
    return addDoc(collection(this.db, "library"), cleanedItem);
  }

  public removeFromLibrary(item: LibraryItem): Promise<any> {
    return deleteDoc(doc(this.db, `library/${item.id}`));
  }

  public updateLibraryItem(itemId: string, updates: Partial<LibraryItem>): Promise<void> {
    return updateDoc(doc(this.db, `library/${itemId}`), updates);
  }

  /**
   * Calculate the next due date based on last trained date, scheduled date, and cadence
   */
  public calculateNextDueDate(lastTrainedAt: Date | any, cadence: TrainingCadence, scheduledDueDate?: Date | any): Date | null {
    if (cadence === TrainingCadence.Once) {
      // For "Once" trainings, if never trained use scheduled date, otherwise no next due
      if (lastTrainedAt) return null;
      if (scheduledDueDate) {
        return scheduledDueDate?.toDate ? scheduledDueDate.toDate() : new Date(scheduledDueDate);
      }
      return new Date(); // Due immediately if no scheduled date
    }
    
    // If training has been completed, calculate from last trained date
    if (lastTrainedAt) {
      const lastTrained = lastTrainedAt?.toDate ? lastTrainedAt.toDate() : new Date(lastTrainedAt);
      return this.addCadenceInterval(lastTrained, cadence);
    }
    
    // If never trained but has scheduled date, use that
    if (scheduledDueDate) {
      return scheduledDueDate?.toDate ? scheduledDueDate.toDate() : new Date(scheduledDueDate);
    }
    
    // No training history and no scheduled date - due immediately
    return new Date();
  }

  /**
   * Add cadence interval to a date
   */
  private addCadenceInterval(date: Date, cadence: TrainingCadence): Date {
    const result = new Date(date);
    switch (cadence) {
      case TrainingCadence.Monthly:
        result.setMonth(result.getMonth() + 1);
        break;
      case TrainingCadence.Quarterly:
        result.setMonth(result.getMonth() + 3);
        break;
      case TrainingCadence.SemiAnnually:
        result.setMonth(result.getMonth() + 6);
        break;
      case TrainingCadence.Annually:
      default:
        result.setFullYear(result.getFullYear() + 1);
        break;
    }
    return result;
  }

  /**
   * Get the interval in days for a cadence
   */
  public getCadenceIntervalDays(cadence: TrainingCadence): number {
    switch (cadence) {
      case TrainingCadence.Once: return 0;
      case TrainingCadence.Monthly: return 30;
      case TrainingCadence.Quarterly: return 90;
      case TrainingCadence.SemiAnnually: return 180;
      case TrainingCadence.Annually: return 365;
      default: return 365;
    }
  }

  /**
   * Calculate the optimal scheduled due date for a new training item.
   * This distributes trainings evenly to avoid clustering on the same dates.
   */
  public calculateOptimalScheduledDate(
    cadence: TrainingCadence,
    existingItems: LibraryItem[]
  ): Date {
    const now = new Date();
    
    // Get all due dates from existing items
    const existingDueDates: Date[] = [];
    existingItems.forEach(item => {
      const dueDate = this.calculateNextDueDate(
        item.lastTrainedAt,
        item.trainingCadence || TrainingCadence.Annually,
        item.scheduledDueDate
      );
      if (dueDate) {
        existingDueDates.push(dueDate);
      }
    });

    // If no existing items, schedule 7 days out
    if (existingDueDates.length === 0) {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      return date;
    }

    // For one-time trainings, use a shorter window (4 weeks) to find a good slot
    // For recurring trainings, use the full cadence interval
    const intervalDays = cadence === TrainingCadence.Once 
      ? 28 // 4 weeks for one-time trainings
      : this.getCadenceIntervalDays(cadence);

    // Find the best slot within the interval
    // Divide the interval into weekly slots and find the one with least overlap
    const slotDays = 7; // Weekly slots
    const numSlots = Math.ceil(intervalDays / slotDays);
    const slotCounts: number[] = new Array(numSlots).fill(0);

    // Count trainings in each slot
    existingDueDates.forEach(dueDate => {
      const daysFromNow = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      // Only count if within our window
      if (daysFromNow >= 0 && daysFromNow < intervalDays) {
        const slotIndex = Math.floor(daysFromNow / slotDays);
        if (slotIndex < numSlots) {
          slotCounts[slotIndex]++;
        }
      }
    });

    // Find slot with minimum trainings (starting from slot 1 to give at least a week)
    let minSlot = 1;
    let minCount = slotCounts[1] ?? Infinity;
    for (let i = 1; i < numSlots; i++) {
      if (slotCounts[i] < minCount) {
        minCount = slotCounts[i];
        minSlot = i;
      }
    }

    // Calculate the date for the middle of the selected slot
    const daysFromNow = (minSlot * slotDays) + Math.floor(slotDays / 2);
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + daysFromNow);
    
    return scheduledDate;
  }

  /**
   * Calculate optimal scheduled dates for multiple items being added at once.
   * This ensures even distribution across the calendar.
   */
  public calculateBulkScheduledDates(
    items: { cadence: TrainingCadence }[],
    existingItems: LibraryItem[]
  ): Date[] {
    const scheduledDates: Date[] = [];
    
    // Group items by cadence
    const byCadence = new Map<TrainingCadence, number>();
    items.forEach(item => {
      const count = byCadence.get(item.cadence) || 0;
      byCadence.set(item.cadence, count + 1);
    });

    // For each cadence group, distribute evenly
    items.forEach((item, index) => {
      const cadence = item.cadence;
      const intervalDays = this.getCadenceIntervalDays(cadence);
      
      if (cadence === TrainingCadence.Once) {
        // Spread one-time trainings over the next 30 days
        const offset = 7 + (index * 3); // Start 7 days out, space 3 days apart
        const date = new Date();
        date.setDate(date.getDate() + offset);
        scheduledDates.push(date);
      } else {
        // Count how many items with this cadence we've already scheduled
        const sameCandeceItems = items.slice(0, index).filter(i => i.cadence === cadence);
        const totalWithCadence = byCadence.get(cadence) || 1;
        const slotIndex = sameCandeceItems.length;
        
        // Calculate spacing between items of the same cadence
        const spacingDays = Math.floor(intervalDays / totalWithCadence);
        const daysFromNow = 7 + (slotIndex * spacingDays);
        
        const date = new Date();
        date.setDate(date.getDate() + daysFromNow);
        scheduledDates.push(date);
      }
    });

    return scheduledDates;
  }

  /**
   * Calculate training status for a library item
   */
  public getTrainingStatus(item: LibraryItem): TrainingStatus {
    if (item.trainingCadence === TrainingCadence.Once) {
      // For "Once" trainings, check if any training has been completed
      if (item.lastTrainedAt) {
        return 'completed';
      }
      // Check if scheduled date is in the future
      if (item.scheduledDueDate) {
        const scheduled = item.scheduledDueDate?.toDate 
          ? item.scheduledDueDate.toDate() 
          : new Date(item.scheduledDueDate);
        const now = new Date();
        const diffDays = Math.ceil((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return 'overdue';
        if (diffDays <= 14) return 'dueSoon';
        return 'neverTrained';
      }
      return 'neverTrained';
    }

    const nextDue = this.calculateNextDueDate(item.lastTrainedAt, item.trainingCadence, item.scheduledDueDate);
    if (!nextDue) return 'current';

    const now = new Date();
    const diffTime = nextDue.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'overdue';
    } else if (diffDays <= 14) {
      return 'dueSoon';
    }
    
    // If never trained but scheduled in future, show as "never trained" not "current"
    if (!item.lastTrainedAt) {
      return 'neverTrained';
    }
    
    return 'current';
  }

  /**
   * Get compliance stats for a library item
   */
  public getComplianceStats(item: LibraryItem, teamMemberIds: string[]): ComplianceStats {
    const shouldReceive = item.shouldReceiveTraining || {};
    const assignedMembers = Object.keys(shouldReceive);
    
    if (assignedMembers.length === 0) {
      // If no specific assignments, use all team members
      const total = teamMemberIds.length;
      return {
        current: 0,
        total,
        percentage: 0,
        needsTraining: teamMemberIds
      };
    }

    const now = new Date();
    let currentCount = 0;
    const needsTraining: string[] = [];

    assignedMembers.forEach(userId => {
      const lastTrained = shouldReceive[userId];
      if (!lastTrained) {
        needsTraining.push(userId);
        return;
      }

      // Check if training is still current based on cadence
      const nextDue = this.calculateNextDueDate(lastTrained, item.trainingCadence);
      if (!nextDue || nextDue.getTime() > now.getTime()) {
        currentCount++;
      } else {
        needsTraining.push(userId);
      }
    });

    return {
      current: currentCount,
      total: assignedMembers.length,
      percentage: Math.round((currentCount / assignedMembers.length) * 100),
      needsTraining
    };
  }

  /**
   * Get all unique tags from team members
   */
  public getAllTags(teamMembers: { tags?: string[] }[]): string[] {
    const tagsSet = new Set<string>();
    teamMembers.forEach(tm => {
      (tm.tags || []).forEach(tag => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }

  /**
   * Expand assigned tags to member IDs
   * Used for dynamic tag-based training assignment
   */
  public expandTagsToMembers(assignedTags: string[], teamMembers: { id?: string; tags?: string[] }[]): string[] {
    if (!assignedTags || assignedTags.length === 0) {
      return [];
    }
    
    const memberIds = new Set<string>();
    for (const tag of assignedTags) {
      teamMembers
        .filter(tm => tm.tags?.includes(tag))
        .forEach(tm => {
          if (tm.id) {
            memberIds.add(tm.id);
          }
        });
    }
    return Array.from(memberIds);
  }

  /**
   * Get all members who should receive training for an item
   * Combines direct assignments (shouldReceiveTraining) with tag-based assignments
   */
  public getEffectiveTrainees(item: LibraryItem, teamMembers: { id?: string; tags?: string[] }[]): string[] {
    const directAssignees = Object.keys(item.shouldReceiveTraining || {});
    const tagAssignees = this.expandTagsToMembers(item.assignedTags || [], teamMembers);
    
    // Combine and dedupe
    const allAssignees = new Set([...directAssignees, ...tagAssignees]);
    return Array.from(allAssignees);
  }

  /**
   * Analyze training coverage using AI
   * Returns a coverage score and recommendations for new trainings
   */
  public analyzeTrainingCoverage(existingTrainings: LibraryItem[]): Observable<TrainingCoverageAnalysis> {
    const team = this.accountService.aTeam;
    const teamMembers = this.accountService.teamMembers || [];
    
    const jobTitles = [...new Set(teamMembers.map(m => m.jobTitle).filter(Boolean))];
    const allTags = this.getAllTags(teamMembers);
    
    const callable = httpsCallable<any, TrainingCoverageAnalysis>(this.functions, 'analyzeTrainingCoverage');
    
    return from(callable({
      businessName: team?.name,
      businessWebsite: team?.website || '',
      industry: team?.industry,
      teamId: team?.id,
      teamSize: teamMembers.length,
      jobTitles: jobTitles,
      teamMembers: teamMembers.map(m => ({
        name: m.name,
        jobTitle: m.jobTitle,
        tags: m.tags || []
      })),
      existingTrainings: existingTrainings.map(t => ({
        name: t.name,
        trainingCadence: t.trainingCadence,
        assignedTags: t.assignedTags || []
      })),
      allTags: allTags
    })).pipe(
      map(result => result.data),
      catchError(error => {
        console.error('Error analyzing training coverage:', error);
        return of({
          success: false,
          score: 0,
          summary: 'Unable to analyze training coverage at this time.',
          strengths: [],
          gaps: [],
          recommendations: [],
          industry: team?.industry || '',
          existingCount: existingTrainings.length,
          analyzedAt: new Date().toISOString(),
          error: error.message
        });
      })
    );
  }

  /**
   * Generate a training article using AI
   */
  public generateTrainingArticle(recommendation: TrainingRecommendation): Observable<{
    success: boolean;
    title: string;
    content: string;
    error?: string;
  }> {
    const team = this.accountService.aTeam;
    const callable = httpsCallable<any, any>(this.functions, 'generateTrainingArticleForAutoBuilder');
    
    return from(callable({
      topic: recommendation.name,
      description: recommendation.description,
      industry: team?.industry,
      oshaStandards: recommendation.oshaStandards,
      assignedTags: recommendation.assignedTags,
      cadence: recommendation.cadence
    })).pipe(
      map(result => result.data),
      catchError(error => {
        console.error('Error generating training article:', error);
        return of({
          success: false,
          title: recommendation.name,
          content: '',
          error: error.message
        });
      })
    );
  }

  /**
   * Auto-build training library
   * Iteratively analyzes coverage and creates trainings until target score is reached
   * 
   * Returns a BehaviorSubject for progress tracking and a cancel function
   */
  autoBuildTrainingLibrary(): { 
    progress$: BehaviorSubject<TrainingAutoBuildProgress>; 
    cancel: () => void;
  } {
    const MAX_ITERATIONS = 5;
    const TARGET_SCORE = 95;
    const MAX_TRAININGS_PER_ITERATION = 3;
    
    const cancelSubject = new Subject<void>();
    let cancelled = false;
    
    const progress$ = new BehaviorSubject<TrainingAutoBuildProgress>({
      phase: 'analyzing',
      iteration: 1,
      maxIterations: MAX_ITERATIONS,
      currentScore: 0,
      targetScore: TARGET_SCORE,
      trainingsCreated: 0,
      currentAction: 'Starting training coverage analysis...',
      log: [{
        type: 'info',
        message: 'Starting auto-build process',
        timestamp: new Date()
      }]
    });

    const cancel = () => {
      cancelled = true;
      cancelSubject.next();
      cancelSubject.complete();
      const current = progress$.value;
      progress$.next({
        ...current,
        phase: 'error',
        currentAction: 'Build cancelled by user',
        error: 'Build cancelled by user',
        log: [...current.log, {
          type: 'info',
          message: 'Build cancelled by user',
          timestamp: new Date()
        }]
      });
    };

    // Run the auto-build loop
    this.runAutoBuildLoop(progress$, cancelSubject, MAX_ITERATIONS, TARGET_SCORE, MAX_TRAININGS_PER_ITERATION);

    return { progress$, cancel };
  }

  private async runAutoBuildLoop(
    progress$: BehaviorSubject<TrainingAutoBuildProgress>,
    cancelSubject: Subject<void>,
    maxIterations: number,
    targetScore: number,
    maxTrainingsPerIteration: number
  ): Promise<void> {
    let iteration = 1;
    let totalCreated = 0;
    let currentTrainings: LibraryItem[] = [];
    const team = this.accountService.aTeam;

    while (iteration <= maxIterations) {
      // Check if cancelled
      if (cancelSubject.closed) return;

      // Update progress - analyzing phase
      const currentProgress = progress$.value;
      progress$.next({
        ...currentProgress,
        phase: 'analyzing',
        iteration,
        currentAction: `Analyzing training coverage (iteration ${iteration}/${maxIterations})...`,
        log: [...currentProgress.log, {
          type: 'info',
          message: `Starting iteration ${iteration}`,
          timestamp: new Date()
        }]
      });

      try {
        // Fetch current library items
        currentTrainings = await new Promise<LibraryItem[]>((resolve, reject) => {
          this.getLibrary(team.id).pipe(
            take(1),
            takeUntil(cancelSubject)
          ).subscribe({
            next: resolve,
            error: reject
          });
        });

        if (cancelSubject.closed) return;

        // Run coverage analysis
        const analysis = await new Promise<TrainingCoverageAnalysis>((resolve, reject) => {
          this.analyzeTrainingCoverage(currentTrainings).pipe(
            take(1),
            takeUntil(cancelSubject)
          ).subscribe({
            next: resolve,
            error: reject
          });
        });

        if (cancelSubject.closed) return;

        if (!analysis.success) {
          throw new Error(analysis.error || 'Coverage analysis failed');
        }

        // Log analysis result
        const afterAnalysis = progress$.value;
        progress$.next({
          ...afterAnalysis,
          currentScore: analysis.score,
          currentAction: `Coverage score: ${analysis.score}%`,
          log: [...afterAnalysis.log, {
            type: 'analysis',
            message: `Coverage analysis complete: ${analysis.score}% score`,
            timestamp: new Date()
          }]
        });

        // Check if target reached
        if (analysis.score >= targetScore) {
          const finalProgress = progress$.value;
          progress$.next({
            ...finalProgress,
            phase: 'complete',
            currentAction: `Target coverage reached: ${analysis.score}%`,
            log: [...finalProgress.log, {
              type: 'info',
              message: `Target coverage of ${targetScore}% reached! Final score: ${analysis.score}%`,
              timestamp: new Date()
            }]
          });
          return;
        }

        // Check if there are recommendations
        const recommendations = analysis.recommendations || [];
        if (recommendations.length === 0) {
          const finalProgress = progress$.value;
          progress$.next({
            ...finalProgress,
            phase: 'complete',
            currentAction: 'No more recommendations available',
            log: [...finalProgress.log, {
              type: 'info',
              message: 'No more training recommendations available. Build complete.',
              timestamp: new Date()
            }]
          });
          return;
        }

        // Update to building phase
        const beforeBuilding = progress$.value;
        progress$.next({
          ...beforeBuilding,
          phase: 'building',
          currentAction: `Creating trainings from ${Math.min(recommendations.length, maxTrainingsPerIteration)} recommendations...`,
          log: [...beforeBuilding.log, {
            type: 'info',
            message: `Found ${recommendations.length} recommendations. Creating top ${Math.min(recommendations.length, maxTrainingsPerIteration)}...`,
            timestamp: new Date()
          }]
        });

        // Sort by priority and take top recommendations
        const sortedRecs = [...recommendations].sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
        });
        const toCreate = sortedRecs.slice(0, maxTrainingsPerIteration);

        // Create each training
        for (const rec of toCreate) {
          if (cancelSubject.closed) return;

          const creatingProgress = progress$.value;
          progress$.next({
            ...creatingProgress,
            currentAction: `Creating: ${rec.name}...`,
            log: [...creatingProgress.log, {
              type: 'info',
              message: `Generating article: ${rec.name}`,
              timestamp: new Date()
            }]
          });

          try {
            // Generate the article content
            const articleResult = await new Promise<any>((resolve, reject) => {
              this.generateTrainingArticle(rec).pipe(
                take(1),
                takeUntil(cancelSubject)
              ).subscribe({
                next: resolve,
                error: reject
              });
            });

            if (cancelSubject.closed) return;

            if (!articleResult.success) {
              throw new Error(articleResult.error || 'Failed to generate article');
            }

            // Create the library item
            const libraryItem = new LibraryItem();
            libraryItem.name = articleResult.title || rec.name;
            libraryItem.content = articleResult.content;
            libraryItem.industry = team?.industry || 'General';
            libraryItem.topic = 'Written by the Chimp';
            libraryItem.teamId = team.id;
            libraryItem.addedBy = this.accountService.user?.id || '';
            libraryItem.trainingCadence = rec.cadence as TrainingCadence || TrainingCadence.Annually;
            libraryItem.assignedTags = rec.assignedTags || [];
            libraryItem.scheduledDueDate = this.calculateOptimalScheduledDate(
              libraryItem.trainingCadence,
              currentTrainings
            );

            // Save to library
            const itemId = await this.addToLibrary(libraryItem);
            libraryItem.id = itemId;
            currentTrainings.push(libraryItem);
            totalCreated++;

            const afterCreate = progress$.value;
            progress$.next({
              ...afterCreate,
              trainingsCreated: totalCreated,
              currentAction: `Created: ${libraryItem.name}`,
              log: [...afterCreate.log, {
                type: 'created',
                message: `Created training: ${libraryItem.name} (${rec.cadence}, ${rec.assignedTags?.length ? rec.assignedTags.join(', ') : 'all team'})`,
                timestamp: new Date()
              }]
            });

          } catch (createError: any) {
            const errorProgress = progress$.value;
            progress$.next({
              ...errorProgress,
              log: [...errorProgress.log, {
                type: 'error',
                message: `Failed to create ${rec.name}: ${createError.message}`,
                timestamp: new Date()
              }]
            });
          }
        }

        iteration++;

      } catch (error: any) {
        console.error('Auto-build loop error:', error);
        const errorProgress = progress$.value;
        progress$.next({
          ...errorProgress,
          phase: 'error',
          currentAction: `Error: ${error.message}`,
          error: error.message,
          log: [...errorProgress.log, {
            type: 'error',
            message: `Error during iteration ${iteration}: ${error.message}`,
            timestamp: new Date()
          }]
        });
        return;
      }
    }

    // Max iterations reached
    const finalProgress = progress$.value;
    progress$.next({
      ...finalProgress,
      phase: 'complete',
      currentAction: `Build complete after ${maxIterations} iterations`,
      log: [...finalProgress.log, {
        type: 'info',
        message: `Maximum iterations (${maxIterations}) reached. Created ${totalCreated} trainings.`,
        timestamp: new Date()
      }]
    });
  }
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
  assignedTags?: string[]; // Tags that should receive this training
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
  
  // Training cadence and compliance tracking
  trainingCadence: TrainingCadence = TrainingCadence.Annually;
  shouldReceiveTraining?: { [userId: string]: string | null }; // userId -> last trained ISO date or null
  lastTrainedAt?: Date | any; // Last time any training was completed for this item
  scheduledDueDate?: Date | any; // Smart-scheduled initial due date (used until first training is completed)
  
  // Tag-based assignment - members with these tags should receive this training
  assignedTags?: string[];
  
  // Auto-start override - undefined inherits from team, true/false overrides
  autoStart?: boolean;
}

export enum TrainingCadence {
  Once = "Once",
  Monthly = "Monthly",
  Quarterly = "Quarterly",
  SemiAnnually = "Semi-Annually",
  Annually = "Annually"
}

export type TrainingStatus = 'overdue' | 'dueSoon' | 'current' | 'neverTrained' | 'completed';

export interface ComplianceStats {
  current: number;
  total: number;
  percentage: number;
  needsTraining: string[];
}

export interface LibraryItemWithStatus extends LibraryItem {
  status?: TrainingStatus;
  nextDueDate?: Date | null;
  daysUntilDue?: number;
  complianceStats?: ComplianceStats;
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
