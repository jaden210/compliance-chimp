import { Component, OnInit, inject, DestroyRef, ChangeDetectorRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { UserPageService } from "./user-page.service";
import { AppService, Survey } from "../../app.service";
import { Topic, UserService } from "../user.service";
import { Team, TeamMember } from "src/app/account/account.service";
import { MatBottomSheet, MatBottomSheetRef, MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { SurveyComponent } from "../survey/survey.component";
import { InjuryReport } from "../injury-report/injury-report.component";
import { PwaInstallService } from "../pwa-install.service";

@Component({
  standalone: true,
  selector: "user-page",
  templateUrl: "./user-page.component.html",
  styleUrls: ["./user-page.component.scss"],
  providers: [UserPageService],
  imports: [
    CommonModule,
    RouterModule,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule,
    MatListModule
  ]
})
export class UserPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly userPageService = inject(UserPageService);
  private readonly userService = inject(UserService);
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly pwaInstallService = inject(PwaInstallService);

  // Reactive surveys that update when the service data changes
  filteredSurveys: Survey[] = [];
  surveysLoaded = false;

  ngOnInit() {
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team) {
          // Team loaded
        }
      });

    // Subscribe to surveys changes to trigger UI updates
    this.userService.surveysObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(surveys => {
        console.log('[UserPageComponent] surveysObservable received:', surveys);
        this.updateFilteredSurveys(surveys);
      });

    // Subscribe to surveys loaded state
    this.userService.surveysLoaded
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(loaded => {
        console.log('[UserPageComponent] surveysLoaded:', loaded);
        this.surveysLoaded = loaded;
        this.cdr.detectChanges();
      });

    // Also subscribe to team member changes (needed for filtering)
    this.userService.teamMemberObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tm => {
        if (tm) {
          console.log('[UserPageComponent] teamMemberObservable received:', tm.id);
          this.updateFilteredSurveys(this.userService.surveys);
        }
      });
  }

  private updateFilteredSurveys(surveys: Survey[] | null): void {
    const teamMemberId = this.userService.teamMember?.id;
    if (!teamMemberId) {
      console.log('[UserPageComponent] updateFilteredSurveys: No teamMemberId yet');
      this.filteredSurveys = [];
      return;
    }

    const allSurveys = surveys || [];
    console.log('[UserPageComponent] updateFilteredSurveys - teamMemberId:', teamMemberId);
    console.log('[UserPageComponent] updateFilteredSurveys - allSurveys:', allSurveys.length);

    this.filteredSurveys = allSurveys.filter(s => {
      const responses = (s as any)['responses'] || [];
      const hasResponded = responses.some((sr: any) => sr.teamMemberId == teamMemberId);
      console.log('[UserPageComponent] Survey', s.id, (s as any)['title'], '- responses:', responses.length, '- hasResponded:', hasResponded);
      return !hasResponded;
    });

    console.log('[UserPageComponent] filteredSurveys result:', this.filteredSurveys.length, this.filteredSurveys);
    
    // Force change detection since Firebase callbacks happen outside Angular's zone
    this.cdr.detectChanges();
  }

  public routeTo(topic: Topic): void {
    this.router.navigate(["user", topic.id], { queryParamsHandling: "preserve" });
  }

  public startInjuryReport(): void {
    if (this.IsLoggedIn) {
      this.bottomSheet.open(InjuryReportTypeSheet).afterDismissed().subscribe(type => {
        if (type) {
          this.router.navigate(["user/injury-report"], { queryParams: { type }, queryParamsHandling: "preserve" });
        }
      });
    } else {
      this.router.navigate(["user/injury-report"], { queryParams: { type: "injuryReport" }, queryParamsHandling: "preserve" });
    }
  }

  public async viewSurvey(survey: Survey) {
    const authorColor = 'red';
    await this.bottomSheet.open(SurveyComponent, {
      data: { survey: { ...survey }, authorColor }
    });
  }

  public async installApp(): Promise<void> {
    const installed = await this.pwaInstallService.promptInstall();
    if (installed) {
      console.log('App installed successfully');
    }
  }

  public get IsLoggedIn(): boolean {
    return this.userService.isLoggedIn;
  }

  get TeamMember(): TeamMember {
    return this.userService.teamMember;
  }

  get Team(): Team {
    return this.userService.aTeam;
  }

  get Files(): any {
    return this.userService.files;
  }

  get Surveys(): Survey[] {
    return this.filteredSurveys;
  }

  get PImage() {
    return this.TeamMember?.profileUrl || this.Team?.logoUrl || '/assets/chimp.png';
  }
}


@Component({
  standalone: true,
  selector: "app-injury-report-type-sheet",
  imports: [CommonModule, MatIconModule],
  template: `
    <h2>Report an injury</h2>
    <div class="info">What type of injury are you reporting? Choose one:</div>
    <div class="ir" style="color: #FF9002" (click)="close('injuryReport')">
      <mat-icon>book</mat-icon>Personal Injury Report
    </div>
    <div class="ir" style="color: #054D8A" (click)="close('supervisorInvestigation')">
      <mat-icon>bookmark</mat-icon>Supervisor Investigation
    </div>
  `,
  styleUrls: ["./user-page.component.scss"],
})
export class InjuryReportTypeSheet {
  private readonly bsr = inject(MatBottomSheetRef<InjuryReportTypeSheet>);

  public close(type: string) {
    this.bsr.dismiss(type);
  }
}
