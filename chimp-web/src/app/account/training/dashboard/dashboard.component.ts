import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  WritableSignal,
  ChangeDetectorRef,
  Inject
} from "@angular/core";
import { getTagColor } from "../../../shared/tag-colors";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { TrainingService, LibraryItem, LibraryItemWithStatus, TrainingCadence, TrainingStatus, ComplianceStats, TrainingAutoBuildProgress, TrainingCoverageAnalysis, TrainingRecommendation, OSHAArticle } from "../training.service";
import { AccountService, Team, TeamMember, User } from "../../account.service";
import { Firestore, doc, updateDoc } from "@angular/fire/firestore";
import { BehaviorSubject, combineLatest, Observable, Subscription, of } from "rxjs";
import { filter, map, switchMap, shareReplay, take } from "rxjs/operators";
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { BlasterDialog } from "src/app/blaster/blaster.component";
import { WelcomeService } from "../../welcome.service";
import { WelcomeBannerComponent, WelcomeFeature } from "../../welcome-banner/welcome-banner.component";
import { ContactInfoBannerComponent } from "../../contact-info-banner/contact-info-banner.component";
import { SurveyService } from "../../survey/survey.service";

export type ViewMode = 'schedule' | 'history';
export type FilterType = 'all' | 'overdue' | 'dueSoon' | 'current' | 'neverTrained';
export type SortColumn = 'status' | 'name' | 'lastTrained' | 'nextDue' | 'cadence' | 'compliance' | null;
export type SortDirection = 'asc' | 'desc';
export type LibrarySortColumn = 'name' | 'industry' | 'topic' | null;

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface LibrarySortState {
  column: LibrarySortColumn;
  direction: SortDirection;
}

export interface TrainingHistoryItem {
  id?: string;
  articleId?: string;
  libraryId?: string;
  receivedTraining: string[];
  trainees?: string[];
  userId: string;
  active: boolean;
  createdAt: any;
  category: string;
  categoryEs: string;
  title: string;
  titleEs: string;
  runDate: any;
  userSurvey: any;
  creator?: string;
  creatorUser?: User;
}

@Component({
  standalone: true,
  selector: "app-dashboard",
  templateUrl: "./dashboard.component.html",
  styleUrls: ["./dashboard.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    WelcomeBannerComponent,
    ContactInfoBannerComponent
  ],
  providers: [DatePipe]
})
export class DashboardComponent implements OnInit, OnDestroy {
  team: Team;
  teamMembers: TeamMember[];
  teamManagers: User[];
  
  loading = true;
  trainingsSubscription: Subscription;
  autoBuildSubscription: Subscription | null = null;
  
  // View mode
  viewMode$ = new BehaviorSubject<ViewMode>('schedule');
  
  // Schedule view state
  library$: Observable<LibraryItemWithStatus[]>;
  filteredLibrary$: Observable<LibraryItemWithStatus[]>;
  activeFilter$ = new BehaviorSubject<FilterType>('all');
  sort$ = new BehaviorSubject<SortState>({ column: null, direction: 'asc' });
  scheduleSearchTerm$ = new BehaviorSubject<string>('');
  
  // History view state
  trainingHistory: TrainingHistoryItem[] = [];
  filteredHistory$: Observable<TrainingHistoryItem[]>;
  searchTerm$ = new BehaviorSubject<string>('');
  responseCountsMap: Record<string, number> = {};
  
  // Library view state
  libraryContent$: Observable<LibraryItem[]>;
  libraryFilteredContent$: Observable<LibraryItem[]>;
  librarySearchTerm$ = new BehaviorSubject<string>('');
  librarySort$ = new BehaviorSubject<LibrarySortState>({ column: null, direction: 'asc' });
  selectedArticle: LibraryItem | null = null;
  customArticle = false;
  selectedItems = new Set<string>();
  selectionMode = false;
  processingBulkAction = false;
  private libraryItemsCache: LibraryItem[] = [];
  private pendingOpenFirst = false;
  
  // Training cadence options
  cadenceOptions = [
    { value: TrainingCadence.Once, label: 'Once (one-time training)' },
    { value: TrainingCadence.Monthly, label: 'Monthly' },
    { value: TrainingCadence.Quarterly, label: 'Quarterly' },
    { value: TrainingCadence.SemiAnnually, label: 'Semi-Annually' },
    { value: TrainingCadence.Annually, label: 'Annually' }
  ];
  

