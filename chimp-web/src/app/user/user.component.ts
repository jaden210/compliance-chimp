import { Component, AfterViewInit, inject, DestroyRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, ActivatedRoute, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { trigger, style, transition, animate } from "@angular/animations";
import { UserService } from "./user.service";
import { MatDialog } from "@angular/material/dialog";
import { AppService } from "../app.service";
import { combineLatest } from "rxjs";
import { map, mergeMap } from "rxjs/operators";

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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tm => {
        if (tm) {
          this.userService.teamMember = tm;
          this.userService.teamMemberObservable.next(tm);
          this.userService.setIsLoggedIn();
          combineLatest([
            this.userService.getTeam(tm.teamId),
            this.userService.getTeamManagers(tm.teamId),
            this.userService.getFiles(tm.teamId)
          ])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(data => {
              const team = data[0];
              const teamManagers = data[1];
              if (team && team.id) {
                this.userService.aTeam = team;
                this.userService.teamManagersObservable.next(teamManagers);
                this.userService.teamManagers = teamManagers;
                this.userService.files = data[2];
                this.userService.teamObservable.next(team);
                this.userService.getSurveys(team.id, memberId)
                  .pipe(
                    mergeMap(surveys =>
                      combineLatest(surveys.map(s => {
                        s['author'] = teamManagers.find(tm => tm.id === s.userId);
                        return this.userService.getSurveyResponses(s.id).pipe(
                          map(r => ({ ...s, responses: r }))
                        );
                      }))
                    ),
                    takeUntilDestroyed(this.destroyRef)
                  )
                  .subscribe(r => {
                    this.userService.surveys = r;
                  });
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
