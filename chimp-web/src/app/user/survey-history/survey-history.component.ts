import { Component, OnInit, inject, DestroyRef, ChangeDetectorRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { UserService } from "../user.service";
import { Survey, SurveyResponse } from "src/app/app.service";

interface CompletedSurvey {
  survey: Survey;
  response: SurveyResponse;
}

@Component({
  standalone: true,
  selector: "survey-history",
  templateUrl: "./survey-history.component.html",
  styleUrls: ["./survey-history.component.scss"],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ]
})
export class SurveyHistoryComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  completedSurveys: CompletedSurvey[] = [];
  loading = true;

  ngOnInit(): void {
    // Wait for surveys to be loaded, then filter to completed ones
    this.userService.surveysObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(surveys => {
        this.updateCompletedSurveys(surveys);
      });

    this.userService.surveysLoaded
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(loaded => {
        if (loaded) {
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  private updateCompletedSurveys(surveys: Survey[] | null): void {
    const teamMemberId = this.userService.teamMember?.id;
    if (!teamMemberId || !surveys) {
      this.completedSurveys = [];
      return;
    }

    this.completedSurveys = surveys
      .map(s => {
        const responses = (s as any)['responses'] || [];
        const myResponse = responses.find((r: SurveyResponse) => r.teamMemberId === teamMemberId);
        if (myResponse) {
          return { survey: s, response: myResponse } as CompletedSurvey;
        }
        return null;
      })
      .filter((item): item is CompletedSurvey => item !== null)
      .sort((a, b) => {
        // Sort by response date, most recent first
        const dateA = a.response.createdAt instanceof Date
          ? a.response.createdAt
          : (a.response.createdAt as any)?.toDate?.() || new Date(0);
        const dateB = b.response.createdAt instanceof Date
          ? b.response.createdAt
          : (b.response.createdAt as any)?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

    this.cdr.detectChanges();
  }

  goBack(): void {
    this.router.navigate(['/user'], { queryParamsHandling: 'preserve' });
  }

  getResponseDate(response: SurveyResponse): Date {
    if (response.createdAt instanceof Date) return response.createdAt;
    return (response.createdAt as any)?.toDate?.() || new Date();
  }
}
