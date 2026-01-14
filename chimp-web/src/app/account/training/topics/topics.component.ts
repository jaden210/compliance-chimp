import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { TrainingService, Topic } from "../training.service";
import { Observable, Subscription } from "rxjs";
import { AccountService } from "../../account.service";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { TopicDialogComponent } from "./topic-dialog/topic-dialog.component";
import { TopicsService } from "./topics.service";
import { Location } from "@angular/common";

@Component({
  standalone: true,
  selector: "app-topics",
  templateUrl: "./topics.component.html",
  styleUrls: ["./topics.component.css"],
  providers: [TopicsService],
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule
  ]
})
export class TopicsComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  private teamId: string;
  private userSubscription: Subscription;
  private industryId: string;
  public topics: Observable<Topic[]>;
  public isDev: boolean;
  public title: string;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private service: TrainingService,
    private accountService: AccountService,
    private dialog: MatDialog,
    private location: Location
  ) {}

  ngOnInit() {
    this.accountService.helper = this.accountService.helperProfiles.training;
    this.subscription = this.accountService.aTeamObservable.subscribe(team => {
      if (team) {
        this.teamId = team.id;
        this.setIsDev();
        this.route.paramMap.subscribe((params: ParamMap) => {
          this.industryId = params.get("industry");
          this.setActiveRoute();
          this.getTopics();
        });
      }
    });
  }

  private setIsDev(): void {
    this.userSubscription = this.accountService.userObservable.subscribe(
      user => {
        if (user) this.isDev = user.isDev;
      }
    );
  }

  private getTopics(forceRefresh = false): void {
    this.topics = this.service.getTopics(
      this.industryId,
      this.teamId,
      forceRefresh
    );
  }

  private setActiveRoute(): void {
    this.service.getIndustries().subscribe(industries => {
      const industry = industries.find(i => i.id == this.industryId);
      this.title = industry ? industry.name : null;
    });
  }

  public routeTo(topic: Topic): void {
    this.router.navigate([topic.id], { relativeTo: this.route });
  }

  public editTopic(topic: Topic): void {
    this.launchTopicDialog(topic);
  }

  public createTopic(): void {
    this.launchTopicDialog(new Topic());
  }

  private launchTopicDialog(topic: Topic): void {
    this.dialog
      .open(TopicDialogComponent, {
        data: {
          topic,
          industryId: this.industryId,
          teamId: this.teamId,
          isDev: this.isDev
        }
      })
      .afterClosed()
      .subscribe(topic => {
        if (topic) this.getTopics(true);
      });
  }

  public goBack(): void {
    this.router.navigate(["account/training/industries"]);
    // const activeRoute: string = this.router.url;
    // const backRoute = activeRoute.substr(0, activeRoute.lastIndexOf("/"));
    // this.router.navigate([backRoute]);
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.userSubscription.unsubscribe();
  }
}
