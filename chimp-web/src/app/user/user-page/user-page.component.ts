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
import { ResourceFile } from "src/app/account/support/resource-library.service";
import { Subscription } from "rxjs";

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
  completedSurveyCount = 0;
  surveysLoaded = false;
  
  // Resource library
  resourceFiles: ResourceFile[] = [];
  private resourceSubscription: Subscription;

  ngOnInit() {
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team && team.showResourceLibrary !== false) {
          this.loadResourceFiles();
        } else {
          this.resourceFiles = [];
        }
      });

    // Subscribe to surveys changes to trigger UI updates
    this.userService.surveysObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(surveys => {
        this.updateFilteredSurveys(surveys);
      });

    // Subscribe to surveys loaded state
    this.userService.surveysLoaded
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(loaded => {
        this.surveysLoaded = loaded;
        this.cdr.detectChanges();
      });

    // Also subscribe to team member changes (needed for filtering)
    this.userService.teamMemberObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tm => {
        if (tm) {
          this.updateFilteredSurveys(this.userService.surveys);
        }
      });
  }

  private updateFilteredSurveys(surveys: Survey[] | null): void {
    const teamMemberId = this.userService.teamMember?.id;
    if (!teamMemberId) {
      this.filteredSurveys = [];
      return;
    }

    const allSurveys = surveys || [];

    if (this.userService.isViewingAsManager) {
      // Managers see all team surveys. "Completed" means has at least one response.
      let completedCount = 0;
      this.filteredSurveys = allSurveys.filter(s => {
        if (s.active === false) {
          completedCount++;
          return false;
        }
        const responses = (s as any)['responses'] || [];
        if (responses.length > 0) {
          completedCount++;
          return false; // Already has responses, show in history
        }
        return true; // No responses yet, show as pending
      });
      this.completedSurveyCount = completedCount;
    } else {
      // Regular team members: filter by their own responses
      let completedCount = 0;
      this.filteredSurveys = allSurveys.filter(s => {
        if (s.active === false) {
          completedCount++;
          return false;
        }
        const responses = (s as any)['responses'] || [];
        const hasResponded = responses.some((sr: any) => sr.teamMemberId == teamMemberId);
        if (hasResponded) completedCount++;
        return !hasResponded;
      });
      this.completedSurveyCount = completedCount;
    }
    
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
    // Installation handled by the PWA service
    
  }

  /**
   * Returns true only if user is logged in AND not viewing as another team member.
   * When an admin views a team member's page, this returns false to hide admin-only features.
   */
  public get IsLoggedIn(): boolean {
    return this.userService.isLoggedIn && !this.userService.isViewingAsMember;
  }

  /**
   * Returns true when the current person has a linked account (manager/owner)
   * but is not signed in. Used to show a sign-in prompt.
   */
  public get hasAccountButNotSignedIn(): boolean {
    return this.userService.isViewingAsManager && !this.userService.isLoggedIn;
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

  get hasFilesOrResources(): boolean {
    return (this.userService.files?.length > 0) || (this.resourceFiles?.length > 0);
  }

  get totalFilesCount(): number {
    return (this.userService.files?.length || 0) + (this.resourceFiles?.length || 0);
  }

  private loadResourceFiles(): void {
    if (this.resourceSubscription) {
      this.resourceSubscription.unsubscribe();
    }
    this.resourceSubscription = this.userService.getResourceFiles().subscribe(files => {
      this.resourceFiles = files;
      this.cdr.detectChanges();
    });
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
