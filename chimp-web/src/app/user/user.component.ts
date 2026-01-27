import { Component, AfterViewInit, inject, DestroyRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, ActivatedRoute, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { trigger, style, transition, animate } from "@angular/animations";
import { UserService } from "./user.service";
import { MatDialog } from "@angular/material/dialog";
import { AppService } from "../app.service";
import { combineLatest, of } from "rxjs";
import { map, mergeMap, catchError } from "rxjs/operators";

@Component({
  standalone: true,
  selector: "app-user",
  templateUrl: "./user.component.html",
  styleUrls: ["./user.component.css"],
  imports: [CommonModule, RouterModule],
  animations: [
    trigger("helper", [
      transition(":enter", [
        style({ transform: "translateX(-150%)", opacity: 0 }),
        animate(
          "400ms ease-out",
          style({ transform: "translateX(0)", opacity: 1 })
        )
      ]),
      transition(":leave", [
        style({ transform: "translateX(0)", opacity: 1 }),
        animate(
          "400ms ease-in",
          style({ transform: "translateX(-150%)", opacity: 0 })
        )
      ])
    ])
  ]
})
export class UserComponent implements AfterViewInit {
  public readonly userService = inject(UserService);
  public readonly appService = inject(AppService);
  public readonly router = inject(Router);
  public readonly dialog = inject(MatDialog);
  
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  
  // Track if we've already initialized data to prevent duplicate fetches on child route navigation
  private dataInitialized = false;

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const memberId = params.get("member-id");
        
        if (memberId) {
          // New member-id in URL - always save and fetch fresh data
          localStorage.setItem("ccmid", JSON.stringify(memberId));
          this.dataInitialized = false; // Reset to force fresh fetch with new member
        }
        
        // Only initialize data once per session, unless we got a new member-id
        // This prevents re-fetching when navigating to child routes (survey, etc.)
        if (!this.dataInitialized) {
          this.dataInitialized = true;
          this.getData();
        }
      });
  }

  private getData() {
    const memberId = JSON.parse(localStorage.getItem("ccmid") || 'null');
    console.log('[UserComponent] getData() called');
    console.log('[UserComponent] memberId from localStorage:', memberId);
    
    if (!memberId) {
      console.log('[UserComponent] No memberId found, redirecting to no-user');
      this.router.navigate(['user/no-user']);
      return;
    }

    // Reset loading state - we're fetching fresh data
    this.userService.surveysLoaded.next(false);

    // OPTIMIZATION: Load cached data immediately for instant UI display
    this.loadCachedData(memberId);

    // Then fetch fresh data from Firebase (will update UI when it arrives)
    this.fetchFreshData(memberId);
  }

  /**
   * Load cached data from localStorage for instant UI display
   */
  private loadCachedData(memberId: string): void {
    try {
      const cachedTeamMember = localStorage.getItem(`cc_tm_${memberId}`);
      const cachedTeam = localStorage.getItem(`cc_team_${memberId}`);
      const cachedSurveys = localStorage.getItem(`cc_surveys_${memberId}`);

      if (cachedTeamMember) {
        const tm = JSON.parse(cachedTeamMember);
        console.log('[UserComponent] Loaded cached team member:', tm.name);
        this.userService.teamMember = tm;
        this.userService.teamMemberObservable.next(tm);
      }

      if (cachedTeam) {
        const team = JSON.parse(cachedTeam);
        console.log('[UserComponent] Loaded cached team:', team.name);
        this.userService.aTeam = team;
        this.userService.teamObservable.next(team);
      }

      if (cachedSurveys) {
        const surveys = JSON.parse(cachedSurveys);
        console.log('[UserComponent] Loaded cached surveys:', surveys.length);
        this.userService.surveys = surveys;
      }
    } catch (e) {
      console.warn('[UserComponent] Error loading cached data:', e);
    }
  }

  /**
   * Fetch fresh data from Firebase and cache it
   */
  private fetchFreshData(memberId: string): void {
    this.userService.getUser(memberId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          console.error('[UserComponent] Error fetching team member:', error);
          return of(null);
        })
      )
      .subscribe(tm => {
        console.log('[UserComponent] getUser() result:', tm);
        if (tm) {
          // Cache and set team member
          this.cacheData(`cc_tm_${memberId}`, tm);
          this.userService.teamMember = tm;
          this.userService.teamMemberObservable.next(tm);
          console.log('[UserComponent] Team member set, teamId:', tm.teamId);
          
          // Load team and other data in parallel
          this.loadTeamData(tm, memberId);
        } else if (!this.userService.teamMember) {
          // Only redirect if we don't have cached data
          console.log('[UserComponent] No team member found, redirecting to no-user');
          this.router.navigate(['user/no-user']);
        }
      });
  }

  /**
   * Load team and related data
   */
  private loadTeamData(tm: any, memberId: string): void {
    // Start all requests in parallel for faster loading
    this.userService.getTeam(tm.teamId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(e => { console.error('[UserComponent] Error fetching team:', e); return of(null); })
      )
      .subscribe(team => {
        console.log('[UserComponent] getTeam() result:', team);
        if (team && team.id) {
          // Cache and set team
          this.cacheData(`cc_team_${memberId}`, team);
          this.userService.aTeam = team;
          this.userService.teamObservable.next(team);
          console.log('[UserComponent] Team set:', team.id, team.name);
          
          // Check auth state (non-blocking)
          this.userService.checkAuthState();
          
          // Load surveys - show immediately, fetch responses in background
          this.loadSurveys(team.id, memberId);
          
          // Load files (in parallel)
          this.loadFiles(tm.teamId);
          
          // Load team managers in background (low priority - for author info only)
          this.loadTeamManagers(tm.teamId);
        } else if (!this.userService.aTeam) {
          console.error('[UserComponent] Team not found or invalid');
          this.router.navigate(['user/no-team']);
        }
      });
  }

  /**
   * Load surveys with optimized response fetching
   */
  private loadSurveys(teamId: string, memberId: string): void {
    console.log('[UserComponent] Fetching surveys for teamId:', teamId, 'memberId:', memberId);
    
    this.userService.getSurveys(teamId, memberId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(e => { console.error('[UserComponent] Error fetching surveys:', e); return of([]); })
      )
      .subscribe(surveys => {
        console.log('[UserComponent] getSurveys() raw result:', surveys);
        
        if (surveys.length === 0) {
          this.userService.surveys = [];
          this.userService.surveysLoaded.next(true);
          this.cacheData(`cc_surveys_${memberId}`, []);
          return;
        }

        // OPTIMIZATION: Show surveys immediately (without responses)
        // This lets the UI update faster, then we fetch responses
        const surveysWithEmptyResponses = surveys.map(s => ({ ...s, responses: [] }));
        this.userService.surveys = surveysWithEmptyResponses;

        // Fetch responses for all surveys in parallel
        combineLatest(surveys.map(s => 
          this.userService.getSurveyResponses(s.id).pipe(
            map(r => ({ ...s, responses: r })),
            catchError(() => of({ ...s, responses: [] }))
          )
        )).pipe(
          takeUntilDestroyed(this.destroyRef)
        ).subscribe(surveysWithResponses => {
          console.log('[UserComponent] Final surveys with responses:', surveysWithResponses);
          this.userService.surveys = surveysWithResponses;
          this.userService.surveysLoaded.next(true);
          this.cacheData(`cc_surveys_${memberId}`, surveysWithResponses);
        });
      });
  }

  /**
   * Load team files
   */
  private loadFiles(teamId: string): void {
    this.userService.getFiles(teamId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(e => { console.error('[UserComponent] Error fetching files:', e); return of([]); })
      )
      .subscribe(files => {
        console.log('[UserComponent] Files loaded:', files.length);
        this.userService.files = files;
      });
  }

  /**
   * Load team managers (low priority, for display only)
   */
  private loadTeamManagers(teamId: string): void {
    this.userService.getTeamManagers(teamId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(e => { console.error('[UserComponent] Error fetching managers:', e); return of([]); })
      )
      .subscribe(teamManagers => {
        console.log('[UserComponent] Team managers loaded:', teamManagers.length);
        this.userService.teamManagersObservable.next(teamManagers);
        this.userService.teamManagers = teamManagers;
      });
  }

  /**
   * Cache data to localStorage for instant loading on next visit
   */
  private cacheData(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('[UserComponent] Error caching data:', e);
    }
  }

  ngAfterViewInit() {
    // View initialized
  }
}
