import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { ActivatedRoute, Router } from "@angular/router";
import { TrainingService, MyContent } from "../training.service";
import { Observable, Subscription } from "rxjs";
import { AccountService } from "../../account.service";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { MatBadgeModule } from "@angular/material/badge";
import { MatTooltipModule } from "@angular/material/tooltip";
import { SearchDialog, SearchParams } from "./search-dialog/search.dialog";
import { ProgressIndicatorComponent } from "../shared/progress-indicator/progress-indicator.component";
import { map, tap } from "rxjs/operators";
import { Location } from "@angular/common";

@Component({
  standalone: true,
  templateUrl: "./my-content.component.html",
  styleUrls: ["./my-content.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatBadgeModule,
    MatTooltipModule,
    ProgressIndicatorComponent
  ]
})
export class MyContentComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  private teamId: string;
  private industryId: string;
  private topicId: string;
  private backToHome: number;
  public myContent: Observable<MyContent[]>;
  public title: string;
  public searchParams: SearchParams;
  public isSearch: boolean;
  public noResults: boolean;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private service: TrainingService,
    private accountService: AccountService,
    private dialog: MatDialog,
    private _location: Location
  ) {}

  ngOnInit() {
    this.searchParams = new SearchParams();
    this.subscription = this.accountService.teamManagersObservable.subscribe(
      team => {
        if (team) {
          this.route.queryParamMap.subscribe(qpm => {
            this.searchParams.complianceType =
              qpm.get("complianceType") || "all";
            const employees = JSON.parse(qpm.get("srt")) || [];
            this.searchParams.employees = employees.map(id =>
              this.accountService.teamManagers.find(u => u.id == id)
            );
            /* dumb hack to send user back to home page if that's where they came from, so far
            that's the only place you can set the employees query param */
            this.backToHome = this.searchParams.employees.length;
            this.teamId = this.accountService.aTeam.id;
            this.title = "MyContent";
            this.getMyContent();
          });
        }
      }
    );
  }

  public routeTo(articleId): void {
    this.router.navigate([articleId], { relativeTo: this.route });
  }

  public favorite(myContent: MyContent): void {
    
  }

  public openFiltersDialog(): void {
    this.dialog
      .open(SearchDialog, {
        data: { searchParams: this.searchParams }
      })
      .afterClosed()
      .subscribe((params: SearchParams) => {
        if (params) {
          this.searchParams = params;
          this.getMyContent();
        }
      });
  }

  private getMyContent(): void {
    let params = this.searchParams;
    if (
      params.employees.length ||
      params.string ||
      params.complianceType != "all"
    ) {
      this.isSearch = true;
      this.myContent = this.service.getMyContent(this.teamId).pipe(
        map((mc: MyContent[]) =>
          mc.filter(c => {
            let passed;
            if (params.employees.length) {
              for (let e of params.employees) {
                if (e.id in c.shouldReceiveTraining) {
                  passed = true;
                  break;
                }
              }
            }
            if (params.string) {
              let filter: string[] = params.string.trim().split(/\s+/);
              for (let f of filter) {
                if (
                  c.articleName &&
                  c.articleName.toLowerCase().includes(f.toLowerCase())
                )
                  passed = true;
                else passed = false;
              }
            }
            if (params.complianceType != "all") {
              const inCompliance = params.complianceType == "inCompliance";
              passed =
                (c.complianceLevel >= 100 && inCompliance) ||
                (c.complianceLevel < 100 && !inCompliance);
            }
            return passed;
          })
        ),
        tap(mc => (this.noResults = mc.length ? false : true))
      );
    } else {
      this.isSearch = false;
      this.myContent = this.service
        .getMyContent(this.teamId)
        .pipe(tap(mc => (this.noResults = mc.length ? false : true)));
    }
  }

  public createArticle(): void {
    let queryParams = { industryId: this.industryId, topicId: this.topicId };
    this.router.navigate(["account/training/create-article"], { queryParams });
  }

  public goBack(): void {
    if (this.backToHome) this._location.back();
    else {
      const activeRoute: string = this.router.url;
      const backRoute = activeRoute.substr(0, activeRoute.lastIndexOf("/"));
      this.router.navigate([backRoute]);
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
