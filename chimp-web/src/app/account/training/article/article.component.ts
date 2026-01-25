import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import {
  TrainingService,
  Article,
  TrainingExpiration
} from "../training.service";
import { Subscription, BehaviorSubject, forkJoin } from "rxjs";
import { AccountService, User } from "../../account.service";
import { BlasterDialog } from "../../../blaster/blaster.component";
import { tap } from "rxjs/operators";
import { SurveysService } from "../../surveys/surveys.service";
import { Survey } from "../../survey/survey";
import { TrainingStatusDialog } from "../shared/training-status.dialog";
import { Location } from "@angular/common";
import { combineLatest } from "rxjs";

@Component({
  standalone: true,
  selector: "app-article",
  templateUrl: "./article.component.html",
  styleUrls: ["./article.component.css"],
  providers: [SurveysService],
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule
  ]
})
export class ArticleComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  private userSubscription: Subscription;
  public article: Article;
  private teamId: string;
  private industryId: string;
  @ViewChild("dataContainer")
  dataContainer: ElementRef;
  isDev: boolean;
  users: BehaviorSubject<User[]>;
  /* Template variable to iterate over objects */
  objectKeys = Object.keys;
  title: string;
  isMyArticle: boolean;

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private service: TrainingService,
    private accountService: AccountService,
    private surveysService: SurveysService,
    private location: Location
  ) {}

  ngOnInit() {
    this.subscription = this.accountService.aTeamObservable.subscribe(team => {
      if (team) {
        this.users = this.accountService.teamManagersObservable;
        this.getIsDev();
        this.route.paramMap.subscribe((params: ParamMap) => {
          const articleId = params.get("article");
          this.teamId = team.id;
          this.service.getArticle(articleId, team.id).subscribe(article => {
            this.isMyArticle = articleId.includes(team.id);
            this.title = article.name;
            this.article = article;
            this.setIndustryId(params.get("industry"));
            this.loadData(article.content);
          });
        });
      }
    });
  }

  private setIndustryId(industryId): void {
    if (industryId) this.industryId = industryId;
    else
      this.service
        .getTopic(this.article.topicId, this.teamId)
        .subscribe(topic => {
          this.industryId = topic.industryId;
        });
  }



  private loadData(html): void {
    // not the best way but this will preserve styling
    this.dataContainer.nativeElement.innerHTML = html;
  }

  public editArticle(): void {
    let queryParams = {
      articleId: this.article.id,
      industryId: this.industryId
    };
    this.router.navigate(["account/training/edit-article"], { queryParams });
  }

  public favorite(): void {
  }

  private getIsDev(): void {
    this.userSubscription = this.accountService.userObservable.subscribe(
      user => {
        if (user) this.isDev = user.isDev;
      }
    );
  }

  public isExpired(userId: string): boolean {
    return this.article.myContent.needsTraining.includes(userId);
  }


  public removeTrainee(trainee): void {
    delete this.article.myContent.shouldReceiveTraining[trainee];
    let needsTraining = this.article.myContent.needsTraining;
    const i = needsTraining.indexOf(trainee);
    if (i > -1) needsTraining.splice(i, 1);
  }

  public get Timeframe(): string[] {
    return Object.keys(TrainingExpiration).map(key => TrainingExpiration[key]);
  }

  public setTrainingExpiration(time: string): void {
    // Update training expiration for the article
    if (this.article?.myContent) {
      this.article.myContent.trainingExpiration = time as TrainingExpiration;
      // TODO: Implement save to Firestore
      console.log('Training expiration updated to:', time);
    }
  }

  public startTraining(): void {
    // Pass the article with assigned tags so they're pre-selected
    let dialogRef = this.dialog.open(BlasterDialog, {
      data: { 
        libraryItem: { 
          ...this.article, 
          assignedTags: this.article?.myContent?.assignedTags || [] 
        } 
      }
    });
    dialogRef.afterClosed().subscribe((traineeIds: string[]) => {
      if (traineeIds) {
        let userSurvey = {};
        traineeIds.forEach(id => {
          userSurvey[id] = 0;
        });
        let survey = new Survey();
        survey.category = "Safety Training";
        survey.title = `Did you participate in this training? -${
          this.article.name
        }`;
        survey.active = true;
        survey.articleId = this.article.id;
        survey.userSurvey = userSurvey;
        survey.userId = this.accountService.user.id;
        this.surveysService.createSurvey(survey, this.teamId);
      }
    });
  }

  /* Called from template, if article.myContent */
  public openNeedsTrainingDialog(): void {
    const srtObj = this.article.myContent.shouldReceiveTraining || {};
    const needsTraining = this.article.myContent.needsTraining;
    const dialogRef = this.dialog.open(TrainingStatusDialog, {
      data: { srtObj, needsTraining }
    });
    dialogRef.afterClosed().subscribe(showHistory => {
      if (showHistory) {
        this.viewHistory();
      }
    });
  }

  viewHistory(): void {
    this.router.navigate(["account/training/history", this.article.id]);
  }

  public goBack(): void {
    const activeRoute: string = this.router.url;
    if (activeRoute.includes("article")) this.location.back();
    else {
      const backRoute = activeRoute.substr(0, activeRoute.lastIndexOf("/"));
      this.router.navigate([backRoute]);
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.userSubscription.unsubscribe();
  }
}
