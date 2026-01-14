import { Component, OnInit, inject } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { MatDialogModule } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { User } from "src/app/account/account.service";
import { UserService } from "../user.service";
import { MatBottomSheetRef, MatBottomSheetModule, MAT_BOTTOM_SHEET_DATA } from "@angular/material/bottom-sheet";
import { Survey } from "src/app/account/survey/survey";
import { UserNamePipe } from "../../user-name.pipe";

@Component({
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    UserNamePipe
  ],
  providers: [DatePipe],
  template: `
    <mat-toolbar>
      <button mat-icon-button (click)="close()">
        <mat-icon>close</mat-icon>
      </button>
      History
    </mat-toolbar>
    <button
      mat-button
      style="color: #212121; margin-top: 12px;"
      (click)="showTrainees = !showTrainees"
    >
      <mat-icon>group</mat-icon>
      {{ traineesTitle }}
    </button>
    @if (showTrainees) {
      <div style="margin: -20px 0 0 42px; font-size: 14px;">
        @for (trainee of srt; track trainee) {
          <p>{{ trainee | userName: (users | async) }}</p>
        }
      </div>
    }
    <mat-list>
      @for (survey of (surveys | async); track survey.id) {
        <mat-list-item (click)="expand(survey.id)">
          <div>
            <h3>
              {{ survey.runDate | date }} by
              {{ survey.userId | userName: (users | async) }}
            </h3>
            <p>
              {{ survey.receivedTraining?.length }} employees received training
            </p>
            @if (expandedSurveyId === survey.id) {
              <div style="margin-left: 8px;" [class.expanded]="expandedSurveyId === survey.id">
                @for (attendee of survey.receivedTraining; track attendee) {
                  <p>{{ attendee | userName: (users | async) }}</p>
                }
              </div>
            }
          </div>
        </mat-list-item>
      }
    </mat-list>
    @if (noHistory) {
      <p style="text-align: center">No trainings exist for this article</p>
    }
  `
})
export class HistoryComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly bsr = inject(MatBottomSheetRef<HistoryComponent>);
  private readonly data = inject<any>(MAT_BOTTOM_SHEET_DATA);

  users: Observable<User[]>;
  surveys: Observable<Survey[]>;
  srt: string[];
  traineesTitle: string;
  noHistory: boolean;
  expandedSurveyId: string;
  showTrainees: boolean = false;

  ngOnInit() {
    const articleId = this.data.articleId;
    const teamId = this.data.teamId;
    const validityTerm = this.data.validityTerm;
    this.srt = this.data.srt || [];
    this.buildTraineesTitle(validityTerm);
    this.getHistory(teamId, articleId);
  }

  private buildTraineesTitle(validityTerm: string) {
    this.traineesTitle =
      this.srt.length === 1
        ? `1 requires this training ${validityTerm}`
        : `${this.srt.length} require this training ${validityTerm}`;
  }

  private getHistory(teamId: string, articleId: string): void {
    // TODO: Implement when getTrainingHistoryByArticle is available
    // this.surveys = this.userService
    //   .getTrainingHistoryByArticle(teamId, articleId)
    //   .pipe(tap(surveys => (this.noHistory = surveys.length ? false : true)));
  }

  public expand(surveyId: string): void {
    this.expandedSurveyId = this.expandedSurveyId === surveyId ? null : surveyId;
  }

  close() {
    this.bsr.dismiss({ startTraining: false });
  }
}
