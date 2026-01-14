import { Component, OnInit, inject, DestroyRef } from "@angular/core";
import { CommonModule, DatePipe, Location } from "@angular/common";
import { Router, ActivatedRoute, RouterModule } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { MyContent, Topic, UserService } from "../user.service";
import { LibraryItem } from "src/app/account/training/training.service";

interface LibraryItemWithSurvey extends LibraryItem {
  latestSurvey?: any;
}

@Component({
  standalone: true,
  selector: "app-articles",
  templateUrl: "./articles.component.html",
  styleUrls: ["./articles.component.scss"],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule
  ],
  providers: [DatePipe]
})
export class ArticlesComponent implements OnInit {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);

  teamId: string;
  topicId: string;
  topic: Topic;
  library: LibraryItemWithSurvey[] = [];
  error: string;

  ngOnInit() {
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team && team.id) {
          this.teamId = team.id;
          this.userService.getMyContent(team.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((data: LibraryItemWithSurvey[]) => {
              data.forEach(li => {
                this.userService.getLatestSurvey(li.id)
                  .pipe(takeUntilDestroyed(this.destroyRef))
                  .subscribe(s => {
                    li.latestSurvey = s[0];
                  });
              });
              this.library = data;
            });
        }
      });
  }

  public routeTo(article: LibraryItemWithSurvey): void {
    this.router.navigate([
      "user/article",
      article.id
    ], { queryParamsHandling: "preserve" });
  }

  public goBack(): void {
    this.location.back();
  }
}
