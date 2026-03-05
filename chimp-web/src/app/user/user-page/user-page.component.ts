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
    <div class="irt-sheet">
      <div class="irt-header">
        <span class="irt-title">Report an Incident</span>
        <span class="irt-subtitle">Choose the type of report to file</span>
      </div>
      <div class="irt-options">
        <button class="irt-option irt-option--employee" (click)="close('injuryReport')">
          <div class="irt-option-icon">
            <mat-icon>personal_injury</mat-icon>
          </div>
          <div class="irt-option-text">
            <span class="irt-option-title">Employee Report</span>
            <span class="irt-option-desc">Injury, illness, or near miss</span>
          </div>
          <mat-icon class="irt-option-arrow">chevron_right</mat-icon>
        </button>
        <button class="irt-option irt-option--supervisor" (click)="close('supervisorInvestigation')">
          <div class="irt-option-icon">
            <mat-icon>manage_search</mat-icon>
          </div>
          <div class="irt-option-text">
            <span class="irt-option-title">Supervisor Investigation</span>
            <span class="irt-option-desc">Management incident investigation</span>
          </div>
          <mat-icon class="irt-option-arrow">chevron_right</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .irt-sheet {
      padding: 8px 16px 24px;
    }

    .irt-header {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 0 20px;
      border-bottom: 1px solid #e5e7eb;
      margin-bottom: 16px;
    }

    .irt-title {
      font-size: 17px;
      font-weight: 700;
      color: #1f2937;
    }

    .irt-subtitle {
      font-size: 13px;
      color: #9ca3af;
    }

    .irt-options {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .irt-option {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: #fff;
      cursor: pointer;
      width: 100%;
      text-align: left;
      transition: all 0.15s ease;

      &:active {
        opacity: 0.8;
        transform: scale(0.99);
      }
    }

    .irt-option-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
        color: #fff;
      }
    }

    .irt-option--employee .irt-option-icon {
      background: linear-gradient(135deg, #ef4444, #f87171);
    }

    .irt-option--supervisor .irt-option-icon {
      background: linear-gradient(135deg, #054d8a, #0a6fc2);
    }

    .irt-option-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .irt-option-title {
      font-size: 15px;
      font-weight: 600;
      color: #1f2937;
    }

    .irt-option-desc {
      font-size: 12px;
      color: #9ca3af;
    }

    .irt-option-arrow {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #9ca3af;
      flex-shrink: 0;
    }
  `]
})
export class InjuryReportTypeSheet {
  private readonly bsr = inject(MatBottomSheetRef<InjuryReportTypeSheet>);

  public close(type: string) {
    this.bsr.dismiss(type);
  }
}