  // Auto-build state
  autoBuildActive: WritableSignal<boolean> = signal(false);
  autoBuildProgress: WritableSignal<TrainingAutoBuildProgress | null> = signal(null);
  private autoBuildCancel: (() => void) | null = null;

  // Coverage analysis state
  coverageAnalysis: WritableSignal<TrainingCoverageAnalysis | null> = signal(null);
  coverageLoading: WritableSignal<boolean> = signal(false);
  coverageError: WritableSignal<string | null> = signal(null);
  coverageCollapsed: WritableSignal<boolean> = signal(this.loadCoverageCollapsedState());

  // Welcome banner features
  trainingWelcomeFeatures: WelcomeFeature[] = [
    {
      icon: 'calendar_today',
      title: 'Schedule Tab',
      description: 'See what\'s due, overdue, or coming up. Filter and search trainings that need attention right now.',
      action: 'schedule'
    },
    {
      icon: 'history',
      title: 'History Tab',
      description: 'Review past training sessions - who ran them, when, and which team members attended.',
      action: 'history'
    },
    {
      icon: 'construction',
      title: 'Smart Builder',
      description: 'Create custom training articles tailored to your team or browse OSHA content to add to your library.',
      action: 'smartBuilder'
    },
    {
      icon: 'schedule_send',
      title: 'Auto-Send',
      description: 'Enable automatic SMS/email notifications when training is due. Never miss a deadline again.',
      action: 'autoSend'
    },
    {
      icon: 'local_offer',
      title: 'Tag-Based Assignment',
      description: 'Assign training to tags (like "Warehouse") and everyone with that tag automatically receives it.',
      action: 'tagAssignment'
    },
    {
      icon: 'analytics',
      title: 'Coverage Analysis',
      description: 'Identify gaps in your training program and get recommendations for comprehensive coverage.',
      action: 'coverageAnalysis'
    }
  ];

  constructor(
    private trainingService: TrainingService,
    public accountService: AccountService,
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private datePipe: DatePipe,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private db: Firestore,
    public welcomeService: WelcomeService,
    private surveyService: SurveyService
  ) {}

  // Auto-start trainings - undefined/missing means disabled (grandfather existing teams)
  get autoStartTrainings(): boolean {
    return this.accountService.aTeam?.autoStartTrainings === true;
  }

  set autoStartTrainings(value: boolean) {
    if (this.team?.id) {
      this.accountService.aTeam.autoStartTrainings = value;
      updateDoc(doc(this.db, `team/${this.team.id}`), { autoStartTrainings: value });
    }
  }

  // Update per-training auto-start setting
  updateItemAutoStart(item: LibraryItem, autoStart: boolean | undefined): void {
    if (item.id) {
      this.trainingService.updateLibraryItem(item.id, { autoStart });
    }
  }

  // Get effective auto-start status for a training item
  getItemAutoStartStatus(item: LibraryItem): { enabled: boolean; inherited: boolean } {
    if (item.autoStart === undefined) {
      return { enabled: this.autoStartTrainings, inherited: true };
    }
    return { enabled: item.autoStart, inherited: false };
  }

