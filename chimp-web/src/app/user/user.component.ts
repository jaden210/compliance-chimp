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

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        if (params.get("member-id")) {
          localStorage.setItem("ccmid", JSON.stringify(params.get('member-id')));
        }
        this.getData();
      });
  }

  private getData() {
    const memberId = JSON.parse(localStorage.getItem("ccmid") || 'null');
    if (!memberId) {
      this.router.navigate(['user/no-user']);
      return;
    }

    this.userService.getUser(memberId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          console.error('Error fetching team member:', error);
          return of(null);
        })
      )
      .subscribe(tm => {
        if (tm) {
          this.userService.teamMember = tm;
          this.userService.teamMemberObservable.next(tm);
          
          // Load team first (essential for page display)
          this.userService.getTeam(tm.teamId)
            .pipe(
              takeUntilDestroyed(this.destroyRef),
              catchError(e => { console.error('Error fetching team:', e); return of(null); })
            )
            .subscribe(team => {
              if (team && team.id) {
                this.userService.aTeam = team;
                this.userService.teamObservable.next(team);
                
                // Check auth state (non-blocking)
                this.userService.checkAuthState();
                
                // Load secondary data in background (non-blocking)
                this.userService.getTeamManagers(tm.teamId)
                  .pipe(
                    takeUntilDestroyed(this.destroyRef),
                    catchError(e => { console.error('Error fetching managers:', e); return of([]); })
                  )
                  .subscribe(teamManagers => {
                    this.userService.teamManagersObservable.next(teamManagers);
                    this.userService.teamManagers = teamManagers;
                    
                    // Load surveys after managers (needs manager data for author)
                    this.userService.getSurveys(team.id, memberId)
                      .pipe(
                        mergeMap(surveys =>
                          surveys.length ? combineLatest(surveys.map(s => {
                            s['author'] = teamManagers.find(m => m.id === s.userId);
                            return this.userService.getSurveyResponses(s.id).pipe(
                              map(r => ({ ...s, responses: r })),
                              catchError(() => of({ ...s, responses: [] }))
                            );
                          })) : of([])
                        ),
                        takeUntilDestroyed(this.destroyRef),
                        catchError(e => { console.error('Error fetching surveys:', e); return of([]); })
                      )
                      .subscribe(r => {
                        this.userService.surveys = r;
                      });
                  });
                
                this.userService.getFiles(tm.teamId)
                  .pipe(
                    takeUntilDestroyed(this.destroyRef),
                    catchError(e => { console.error('Error fetching files:', e); return of([]); })
                  )
                  .subscribe(files => {
                    this.userService.files = files;
                  });
              } else {
                console.error('Team not found or invalid');
                this.router.navigate(['user/no-team']);
              }
            });
        } else {
          this.router.navigate(['user/no-user']);
        }
      });
  }

  ngAfterViewInit() {
    // View initialized
  }
}
