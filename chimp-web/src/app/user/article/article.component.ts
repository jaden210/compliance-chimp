import { Component, OnInit, inject, ViewChild, ElementRef, DestroyRef } from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { Router, ActivatedRoute, ParamMap, RouterModule } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AttendanceComponent } from "./attendance.component";
import { HistoryComponent } from "./history.component";
import { Article, MyContent, Topic, UserService } from "../user.service";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatBottomSheet, MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { Survey } from "src/app/app.service";
import { LibraryItem } from "src/app/account/training/training.service";
import { BlasterService } from "src/app/blaster/blaster.service";

@Component({
  standalone: true,
  selector: "app-article",
  templateUrl: "./article.component.html",
  styleUrls: ["./article.component.scss"],
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatBottomSheetModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class ArticleComponent implements OnInit {
  @ViewChild("dataContainer") dataContainer: ElementRef;

  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
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
                });
            });
        }
      });
  }

  private loadData(html: string): void {
    this.dataContainer.nativeElement.innerHTML = html;
  }

  public startTraining() {
    this.bottomSheet.open(AttendanceComponent, {
      data: this.article
    }).afterDismissed().subscribe(data => {
      if (data?.startTraining && data?.trainees?.length > 0) {
        this.blasterService.createSurvey(
          this.article,
          data.trainees,
          this.userService.loggedInUser.id,
          this.userService.aTeam.id
        ).then(() => {
          this.goBack();
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
