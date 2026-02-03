import { Component, OnInit, inject, ViewChild, ElementRef, DestroyRef } from "@angular/core";
import { CommonModule, Location, DatePipe } from "@angular/common";
import { Router, ActivatedRoute, ParamMap, RouterModule } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Firestore, collection, query, where, orderBy, limit, collectionData } from "@angular/fire/firestore";
import { AttendanceComponent } from "./attendance.component";
import { HistoryComponent } from "./history.component";
import { Article, MyContent, Topic, UserService } from "../user.service";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatBottomSheet, MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Survey } from "src/app/app.service";
import { LibraryItem } from "src/app/account/training/training.service";
import { BlasterService } from "src/app/blaster/blaster.service";

interface TrainingSession {
  id: string;
  createdAt: any;
  trainees: string[];
  responseCount?: number;
}

@Component({
  standalone: true,
  selector: "app-article",
  templateUrl: "./article.component.html",
  styleUrls: ["./article.component.scss"],
  imports: [
    CommonModule,
    RouterModule,
    DatePipe,
    MatDialogModule,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ]
})
export class ArticleComponent implements OnInit {
  @ViewChild("dataContainer") dataContainer: ElementRef;

  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly db = inject(Firestore);
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly blasterService = inject(BlasterService);
  private readonly destroyRef = inject(DestroyRef);

  teamId: string;
  articleId: string;
  topic: Topic;
  article: LibraryItem;
  error: string;
  training: boolean;
  
  // Training history
  latestSession: TrainingSession | null = null;
  isStartingTraining = false;
  justStartedTraining = false;

  ngOnInit() {
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team) {
          this.teamId = team.id;
          this.route.paramMap
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((params: ParamMap) => {
              this.articleId = params.get("articleId");
              this.userService.getArticle(this.articleId, this.teamId)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(article => {
                  this.article = article;
                  this.loadData(article.content);
                  this.loadLatestSession();
                });
            });
        }
      });
  }

  private loadData(html: string): void {
    this.dataContainer.nativeElement.innerHTML = html;
  }

  private loadLatestSession(): void {
    if (!this.articleId || !this.teamId) return;
    
    const surveysQuery = query(
      collection(this.db, "survey"),
      where("libraryId", "==", this.articleId),
      where("teamId", "==", this.teamId),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    
    collectionData(surveysQuery, { idField: "id" })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((surveys: any[]) => {
        if (surveys?.length > 0) {
          const survey = surveys[0];
          this.latestSession = {
            id: survey.id,
            createdAt: survey.createdAt,
            trainees: survey.trainees || []
          };
          // Load response count
          this.loadResponseCount(survey.id);
        }
      });
  }

  private loadResponseCount(surveyId: string): void {
    const responsesQuery = query(
      collection(this.db, "survey-response"),
      where("surveyId", "==", surveyId)
    );
    
    collectionData(responsesQuery)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((responses: any[]) => {
        if (this.latestSession) {
          this.latestSession.responseCount = responses?.length || 0;
        }
      });
  }

  get responseRate(): number {
    if (!this.latestSession || !this.latestSession.trainees?.length) return 0;
    return Math.round((this.latestSession.responseCount || 0) / this.latestSession.trainees.length * 100);
  }

  public startTraining() {
    this.bottomSheet.open(AttendanceComponent, {
      data: this.article
    }).afterDismissed().subscribe(data => {
      if (data?.startTraining && data?.trainees?.length > 0) {
        this.isStartingTraining = true;
        this.blasterService.createSurvey(
          this.article,
          data.trainees,
          this.userService.loggedInUser.id,
          this.userService.aTeam.id
        ).then(() => {
          this.isStartingTraining = false;
          this.justStartedTraining = true;
          // Reload the latest session to show the new one
          this.loadLatestSession();
          // Clear the "just started" state after a few seconds
          setTimeout(() => {
            this.justStartedTraining = false;
          }, 5000);
        }).catch(() => {
          this.isStartingTraining = false;
        });
      }
    });
  }

  public async showHistory() {
    let myContent: MyContent | undefined;
    if (myContent) {
      this.bottomSheet.open(HistoryComponent, {
        data: {
          articleId: this.article.id,
          srt: Object.keys(myContent.shouldReceiveTraining),
          teamId: this.teamId,
          validityTerm: myContent.trainingExpiration.toLowerCase()
        }
      });
    }
  }

  public goBack(): void {
    this.location.back();
  }
}
