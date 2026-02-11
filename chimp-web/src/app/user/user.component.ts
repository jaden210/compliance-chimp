import { Component, AfterViewInit, inject, DestroyRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, ActivatedRoute, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { trigger, style, transition, animate } from "@angular/animations";
import { UserService } from "./user.service";
import { MatDialog } from "@angular/material/dialog";
import { AppService } from "../app.service";
import { combineLatest, of } from "rxjs";
import { map, catchError, switchMap, tap, take } from "rxjs/operators";

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
        const userId = params.get("user-id");
        
        if (userId) {
          // user-id param indicates a manager/owner viewing their page
          localStorage.setItem("ccuid", JSON.stringify(userId));
          localStorage.removeItem("ccmid"); // Clear member ID if switching to manager view
          this.dataInitialized = false;
          this.userService.isViewingAsManager = true;
          this.userService.isViewingAsMember = false;
        } else if (memberId) {
          // New member-id in URL - always save and fetch fresh data
          localStorage.setItem("ccmid", JSON.stringify(memberId));
          localStorage.removeItem("ccuid"); // Clear user ID if switching to member view
          this.dataInitialized = false; // Reset to force fresh fetch with new member
          // Mark that we're viewing as a team member (admin viewing another user's page)
          // This suppresses admin-only UI features so the experience matches what the team member sees
          this.userService.isViewingAsMember = true;
          this.userService.isViewingAsManager = false;
        } else {
          // No ID in URL - check localStorage for existing session
          this.userService.isViewingAsMember = false;
          this.userService.isViewingAsManager = false;
        }
        
        // Only initialize data once per session, unless we got a new ID
        // This prevents re-fetching when navigating to child routes (survey, etc.)
        if (!this.dataInitialized) {
          this.dataInitialized = true;
          this.getData();
        }
      });
  }

  private getData() {
    const memberId = JSON.parse(localStorage.getItem("ccmid") || 'null');
    const userId = JSON.parse(localStorage.getItem("ccuid") || 'null');
    
    // Check if we're viewing as a manager (user-id takes precedence)
    if (userId) {
      this.userService.surveysLoaded.next(false);
      this.fetchManagerData(userId);
      return;
    }
    
    if (!memberId) {
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
        this.userService.teamMember = tm;
        this.userService.teamMemberObservable.next(tm);
      }

      if (cachedTeam) {
        const team = JSON.parse(cachedTeam);
        this.userService.aTeam = team;
        this.userService.teamObservable.next(team);
      }

      if (cachedSurveys) {
        const surveys = JSON.parse(cachedSurveys);
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
        take(1),
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          console.error('[UserComponent] Error fetching team member:', error);
          return of(null);
        })
      )
      .subscribe(tm => {
        if (tm) {
          // If this team member is linked to a manager, upgrade to manager view
          if ((tm as any).linkedUserId) {
            localStorage.setItem("ccuid", JSON.stringify((tm as any).linkedUserId));
            localStorage.removeItem("ccmid");
            this.userService.isViewingAsManager = true;
            this.userService.isViewingAsMember = false;
            this.userService.surveysLoaded.next(false);
            this.fetchManagerData((tm as any).linkedUserId);
            return;
          }
          
          // Cache and set team member
          this.cacheData(`cc_tm_${memberId}`, tm);
          this.userService.teamMember = tm;
          this.userService.teamMemberObservable.next(tm);
          
          // Load team and other data in parallel
          this.loadTeamData(tm, memberId);
        } else if (!this.userService.teamMember) {
          // Only redirect if we don't have cached data
          this.router.navigate(['user/no-user']);
        }
      });
  }

  /**
   * Fetch manager data from the 'user' collection.
   * Managers/owners use user-id instead of member-id.
   */
  private fetchManagerData(userId: string): void {
    this.userService.getManager(userId)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          console.error('[UserComponent] Error fetching manager:', error);
          return of(null);
        })
      )
      .subscribe((manager: any) => {
        if (manager) {
          // Store the manager and create a pseudo team member for display purposes
          this.userService.currentManager = manager;
          
          // Create a TeamMember-like object from the manager for UI compatibility
          const pseudoMember: any = {
            id: manager.id,
            name: manager.name,
            email: manager.email,
            phone: manager.phone,
            jobTitle: manager.jobTitle,
            teamId: manager.teamId,
            isManager: true
          };
          
          this.userService.teamMember = pseudoMember;
          this.userService.teamMemberObservable.next(pseudoMember);
          
          // Load team and other data
          this.loadTeamDataForManager(manager, userId);
        } else {
          this.router.navigate(['user/no-user']);
        }
      });
  }

  /**
   * Load team data for a manager.
   * If the manager has a linkedMemberId, load surveys for that member ID
   * so the manager sees their own trainings.
   */
  private loadTeamDataForManager(manager: any, userId: string): void {
    this.userService.getTeam(manager.teamId)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        catchError(e => { console.error('[UserComponent] Error fetching team:', e); return of(null); })
      )
      .subscribe(team => {
        if (team && team.id) {
          this.userService.aTeam = team;
          this.userService.teamObservable.next(team);
          
          // Check auth state (non-blocking)
          this.userService.checkAuthState();
          
          // If manager has a linked member record, load surveys for that member ID
          const linkedMemberId = manager.linkedMemberId;
          if (linkedMemberId) {
            this.loadSurveys(team.id, linkedMemberId);
          } else {
            // No linked member - no surveys
            this.userService.surveys = [];
            this.userService.surveysLoaded.next(true);
          }
          
          // Load files (in parallel)
          this.loadFiles(manager.teamId);
          
          // Load team managers in background
          this.loadTeamManagers(manager.teamId);
        } else {
          this.router.navigate(['user/no-team']);
        }
      });
  }

  /**
   * Load team and related data
   */
  private loadTeamData(tm: any, memberId: string): void {
    // Start all requests in parallel for faster loading
    // take(1) ensures we only process the initial snapshot and don't
    // re-trigger all dependent loads on subsequent Firestore re-emissions
    this.userService.getTeam(tm.teamId)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        catchError(e => { console.error('[UserComponent] Error fetching team:', e); return of(null); })
      )
      .subscribe(team => {
        if (team && team.id) {
          // Cache and set team
          this.cacheData(`cc_team_${memberId}`, team);
          this.userService.aTeam = team;
          this.userService.teamObservable.next(team);
          
          // Check auth state (non-blocking)
          this.userService.checkAuthState();
          
          // Load surveys - show immediately, fetch responses in background
          this.loadSurveys(team.id, memberId);
          
          // Load files (in parallel)
          this.loadFiles(tm.teamId);
          
          // Load team managers in background (low priority - for author info only)
          this.loadTeamManagers(tm.teamId);
        } else if (!this.userService.aTeam) {
          this.router.navigate(['user/no-team']);
        }
      });
  }

  /**
   * Load surveys with optimized response fetching.
   * Uses switchMap so each new emission from getSurveys cancels the previous
   * inner response-fetching subscriptions, preventing duplicate calls.
   */
  private loadSurveys(teamId: string, memberId: string): void {
    this.userService.getSurveys(teamId, memberId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(e => { console.error('[UserComponent] Error fetching surveys:', e); return of([]); }),
        tap(surveys => {
          if (surveys.length > 0) {
            // OPTIMIZATION: Show surveys immediately (without responses)
            // This lets the UI update faster, then we fetch responses
            const surveysWithEmptyResponses = surveys.map(s => ({ ...s, responses: [] }));
            this.userService.surveys = surveysWithEmptyResponses;
          }
        }),
        switchMap(surveys => {
          if (surveys.length === 0) {
            return of([]);
          }
          // Fetch responses for all surveys in parallel, take(1) to get the
          // initial snapshot and then complete (no lingering live listeners)
          return combineLatest(surveys.map(s => 
            this.userService.getSurveyResponses(s.id).pipe(
              take(1),
              map(r => ({ ...s, responses: r })),
              catchError(() => of({ ...s, responses: [] }))
            )
          ));
        })
      )
      .subscribe(surveysWithResponses => {
        this.userService.surveys = surveysWithResponses;
        this.userService.surveysLoaded.next(true);
        this.cacheData(`cc_surveys_${memberId}`, surveysWithResponses);
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
