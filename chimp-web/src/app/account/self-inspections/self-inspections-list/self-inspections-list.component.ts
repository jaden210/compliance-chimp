import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule } from "@angular/router";
import { SelfInspectionsService, SelfInspection, Inspection, CoverageAnalysis, CoverageRecommendation, AutoBuildProgress } from "../self-inspections.service";
import { AccountService } from "../../account.service";
import { ActivatedRoute, Router } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatChipsModule } from "@angular/material/chips";
import { Observable, BehaviorSubject, combineLatest, forkJoin, of, Subject } from "rxjs";
import { filter, map, shareReplay, switchMap, take, debounceTime, takeUntil, distinctUntilChanged } from "rxjs/operators";
import { WelcomeService } from "../../welcome.service";
import { WelcomeBannerComponent, WelcomeFeature } from "../../welcome-banner/welcome-banner.component";

export type FilterType = 'all' | 'inProgress' | 'lastInspected' | 'dueSoon' | 'overdue';
export type SortColumn = 'status' | 'name' | 'lastCompleted' | 'nextDue' | 'frequency' | null;
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface SelfInspectionWithStatus extends SelfInspection {
  nextDueDate?: Date;
  daysUntilDue?: number;
  status?: 'overdue' | 'dueSoon' | 'ok' | 'neverRun';
  inProgressInspection?: Inspection;
}

