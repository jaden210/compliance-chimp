import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule, ActivatedRoute, Router, ParamMap } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { UserService } from "../user.service";
import { Survey, SurveyResponse, User } from "src/app/app.service";
import { LibraryItem } from "src/app/account/training/training.service";
import { TeamMember } from "src/app/account/account.service";
import { Subject, switchMap, filter } from "rxjs";
import { takeUntil } from "rxjs/operators";

interface ResponseWithMember extends SurveyResponse {
  memberName?: string;
}

@Component({
  standalone: true,
  selector: "survey-review",
  templateUrl: "./survey-review.component.html",
  styleUrls: ["./survey-review.component.scss"],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  providers: [DatePipe]
})
export class SurveyReviewComponent implements OnInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  survey: Survey;
  response: SurveyResponse;
  allResponses: ResponseWithMember[] = [];
  article: LibraryItem;
  sender: User;
  loading = true;

  get isManager(): boolean {
    return this.userService.isViewingAsManager;
  }

  get yesCount(): number {
    return this.allResponses.filter(r => r.shortAnswer === 'Yes').length;
  }

  get noCount(): number {
    return this.allResponses.filter(r => r.shortAnswer === 'No').length;
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        takeUntil(this.destroy$),
        filter((params: ParamMap) => !!params.get("surveyId")),
        switchMap((params: ParamMap) => {
          this.loading = true;
          const surveyId = params.get("surveyId");
          return this.userService.getSurvey(surveyId);
        })
      )
      .subscribe(survey => {
        if (survey) {
          survey.createdAt = survey.createdAt?.toDate ? survey.createdAt.toDate() : survey.createdAt;
          this.survey = survey;

          if (this.isManager) {
            this.loadAllResponses(survey.id);
          } else {
            this.findMyResponse(survey.id);
          }

          // Load article content
          if (survey.libraryId) {
            this.userService.getLibraryItem(survey.libraryId)
              .pipe(takeUntil(this.destroy$))
              .subscribe(li => {
                this.article = li;
                this.cdr.detectChanges();
              });
          }

          // Get sender info
          if (this.userService.teamManagers?.length) {
            this.sender = this.userService.teamManagers.find(u => u.id === survey.userId);
          }

          this.loading = false;
          this.cdr.detectChanges();
        } else {
          this.loading = false;
          this.cdr.detectChanges();
        }
      });

    // Listen for team managers loading later
    this.userService.teamManagersObservable
      .pipe(
        takeUntil(this.destroy$),
        filter(managers => managers != null && managers.length > 0)
      )
      .subscribe(managers => {
        if (this.survey && !this.sender) {
          this.sender = managers.find(u => u.id === this.survey.userId);
          this.cdr.detectChanges();
        }
      });

    // When team members load, enrich response names
    if (this.isManager) {
      this.userService.teamMembersObservable
        .pipe(
          takeUntil(this.destroy$),
          filter(members => members != null && members.length > 0)
        )
        .subscribe(members => {
          this.enrichResponseNames(members!);
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Manager view: load all responses for this survey and enrich with member names.
   */
  private loadAllResponses(surveyId: string): void {
    // Try from already-loaded surveys data first
    const surveys = this.userService.surveys || [];
    const matchingSurvey = surveys.find(s => s.id === surveyId);
    if (matchingSurvey) {
      const responses: SurveyResponse[] = (matchingSurvey as any)['responses'] || [];
      if (responses.length > 0) {
        this.allResponses = responses.map(r => ({ ...r } as ResponseWithMember));
        this.enrichResponseNames(this.userService.teamMembers || []);
        this.cdr.detectChanges();
        return;
      }
    }

    // Fallback: fetch from database
    this.userService.getSurveyResponses(surveyId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(responses => {
        this.allResponses = responses.map(r => ({ ...r } as ResponseWithMember));
        this.enrichResponseNames(this.userService.teamMembers || []);
        this.cdr.detectChanges();
      });
  }

  /**
   * Enrich responses with team member names for display.
   */
  private enrichResponseNames(members: TeamMember[]): void {
    if (!members.length || !this.allResponses.length) return;
    let changed = false;
    for (const r of this.allResponses) {
      if (!r.memberName) {
        const member = members.find(m => m.id === r.teamMemberId);
        if (member) {
          r.memberName = member.name;
          changed = true;
        }
      }
    }
    if (changed) this.cdr.detectChanges();
  }

  private findMyResponse(surveyId: string): void {
    const teamMemberId = this.userService.teamMember?.id;
    if (!teamMemberId) return;

    // First, try to find from already-loaded surveys data
    const surveys = this.userService.surveys || [];
    const matchingSurvey = surveys.find(s => s.id === surveyId);
    if (matchingSurvey) {
      const responses = (matchingSurvey as any)['responses'] || [];
      const myResponse = responses.find((r: SurveyResponse) => r.teamMemberId === teamMemberId);
      if (myResponse) {
        this.response = myResponse;
        this.cdr.detectChanges();
        return;
      }
    }

    // Fallback: fetch responses directly from the database
    this.userService.getSurveyResponses(surveyId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(responses => {
        const myResponse = responses.find(r => r.teamMemberId === teamMemberId);
        if (myResponse) {
          this.response = myResponse;
          this.cdr.detectChanges();
        }
      });
  }

  getResponseDate(): Date | null {
    if (!this.response?.createdAt) return null;
    if (this.response.createdAt instanceof Date) return this.response.createdAt;
    return (this.response.createdAt as any)?.toDate?.() || null;
  }

  getDate(createdAt: any): Date | null {
    if (!createdAt) return null;
    if (createdAt instanceof Date) return createdAt;
    return createdAt?.toDate?.() || null;
  }

  goBack(): void {
    this.router.navigate(['/user/survey-history'], { queryParamsHandling: 'preserve' });
  }
}