  ngOnInit() {
    this.accountService.helper = this.accountService.helperProfiles.training;
    
    // Check for view query parameter
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      if (params['view'] === 'history') {
        this.viewMode$.next('history');
      }
    });
    
    // Check for tour-related query parameters
    // Subscribe without take(1) so it reacts even if component is already loaded
    this.route.queryParams.subscribe(params => {
      if (params['openFirst'] === 'true') {
        // If library is already loaded, navigate immediately
        if (this.libraryItemsCache && this.libraryItemsCache.length > 0) {
          this.router.navigate(['/account/training/library', this.libraryItemsCache[0].id], { replaceUrl: true });
        } else {
          // Set flag for when library loads
          this.pendingOpenFirst = true;
        }
      }
      if (params['showAutoSend'] === 'true') {
        // Open the auto-send dialog and clear the query param
        setTimeout(() => this.openAutoStartDialog(), 100);
        this.router.navigate([], { 
          relativeTo: this.route, 
          queryParams: { showAutoSend: null }, 
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      }
    });
    
    // Subscribe to team changes to pick up cached coverage analysis
    // This ensures we react when the Cloud Function stores new analysis
    this.accountService.aTeamObservable.pipe(
      filter(team => !!team)
    ).subscribe(team => {
      // If team has a valid, non-stale coverage analysis, use it
      if (team.trainingCoverageAnalysis && !team.trainingCoverageAnalysisStale && team.trainingCoverageAnalysis.success) {
        this.coverageAnalysis.set(team.trainingCoverageAnalysis);
        this.coverageLoading.set(false);
      }
    });
    
    combineLatest([
      this.accountService.aTeamObservable,
      this.accountService.teamMembersObservable,
      this.accountService.teamManagersObservable,
    ]).subscribe(
      data => {
        if (data[0] && data[1]) {
          this.team = data[0];
          this.teamMembers = data[1] || [];
          this.teamManagers = data[2] || [];
          this.setupLibraryObservable();
          this.setupLibraryContentObservable();
          this.getTrainingHistory();
          this.cdr.detectChanges();
        }
      }
    );
  }

  private setupLibraryContentObservable(): void {
    // Raw library items for the Library tab (not enriched with status)
    this.libraryContent$ = this.trainingService.getLibrary(this.team.id).pipe(
      map(library => library.sort((a: LibraryItem, b: LibraryItem) => 
        (a.topic || 'na').localeCompare(b.topic) || a.name.localeCompare(b.name)
      )),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // Cache library items and handle openFirst if pending
    this.libraryContent$.subscribe(items => {
      this.libraryItemsCache = items;
      if (this.pendingOpenFirst && items && items.length > 0) {
        this.pendingOpenFirst = false;
        this.router.navigate(['/account/training/library', items[0].id], { replaceUrl: true });
      }
    });

    // Filtered content based on search and sort
    this.libraryFilteredContent$ = combineLatest([
      this.libraryContent$,
      this.librarySearchTerm$,
      this.librarySort$
    ]).pipe(
      map(([library, search, sort]) => {
        let content = [...library];

        // Apply search filter
        if (search.trim()) {
          content = this.applyLibrarySearch(content, search);
        }

        // Apply sort
        if (sort.column) {
          content = this.applyLibrarySort(content, sort);
        }

        return content;
      })
    );
  }

  private setupLibraryObservable(): void {
    const teamMemberIds = this.teamMembers.map(m => m.id);
    const teamMembersWithTags = this.teamMembers.map(m => ({ id: m.id, tags: m.tags || [] }));
    
    this.library$ = this.trainingService.getLibrary(this.team.id).pipe(
      map(library => library.map(item => this.enrichLibraryItem(item, teamMemberIds, teamMembersWithTags))),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.filteredLibrary$ = combineLatest([
      this.library$,
      this.activeFilter$,
      this.sort$,
      this.scheduleSearchTerm$
    ]).pipe(
      map(([library, filterType, sort, searchTerm]) => this.applyFilterSortAndSearch(library, filterType, sort, searchTerm))
    );
    
    // Update loading state and trigger coverage analysis
    this.library$.subscribe(library => {
      this.loading = false;
      // Trigger coverage analysis if there are trainings
      if (library.length > 0 && this.canAnalyzeCoverage()) {
        this.checkAndTriggerAnalysis();
      }
    });
  }

  private enrichLibraryItem(item: LibraryItem, teamMemberIds: string[], teamMembers: { id?: string; tags?: string[] }[]): LibraryItemWithStatus {
    const result: LibraryItemWithStatus = { ...item };
    
    // Ensure cadence has a default
    result.trainingCadence = item.trainingCadence || TrainingCadence.Annually;
    
    // Calculate status
    result.status = this.trainingService.getTrainingStatus(result);
    
    // Calculate next due date
    result.nextDueDate = this.trainingService.calculateNextDueDate(
      result.lastTrainedAt, 
      result.trainingCadence,
      result.scheduledDueDate
    );
    
    // Calculate days until due
    if (result.nextDueDate) {
      const now = new Date();
      const diffTime = result.nextDueDate.getTime() - now.getTime();
      result.daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    // Calculate compliance stats - pass team members with tags for accurate tag-based filtering
    result.complianceStats = this.trainingService.getComplianceStats(result, teamMemberIds, teamMembers);
    
    return result;
  }

  private applyFilterSortAndSearch(library: LibraryItemWithStatus[], filterType: FilterType, sort: SortState, searchTerm: string): LibraryItemWithStatus[] {
    let filtered = [...library];

    // Apply search filter first
    if (searchTerm.trim()) {
      filtered = this.applyScheduleSearch(filtered, searchTerm);
    }

    // Apply status filter
    switch (filterType) {
      case 'overdue':
        filtered = filtered.filter(i => i.status === 'overdue');
        break;
      case 'dueSoon':
        filtered = filtered.filter(i => i.status === 'dueSoon' || i.status === 'overdue');
        break;
      case 'current':
        filtered = filtered.filter(i => i.status === 'current' || i.status === 'completed');
        break;
      case 'neverTrained':
        filtered = filtered.filter(i => i.status === 'neverTrained');
        break;
    }

    // Apply sort
    if (sort.column) {
      filtered = this.sortLibrary(filtered, sort);
    } else {
      // Default sort based on filter
      switch (filterType) {
        case 'overdue':
        case 'dueSoon':
          filtered.sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));
          break;
        default:
          // Sort by status priority, then name
          const statusOrder = { overdue: 0, dueSoon: 1, neverTrained: 2, current: 3, completed: 4 };
          filtered.sort((a, b) => {
            const statusDiff = (statusOrder[a.status || 'current'] || 3) - (statusOrder[b.status || 'current'] || 3);
            if (statusDiff !== 0) return statusDiff;
            return a.name.localeCompare(b.name);
          });
      }
    }

    return filtered;
  }

  private applyScheduleSearch(items: LibraryItemWithStatus[], search: string): LibraryItemWithStatus[] {
    const terms = search.toLowerCase().trim().split(' ');
    return items.filter(item => {
      const name = item.name.toLowerCase();
      const topic = (item.topic || '').toLowerCase();
      const industry = (item.industry || '').toLowerCase();
      const tags = (item.assignedTags || []).join(' ').toLowerCase();
      
      return terms.every(term => 
        name.includes(term) || 
        topic.includes(term) || 
        industry.includes(term) ||
        tags.includes(term)
      );
    });
  }

  onScheduleSearch(term: string): void {
    this.scheduleSearchTerm$.next(term);
  }

  private sortLibrary(library: LibraryItemWithStatus[], sort: SortState): LibraryItemWithStatus[] {
    const dir = sort.direction === 'asc' ? 1 : -1;

    return library.sort((a, b) => {
      switch (sort.column) {
        case 'status':
          const statusOrder = { overdue: 0, dueSoon: 1, neverTrained: 2, current: 3, completed: 4 };
          return ((statusOrder[a.status || 'current'] || 3) - (statusOrder[b.status || 'current'] || 3)) * dir;
        
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        
        case 'lastTrained':
          const aLast = a.lastTrainedAt?.toDate ? a.lastTrainedAt.toDate() : a.lastTrainedAt;
          const bLast = b.lastTrainedAt?.toDate ? b.lastTrainedAt.toDate() : b.lastTrainedAt;
          if (!aLast) return 1 * dir;
          if (!bLast) return -1 * dir;
          return (new Date(aLast).getTime() - new Date(bLast).getTime()) * dir;
        
        case 'nextDue':
          if (!a.nextDueDate) return 1 * dir;
          if (!b.nextDueDate) return -1 * dir;
          return (a.nextDueDate.getTime() - b.nextDueDate.getTime()) * dir;
        
        case 'cadence':
          const cadenceOrder = { 'Once': 0, 'Monthly': 1, 'Quarterly': 2, 'Semi-Annually': 3, 'Annually': 4 };
          const aCad = cadenceOrder[a.trainingCadence || 'Annually'] ?? 4;
          const bCad = cadenceOrder[b.trainingCadence || 'Annually'] ?? 4;
          return (aCad - bCad) * dir;
        
        case 'compliance':
          return ((a.complianceStats?.percentage || 0) - (b.complianceStats?.percentage || 0)) * dir;
        
        default:
          return 0;
      }
    });
  }

  private getTrainingHistory(): void {
    this.trainingsSubscription = this.trainingService.getTrainingHistory(this.team.id).subscribe(history => {
      this.trainingHistory = history.map(h => {
        const creatorUser = this.teamManagers.find(u => u.id == h.userId);
        const creator = creatorUser ? creatorUser.name : 'Unknown';
        return { ...h, creator, creatorUser } as TrainingHistoryItem;
      });
      this.setupFilteredHistory();
      this.loadResponseCounts(this.trainingHistory);
    });
  }

  private loadResponseCounts(history: TrainingHistoryItem[]): void {
    history.forEach(item => {
      if (item.id) {
        this.surveyService.getSurveyResponses(item.id).pipe(
          take(1)
        ).subscribe(responses => {
          this.responseCountsMap[item.id] = responses.length;
          this.cdr.markForCheck();
        });
      }
    });
  }

  private setupFilteredHistory(): void {
    this.filteredHistory$ = this.searchTerm$.pipe(
      map(searchTerm => this.applyHistorySearch(this.trainingHistory, searchTerm))
    );
  }

  private applyHistorySearch(history: TrainingHistoryItem[], searchTerm: string): TrainingHistoryItem[] {
    if (!searchTerm.trim()) return history;
    
    const term = searchTerm.toLowerCase();
    return history.filter(h => 
      h.title?.toLowerCase().includes(term) ||
      h.creator?.toLowerCase().includes(term) ||
      h.category?.toLowerCase().includes(term)
    );
  }

  // View mode methods
  setViewMode(mode: ViewMode): void {
    this.viewMode$.next(mode);
    
    // Update URL without creating browser history entry
    const queryParams = mode === 'schedule' ? {} : { view: mode };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true
    });
  }

  // Filter methods
  setFilter(filterType: FilterType): void {
    this.activeFilter$.next(filterType);
    this.sort$.next({ column: null, direction: 'asc' });
  }

  toggleSort(column: SortColumn): void {
    const current = this.sort$.value;
    if (current.column === column) {
      if (current.direction === 'asc') {
        this.sort$.next({ column, direction: 'desc' });
      } else {
        this.sort$.next({ column: null, direction: 'asc' });
      }
    } else {
      this.sort$.next({ column, direction: 'asc' });
    }
  }

  // Actions
  startTraining(item: LibraryItemWithStatus, event?: Event): void {
    if (event) event.stopPropagation();
    
    this.dialog.open(BlasterDialog, {
      data: {
        libraryItem: item
      }
    });
  }

  startTrainingFromLibrary(item: LibraryItem): void {
    this.dialog.open(BlasterDialog, {
      data: {
        libraryItem: item
      }
    });
  }

  // Navigate to full article view
  viewFullArticle(item: LibraryItem): void {
    this.router.navigate(['/account/training/library', item.id]);
  }

  // Navigate to the article from history
  viewHistoryArticle(history: TrainingHistoryItem): void {
    const articleId = history?.articleId || history?.libraryId;
    if (articleId) {
      this.router.navigate(['/account/training/library', articleId]);
    }
  }

  // Navigate to history/survey details
  viewHistoryDetails(history: TrainingHistoryItem): void {
    if (history?.id) {
      this.routeToSurvey(history.id);
    }
  }

  goToSmartBuilder(): void {
    this.router.navigate(['/account/training/smart-builder']);
  }

  // Handle welcome banner feature clicks
  onWelcomeFeatureClick(action: string): void {
    switch (action) {
      case 'schedule':
        this.setViewMode('schedule');
        break;
      case 'history':
        this.setViewMode('history');
        break;
      case 'smartBuilder':
        this.goToSmartBuilder();
        break;
      case 'autoSend':
        this.openAutoStartDialog();
        break;
      case 'tagAssignment':
        this.router.navigate(['/account/team']);
        break;
      case 'coverageAnalysis':
        // Expand coverage analysis if it's collapsed
        if (this.coverageCollapsed()) {
          this.toggleCoverageExpanded();
        }
        break;
    }
  }

  // Auto-build methods
  hasTeamMembers(): boolean {
    return this.teamMembers && this.teamMembers.length > 0;
  }

  canAnalyzeCoverage(): boolean {
    return this.hasTeamMembers() && !!this.accountService.aTeam?.industry;
  }

  startAutoBuild(): void {
    if (!this.canAnalyzeCoverage()) return;
    
    this.autoBuildActive.set(true);
    
    const { progress$, cancel } = this.trainingService.autoBuildTrainingLibrary();
    this.autoBuildCancel = cancel;
    
    this.autoBuildSubscription = progress$.subscribe(progress => {
      this.autoBuildProgress.set(progress);
      
      if (progress.phase === 'complete' || progress.phase === 'error') {
        this.autoBuildActive.set(false);
        this.autoBuildCancel = null;
        
        // Refresh the library observable
        if (this.team) {
          this.setupLibraryObservable();
        }
      }
    });
  }

  cancelAutoBuild(): void {
    if (this.autoBuildCancel) {
      this.autoBuildCancel();
      this.autoBuildCancel = null;
    }
    this.autoBuildActive.set(false);
  }

  viewTrainings(): void {
    this.autoBuildProgress.set(null);
    this.setViewMode('schedule');
  }

  // Coverage analysis methods
  checkAndTriggerAnalysis(): void {
    if (!this.canAnalyzeCoverage()) return;
    
    // Check if we have cached analysis that's not stale
    const team = this.accountService.aTeam;
    if (team?.trainingCoverageAnalysis && !team?.trainingCoverageAnalysisStale) {
      this.coverageAnalysis.set(team.trainingCoverageAnalysis);
      return;
    }
    
    this.runCoverageAnalysis();
  }

  runCoverageAnalysis(): void {
    if (this.coverageLoading()) return;
    
    this.coverageLoading.set(true);
    this.coverageError.set(null);
    
    // Get current library items
    this.library$.pipe(take(1)).subscribe(library => {
      this.trainingService.analyzeTrainingCoverage(library).subscribe({
        next: (analysis) => {
          this.coverageLoading.set(false);
          if (analysis.success) {
            this.coverageAnalysis.set(analysis);
          } else {
            this.coverageError.set(analysis.error || 'Analysis failed');
          }
        },
        error: (err) => {
          this.coverageLoading.set(false);
          this.coverageError.set(err.message || 'An error occurred');
        }
      });
    });
  }

  refreshCoverageAnalysis(): void {
    this.runCoverageAnalysis();
  }

  toggleCoverageExpanded(): void {
    const newState = !this.coverageCollapsed();
    this.coverageCollapsed.set(newState);
    this.saveCoverageCollapsedState(newState);
  }

  private loadCoverageCollapsedState(): boolean {
    try {
      const stored = localStorage.getItem('cc-training-coverage-collapsed');
      return stored === null ? false : stored === 'true';
    } catch {
      return false;
    }
  }

  private saveCoverageCollapsedState(collapsed: boolean): void {
    try {
      localStorage.setItem('cc-training-coverage-collapsed', String(collapsed));
    } catch {}
  }

  getScoreClass(score: number): string {
    if (score >= 90) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 50) return 'score-fair';
    return 'score-needs-work';
  }

  useRecommendation(rec: TrainingRecommendation): void {
    // Store the recommendation and navigate to smart builder
    sessionStorage.setItem('pendingTrainingRecommendation', JSON.stringify(rec));
    this.router.navigate(['/account/training/smart-builder']);
  }

  routeToSurvey(id: string): void {
    this.router.navigate([`/account/survey/${id}`]);
  }

  onSearch(term: string): void {
    this.searchTerm$.next(term);
  }

  // Formatting helpers
  formatDate(date: any): string {
    if (!date) return '—';
    const d = date.toDate ? date.toDate() : new Date(date);
    return this.datePipe.transform(d, 'mediumDate') || '—';
  }

  formatTime(date: any): string {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return this.datePipe.transform(d, 'shortTime') || '';
  }

  getStatusLabel(status: TrainingStatus): string {
    switch (status) {
      case 'overdue': return 'Overdue';
      case 'dueSoon': return 'Due Soon';
      case 'neverTrained': return 'Never Trained';
      case 'completed': return 'Completed';
      default: return 'Current';
    }
  }

  getCadenceLabel(cadence: TrainingCadence): string {
    return cadence || 'Annually';
  }

  getAttendeeCount(history: TrainingHistoryItem): number {
    // Check trainees array first (used in newer surveys)
    if (history.trainees?.length) {
      return history.trainees.length;
    }
    // Fall back to receivedTraining (legacy format)
    if (history.receivedTraining?.length) {
      return history.receivedTraining.length;
    }
    // Fall back to userSurvey object keys
    if (history.userSurvey) {
      return Object.keys(history.userSurvey).length;
    }
    return 0;
  }

  getResponseCount(history: TrainingHistoryItem): number {
    return this.responseCountsMap[history.id] ?? 0;
  }

  trackByItemId(index: number, item: LibraryItemWithStatus): string {
    return item.id || item.name || index.toString();
  }

  trackByHistoryId(index: number, item: TrainingHistoryItem): string {
    return item.id || index.toString();
  }

  // ============ Library View Methods ============

  private applyLibrarySearch(content: LibraryItem[], search: string): LibraryItem[] {
    const terms = search.toLowerCase().trim().split(' ');
    return content.filter(item => {
      const name = item.name.toLowerCase();
      const industry = (item.industry || '').toLowerCase();
      const topic = (item.topic || '').toLowerCase();
      const itemContent = (item.content || '').toLowerCase();
      const tags = (item.assignedTags || []).join(' ').toLowerCase();
      
      let score = 0;
      terms.forEach(term => {
        if (name.includes(term)) score += 4;
        if (industry.includes(term)) score += 2;
        if (topic.includes(term)) score += 2;
        if (tags.includes(term)) score += 3;
        if (itemContent.includes(term)) score += 1;
      });
      return score >= terms.length;
    });
  }

  private applyLibrarySort(content: LibraryItem[], sort: LibrarySortState): LibraryItem[] {
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...content].sort((a, b) => {
      switch (sort.column) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'industry':
          return (a.industry || '').localeCompare(b.industry || '') * dir;
        case 'topic':
          return (a.topic || '').localeCompare(b.topic || '') * dir;
        default:
          return 0;
      }
    });
  }

  onLibrarySearch(value: string): void {
    this.librarySearchTerm$.next(value);
  }

  toggleLibrarySort(column: LibrarySortColumn): void {
    const current = this.librarySort$.value;
    if (current.column === column) {
      if (current.direction === 'asc') {
        this.librarySort$.next({ column, direction: 'desc' });
      } else {
        this.librarySort$.next({ column: null, direction: 'asc' });
      }
    } else {
      this.librarySort$.next({ column, direction: 'asc' });
    }
  }

  selectArticle(article: LibraryItem): void {
    if (article.id) {
      this.router.navigate(['/account/training/library', article.id]);
    }
  }

  closeArticle(): void {
    this.selectedArticle = null;
  }

  isInLibrary(articleName: string): boolean {
    return this.libraryItemsCache.some(l => l.name === articleName);
  }

  removeFromLibrary(article: LibraryItem): void {
    this.trainingService.removeFromLibrary(article).then(() => {
      this.libraryItemsCache = this.libraryItemsCache.filter(l => l.id !== article.id);
      this.selectedArticle = null;
      this.snackBar.open('Article removed from library', 'Close', { duration: 3000 });
    });
  }

  createCustomArticle(article: LibraryItem | null = null): void {
    if (article) {
      this.selectedArticle = article;
      this.customArticle = true;
    } else {
      this.router.navigate(['/account/training/smart-builder'], { queryParams: { mode: 'scratch' } });
    }
  }

  closeCustomArticle(): void {
    this.customArticle = false;
    this.selectedArticle = null;
  }

  // Use shared tag color utility
  getTagColor = getTagColor;

  trackByArticleId(index: number, article: LibraryItem): string {
    return article.id || article.name || index.toString();
  }

  // ============ Library Multi-Select Methods ============

  getArticleKey(article: LibraryItem): string {
    return article.id || article.name;
  }

  toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.clearSelection();
    }
  }

  clearSelection(): void {
    this.selectedItems.clear();
    this.selectionMode = false;
  }

  toggleItemSelection(article: LibraryItem, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    
    const key = this.getArticleKey(article);
    if (this.selectedItems.has(key)) {
      this.selectedItems.delete(key);
    } else {
      this.selectedItems.add(key);
    }
    
    if (this.selectedItems.size > 0) {
      this.selectionMode = true;
    }
  }

  isItemSelected(article: LibraryItem): boolean {
    return this.selectedItems.has(this.getArticleKey(article));
  }

  isAllSelected(content: LibraryItem[]): boolean {
    if (content.length === 0) return false;
    return content.every(article => this.selectedItems.has(this.getArticleKey(article)));
  }

  isSomeSelected(content: LibraryItem[]): boolean {
    if (content.length === 0) return false;
    const selectedCount = content.filter(article => 
      this.selectedItems.has(this.getArticleKey(article))
    ).length;
    return selectedCount > 0 && selectedCount < content.length;
  }

  toggleSelectAll(content: LibraryItem[]): void {
    if (this.isAllSelected(content)) {
      this.selectedItems.clear();
    } else {
      content.forEach(article => {
        this.selectedItems.add(this.getArticleKey(article));
      });
      this.selectionMode = true;
    }
  }

  getRemovableSelectedCount(): number {
    return this.selectedItems.size;
  }

  async bulkRemoveFromLibrary(): Promise<void> {
    if (this.processingBulkAction) return;
    
    const articlesToRemove = this.libraryItemsCache.filter(article => 
      this.selectedItems.has(this.getArticleKey(article))
    );
    
    if (articlesToRemove.length === 0) return;
    
    this.processingBulkAction = true;
    
    try {
      for (const article of articlesToRemove) {
        await this.trainingService.removeFromLibrary(article);
        this.libraryItemsCache = this.libraryItemsCache.filter(l => l.id !== article.id);
      }
      
      this.snackBar.open(
        `Removed ${articlesToRemove.length} article${articlesToRemove.length > 1 ? 's' : ''} from your library.`,
        'Close',
        { duration: 5000 }
      );
      
      this.clearSelection();
      this.selectedArticle = null;
    } catch (error) {
      console.error('Error removing articles:', error);
      this.snackBar.open('Error removing some articles. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.processingBulkAction = false;
    }
  }

  openAutoStartDialog(): void {
    const dialogRef = this.dialog.open(AutoStartDialog, {
      width: '480px',
      data: { 
        enabled: this.autoStartTrainings 
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result !== undefined) {
        this.autoStartTrainings = result;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.trainingsSubscription) this.trainingsSubscription.unsubscribe();
    if (this.autoBuildSubscription) this.autoBuildSubscription.unsubscribe();
    if (this.autoBuildCancel) this.autoBuildCancel();
  }
}

@Component({
  standalone: true,
  selector: 'auto-start-dialog',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule
  ],
  template: `
    <div class="auto-start-dialog">
      <div class="dialog-header">
        <mat-icon class="header-icon">schedule_send</mat-icon>
        <h2>Auto Start Trainings</h2>
      </div>
      
      <div class="dialog-content">
        <p class="description">
          When enabled, trainings will automatically start at <strong>8:00 AM Central Time</strong> 
          on their due date. Team members will be notified via SMS or email based on their preferences.
        </p>
        
        <div class="benefit-list">
          <div class="benefit">
            <mat-icon>check_circle</mat-icon>
            <span>Never miss a training deadline</span>
          </div>
          <div class="benefit">
            <mat-icon>check_circle</mat-icon>
            <span>Team members get notified automatically</span>
          </div>
          <div class="benefit included">
            <mat-icon>star</mat-icon>
            <span><strong>SMS texting included free</strong> with your Chimp Unlimited plan</span>
          </div>
        </div>
        
        <div class="toggle-section">
          <div class="toggle-label">
            <span class="label-text">Auto Start Trainings</span>
            <span class="status-text" [class.enabled]="enabled">{{ enabled ? 'Enabled' : 'Disabled' }}</span>
          </div>
          <mat-slide-toggle 
            [checked]="enabled"
            (change)="enabled = $event.checked"
            color="primary">
          </mat-slide-toggle>
        </div>
      </div>
      
      <div class="dialog-actions">
        <button mat-button (click)="cancel()">Cancel</button>
        <button mat-flat-button color="primary" (click)="save()">Save</button>
      </div>
    </div>
  `,
  styles: [`
    .auto-start-dialog {
      padding: 24px;
    }
    
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    
    .header-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: var(--chimp-primary);
    }
    
    .dialog-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--chimp-on-surface);
    }
    
    .dialog-content {
      margin-bottom: 24px;
    }
    
    .description {
      font-size: 15px;
      line-height: 1.6;
      color: var(--chimp-on-surface-variant);
      margin: 0 0 20px;
    }
    
    .benefit-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }
    
    .benefit {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      color: var(--chimp-on-surface);
    }
    
    .benefit mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--chimp-success);
    }
    
    .benefit.included {
      padding: 12px 16px;
      background: linear-gradient(135deg, rgba(76, 175, 80, 0.08), rgba(76, 175, 80, 0.04));
      border-radius: 12px;
      border: 1px solid rgba(76, 175, 80, 0.2);
    }
    
    .benefit.included mat-icon {
      color: #f59e0b;
    }
    
    .toggle-section {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: var(--chimp-surface-container);
      border-radius: 12px;
      border: 1px solid var(--chimp-outline-variant);
    }
    
    .toggle-label {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .label-text {
      font-size: 14px;
      font-weight: 600;
      color: var(--chimp-on-surface);
    }
    
    .status-text {
      font-size: 12px;
      color: var(--chimp-outline);
    }
    
    .status-text.enabled {
      color: var(--chimp-success);
    }
    
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
  `]
})
export class AutoStartDialog {
  enabled: boolean;

  constructor(
    public dialogRef: MatDialogRef<AutoStartDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { enabled: boolean }
  ) {
    this.enabled = data.enabled;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  save(): void {
    this.dialogRef.close(this.enabled);
  }
}