@Component({
  standalone: true,
  selector: "app-self-inspection",
  templateUrl: "./self-inspections-list.component.html",
  styleUrls: ["./self-inspections-list.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    MatChipsModule,
    WelcomeBannerComponent
  ],
  providers: [DatePipe]
})
export class SelfInspectionsListComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  @ViewChild('inspectionsSection') inspectionsSection: ElementRef<HTMLElement>;

  selfInspections$: Observable<SelfInspectionWithStatus[]>;
  filteredInspections$: Observable<SelfInspectionWithStatus[]>;
  activeFilter$ = new BehaviorSubject<FilterType>('dueSoon');
  sort$ = new BehaviorSubject<SortState>({ column: null, direction: 'asc' });
  
  // Coverage analysis state
  coverageAnalysis$ = new BehaviorSubject<CoverageAnalysis | null>(null);
  coverageLoading = signal(false);
  coverageError = signal<string | null>(null);
  coverageCollapsed = signal(this.loadCoverageCollapsedState());
  private analysisInProgress = false;

  // Auto-build state
  autoBuildActive = signal(false);
  autoBuildProgress = signal<AutoBuildProgress | null>(null);
  private autoBuildCancelFn: (() => void) | null = null;

  // Welcome banner features
  inspectionsWelcomeFeatures: WelcomeFeature[] = [
    {
      icon: 'calendar_today',
      title: 'Schedule View',
      description: 'See all your inspections at a glance. Filter by status to focus on what\'s due or overdue.',
      action: 'scrollToInspections'
    },
    {
      icon: 'play_circle',
      title: 'Run an Inspection',
      description: 'Tap any inspection to start. Add notes and photos as you go through each checklist item.',
      action: 'scrollToInspections'
    },
    {
      icon: 'repeat',
      title: 'Frequency Settings',
      description: 'Set how often each inspection should run - monthly, quarterly, semi-annually, or annually.',
      action: 'scrollToInspections'
    },
    {
      icon: 'trending_up',
      title: 'History & Trends',
      description: 'Each inspection tracks compliance over time. See how your scores improve with each run.',
      action: 'scrollToInspections'
    },
    {
      icon: 'analytics',
      title: 'Coverage Analysis',
      description: 'Get recommendations for inspections you might be missing based on your industry.',
      action: 'coverageAnalysis'
    }
  ];

  constructor(
    public router: Router,
    public route: ActivatedRoute,
    private selfInspectionsService: SelfInspectionsService,
    public accountService: AccountService,
    public welcomeService: WelcomeService
  ) {
    this.selfInspections$ = this.accountService.aTeamObservable.pipe(
      filter(team => !!team),
      switchMap(team => this.selfInspectionsService.getSelfInspections(team.id)),
      switchMap((inspections) => {
        if (inspections.length === 0) return of([]);
        // For each self-inspection, get its inspections to find in-progress ones
        const inspectionObservables = inspections.map(si => 
          this.selfInspectionsService.getInspections(si.id).pipe(
            take(1),
            map(runs => {
              const inProgress = runs.find(r => !r.completedAt);
              const result = this.addStatusInfo(si);
              result.inProgressInspection = inProgress;
              return result;
            })
          )
        );
        return forkJoin(inspectionObservables);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.filteredInspections$ = combineLatest([this.selfInspections$, this.activeFilter$, this.sort$]).pipe(
      map(([inspections, filterType, sort]) => this.applyFilterAndSort(inspections, filterType, sort))
    );
  }

  ngOnInit(): void {
    // Subscribe to team changes to pick up cached coverage analysis
    // This ensures we react when the Cloud Function stores new analysis
    this.accountService.aTeamObservable.pipe(
      filter(team => !!team),
      takeUntil(this.destroy$)
    ).subscribe(team => {
      // If team has a valid, non-stale coverage analysis, use it
      if (team.coverageAnalysis && !team.coverageAnalysisStale && team.coverageAnalysis.success) {
        this.coverageAnalysis$.next(team.coverageAnalysis);
        this.coverageLoading.set(false);
      }
    });

    // Subscribe to inspection changes with debounce to trigger coverage analysis
    this.selfInspections$.pipe(
      debounceTime(500), // Wait for data to stabilize
      takeUntil(this.destroy$)
    ).subscribe(inspections => {
      this.checkAndTriggerAnalysis(inspections);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Check if we should trigger a new analysis.
   * Uses Firestore-cached analysis from team document when available.
   * Only runs AI analysis if cache is stale or doesn't exist.
   */
  private checkAndTriggerAnalysis(inspections: SelfInspection[]): void {
    // Don't analyze if no industry set or no team members
    if (!this.canAnalyzeCoverage()) {
      return;
    }

    // Skip if already running
    if (this.analysisInProgress) {
      return;
    }

    // Skip if we already have a valid analysis displayed
    if (this.coverageAnalysis$.value?.success) {
      return;
    }

    // Check for cached analysis from Firestore (stored on team document)
    const team = this.accountService.aTeam;
    const cachedAnalysis = team?.coverageAnalysis;
    const isStale = team?.coverageAnalysisStale;
    
    console.log('[Coverage] Checking cache:', { 
      hasCachedAnalysis: !!cachedAnalysis, 
      isStale, 
      cacheSuccess: cachedAnalysis?.success 
    });
    
    if (cachedAnalysis && !isStale && cachedAnalysis.success) {
      // Use cached analysis - it's valid and not stale
      console.log('[Coverage] Using cached analysis from Firestore');
      this.coverageAnalysis$.next(cachedAnalysis);
      return;
    }

    // No valid cache, run the analysis
    console.log('[Coverage] No valid cache, running analysis...');
    this.runCoverageAnalysis(inspections);
  }

  /**
   * Run the AI coverage analysis.
   * The result is automatically stored in Firestore by the Cloud Function.
   */
  private runCoverageAnalysis(inspections: SelfInspection[]): void {
    this.analysisInProgress = true;
    this.coverageLoading.set(true);
    this.coverageError.set(null);

    this.selfInspectionsService.analyzeCoverage(inspections).pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (analysis) => {
        this.analysisInProgress = false;
        this.coverageLoading.set(false);
        
        if (analysis.success) {
          this.coverageAnalysis$.next(analysis);
          this.coverageError.set(null);
        } else {
          this.coverageError.set(analysis.error || 'Failed to analyze coverage');
        }
      },
      error: (err) => {
        this.analysisInProgress = false;
        this.coverageLoading.set(false);
        this.coverageError.set(err.message || 'Failed to analyze coverage');
      }
    });
  }

  /**
   * Manually refresh coverage analysis
   */
  refreshCoverageAnalysis(): void {
    this.selfInspections$.pipe(take(1)).subscribe(inspections => {
      this.runCoverageAnalysis(inspections);
    });
  }

  /**
   * Handle clicking on a coverage recommendation
   * Navigates to the guide with the recommendation pre-populated
   */
  useRecommendation(recommendation: CoverageRecommendation): void {
    // Store the recommendation as a pending template
    this.selfInspectionsService.setPendingTemplate({
      title: recommendation.name,
      frequency: recommendation.frequency,
      baseQuestions: recommendation.baseQuestions,
      description: recommendation.description,
      reason: recommendation.reason
    });
    
    // Navigate to the guide
    this.router.navigate(['guide'], { relativeTo: this.route });
  }

  /**
   * Get the score color class based on coverage score
   */
  getScoreColorClass(score: number): string {
    if (score >= 90) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 50) return 'score-fair';
    return 'score-needs-work';
  }

  /**
   * Get priority color class for recommendations
   */
  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return 'priority-medium';
    }
  }

  /**
   * Toggle coverage card collapsed state
   */
  toggleCoverageCollapsed(): void {
    const newState = !this.coverageCollapsed();
    this.coverageCollapsed.set(newState);
    this.saveCoverageCollapsedState(newState);
  }

  private loadCoverageCollapsedState(): boolean {
    try {
      const stored = localStorage.getItem('cc-inspections-coverage-collapsed');
      return stored === null ? false : stored === 'true';
    } catch {
      return false;
    }
  }

  private saveCoverageCollapsedState(collapsed: boolean): void {
    try {
      localStorage.setItem('cc-inspections-coverage-collapsed', String(collapsed));
    } catch {}
  }

  /**
   * Check if team has an industry set
   */
  hasIndustry(): boolean {
    return !!this.accountService.aTeam?.industry;
  }

  /**
   * Check if team has any team members
   */
  hasTeamMembers(): boolean {
    return !!(this.accountService.teamMembers && this.accountService.teamMembers.length > 0);
  }

  /**
   * Check if team has both industry and team members (required for coverage analysis)
   */
  canAnalyzeCoverage(): boolean {
    return this.hasIndustry() && this.hasTeamMembers();
  }

  private addStatusInfo(inspection: SelfInspection): SelfInspectionWithStatus {
    const result: SelfInspectionWithStatus = { ...inspection };
    
    // Check for manually set nextDueDate first
    const manualNextDueDate = (inspection as any).nextDueDate;
    if (manualNextDueDate) {
      const nextDue = manualNextDueDate?.toDate ? manualNextDueDate.toDate() : new Date(manualNextDueDate);
      result.nextDueDate = nextDue;
      
      const now = new Date();
      const diffTime = nextDue.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      result.daysUntilDue = diffDays;

      if (diffDays < 0) {
        result.status = 'overdue';
      } else if (diffDays <= 14) {
        result.status = 'dueSoon';
      } else {
        result.status = 'ok';
      }
      return result;
    }
    
    // Clear nextDueDate if not manually set
    result.nextDueDate = undefined;
    
    if (!inspection.lastCompletedAt || !inspection.inspectionExpiration || inspection.inspectionExpiration === 'Manual') {
      result.status = inspection.lastCompletedAt ? 'ok' : 'neverRun';
      return result;
    }

    const lastCompleted = inspection.lastCompletedAt?.toDate 
      ? inspection.lastCompletedAt.toDate() 
      : new Date(inspection.lastCompletedAt);
    
    const nextDue = this.calculateNextDueDate(lastCompleted, inspection.inspectionExpiration);
    result.nextDueDate = nextDue;
    
    const now = new Date();
    const diffTime = nextDue.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    result.daysUntilDue = diffDays;

    if (diffDays < 0) {
      result.status = 'overdue';
    } else if (diffDays <= 14) {
      result.status = 'dueSoon';
    } else {
      result.status = 'ok';
    }

    return result;
  }

  private calculateNextDueDate(lastCompleted: Date, frequency: string): Date {
    const nextDue = new Date(lastCompleted);
    
    switch (frequency) {
      case 'Monthly':
        nextDue.setMonth(nextDue.getMonth() + 1);
        break;
      case 'Quarterly':
        nextDue.setMonth(nextDue.getMonth() + 3);
        break;
      case 'Semi-Anually':
        nextDue.setMonth(nextDue.getMonth() + 6);
        break;
      case 'Anually':
      default:
        nextDue.setFullYear(nextDue.getFullYear() + 1);
        break;
    }
    
    return nextDue;
  }

  private applyFilterAndSort(inspections: SelfInspectionWithStatus[], filterType: FilterType, sort: SortState): SelfInspectionWithStatus[] {
    let filtered = [...inspections];

    // Apply filter
    switch (filterType) {
      case 'inProgress':
        filtered = filtered.filter(i => !!i.inProgressInspection);
        break;
      case 'overdue':
        filtered = filtered.filter(i => i.status === 'overdue');
        break;
      case 'dueSoon':
        filtered = filtered.filter(i => i.status === 'dueSoon' || i.status === 'overdue');
        break;
    }

    // Apply sort
    if (sort.column) {
      filtered = this.sortInspections(filtered, sort);
    } else {
      // Default sort based on filter
      switch (filterType) {
        case 'overdue':
        case 'dueSoon':
          filtered.sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));
          break;
        case 'lastInspected':
          filtered.sort((a, b) => {
            const aDate = a.lastCompletedAt?.toDate ? a.lastCompletedAt.toDate() : a.lastCompletedAt;
            const bDate = b.lastCompletedAt?.toDate ? b.lastCompletedAt.toDate() : b.lastCompletedAt;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return new Date(bDate).getTime() - new Date(aDate).getTime();
          });
          break;
        default:
          filtered.sort((a, b) => a.title.localeCompare(b.title));
      }
    }

    return filtered;
  }

  private sortInspections(inspections: SelfInspectionWithStatus[], sort: SortState): SelfInspectionWithStatus[] {
    const dir = sort.direction === 'asc' ? 1 : -1;

    return inspections.sort((a, b) => {
      switch (sort.column) {
        case 'status':
          const statusOrder = { overdue: 0, dueSoon: 1, ok: 2, neverRun: 3 };
          return (statusOrder[a.status || 'ok'] - statusOrder[b.status || 'ok']) * dir;
        
        case 'name':
          return a.title.localeCompare(b.title) * dir;
        
        case 'lastCompleted':
          const aLast = a.lastCompletedAt?.toDate ? a.lastCompletedAt.toDate() : a.lastCompletedAt;
          const bLast = b.lastCompletedAt?.toDate ? b.lastCompletedAt.toDate() : b.lastCompletedAt;
          if (!aLast) return 1 * dir;
          if (!bLast) return -1 * dir;
          return (new Date(aLast).getTime() - new Date(bLast).getTime()) * dir;
        
        case 'nextDue':
          if (!a.nextDueDate) return 1 * dir;
          if (!b.nextDueDate) return -1 * dir;
          return (a.nextDueDate.getTime() - b.nextDueDate.getTime()) * dir;
        
        case 'frequency':
          const freqOrder = { 'Manual': 0, 'Monthly': 1, 'Quarterly': 2, 'Semi-Anually': 3, 'Anually': 4 };
          const aFreq = freqOrder[a.inspectionExpiration || 'Manual'] ?? 5;
          const bFreq = freqOrder[b.inspectionExpiration || 'Manual'] ?? 5;
          return (aFreq - bFreq) * dir;
        
        default:
          return 0;
      }
    });
  }

  toggleSort(column: SortColumn) {
    const current = this.sort$.value;
    if (current.column === column) {
      // Toggle direction or clear
      if (current.direction === 'asc') {
        this.sort$.next({ column, direction: 'desc' });
      } else {
        this.sort$.next({ column: null, direction: 'asc' });
      }
    } else {
      this.sort$.next({ column, direction: 'asc' });
    }
  }

  setFilter(filterType: FilterType) {
    this.activeFilter$.next(filterType);
    // Clear sort when changing filter
    this.sort$.next({ column: null, direction: 'asc' });
  }

  selectSelfInspection(inspection) {
    this.router.navigate([inspection.id], { relativeTo: this.route });
  }

  goToGuide(): void {
    this.router.navigate(['guide'], { relativeTo: this.route });
  }

  goToTemplates(): void {
    this.router.navigate(['new'], { relativeTo: this.route });
  }

  // Handle welcome banner feature clicks
  onWelcomeFeatureClick(action: string): void {
    switch (action) {
      case 'scrollToInspections':
        this.scrollToInspectionsSection();
        break;
      case 'coverageAnalysis':
        // Expand coverage analysis if collapsed
        if (this.coverageCollapsed()) {
          this.toggleCoverageCollapsed();
        }
        break;
    }
  }

  scrollToInspectionsSection(): void {
    if (this.inspectionsSection?.nativeElement) {
      this.inspectionsSection.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Start the auto-build process to automatically create inspections
   * Iteratively analyzes coverage and creates recommended inspections
   */
  startAutoBuild(): void {
    if (this.autoBuildActive()) return;

    this.autoBuildActive.set(true);
    this.autoBuildProgress.set(null);

    const { progress$, cancel } = this.selfInspectionsService.autoBuildInspections();
    this.autoBuildCancelFn = cancel;

    progress$.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (progress) => {
        this.autoBuildProgress.set(progress);

        // Check if complete or errored
        if (progress.phase === 'complete' || progress.phase === 'error') {
          this.autoBuildActive.set(false);
          this.autoBuildCancelFn = null;
          // Coverage cache is automatically invalidated by Cloud Function triggers
          // when inspections are created, so no manual cache clearing needed
        }
      },
      error: (err) => {
        this.autoBuildActive.set(false);
        this.autoBuildCancelFn = null;
        this.autoBuildProgress.set({
          phase: 'error',
          iteration: 0,
          maxIterations: 5,
          currentScore: 0,
          targetScore: 95,
          inspectionsCreated: 0,
          currentAction: `Error: ${err.message}`,
          error: err.message,
          log: [{
            type: 'error',
            message: err.message,
            timestamp: new Date()
          }]
        });
      }
    });
  }

  /**
   * Cancel the auto-build process
   */
  cancelAutoBuild(): void {
    if (this.autoBuildCancelFn) {
      this.autoBuildCancelFn();
      this.autoBuildCancelFn = null;
    }
    this.autoBuildActive.set(false);
  }

  /**
   * Check if auto-build is complete
   */
  isAutoBuildComplete(): boolean {
    const progress = this.autoBuildProgress();
    return progress?.phase === 'complete';
  }

  /**
   * Check if auto-build had an error
   */
  isAutoBuildError(): boolean {
    const progress = this.autoBuildProgress();
    return progress?.phase === 'error';
  }

  /**
   * Get the progress percentage for the auto-build
   */
  getAutoBuildProgressPercent(): number {
    const progress = this.autoBuildProgress();
    if (!progress) return 0;
    
    // Calculate based on iteration progress and score
    const iterationProgress = ((progress.iteration - 1) / progress.maxIterations) * 50;
    const scoreProgress = (progress.currentScore / progress.targetScore) * 50;
    return Math.min(100, Math.round(iterationProgress + scoreProgress));
  }

  startInspection(inspection: SelfInspectionWithStatus) {
    if (inspection.inProgressInspection) {
      // Resume existing in-progress inspection
      this.router.navigate([inspection.id, inspection.inProgressInspection.id], { relativeTo: this.route });
    } else {
      // Start new inspection
      this.selfInspectionsService.startInspection(inspection).then(newInspection => {
        this.router.navigate([inspection.id, newInspection.id], { relativeTo: this.route });
      });
    }
  }

  trackByInspectionId(index: number, inspection: SelfInspection) {
    return inspection.id || inspection.title || index;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'overdue': return 'Overdue';
      case 'dueSoon': return 'Due Soon';
      case 'neverRun': return 'Never Run';
      default: return 'On Track';
    }
  }
}
