import { Component, OnInit, inject, DestroyRef } from "@angular/core";
import { CommonModule, DatePipe, Location } from "@angular/common";
import { Router, ActivatedRoute, RouterModule } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MyContent, Topic, UserService } from "../user.service";
import { LibraryItem, TrainingCadence } from "src/app/account/training/training.service";

type TrainingStatus = 'overdue' | 'dueSoon' | 'current' | 'neverTrained';

interface LibraryItemWithStatus extends LibraryItem {
  latestSurvey?: any;
  nextDueDate?: Date;
  status?: TrainingStatus;
  daysUntilDue?: number;
}

@Component({
  standalone: true,
  selector: "app-articles",
  templateUrl: "./articles.component.html",
  styleUrls: ["./articles.component.scss"],
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule
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
  library: LibraryItemWithStatus[] = [];
  error: string;

  ngOnInit() {
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team && team.id) {
          this.teamId = team.id;
          this.userService.getMyContent(team.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((data: LibraryItemWithStatus[]) => {
              data.forEach(li => {
                this.enrichWithStatus(li);
                this.userService.getLatestSurvey(li.id)
                  .pipe(takeUntilDestroyed(this.destroyRef))
                  .subscribe(s => {
                    li.latestSurvey = s[0];
                  });
              });
              // Sort by status priority: overdue > dueSoon > neverTrained > current
              this.library = data.sort((a, b) => this.sortByStatus(a, b));
            });
        }
      });
  }

  private enrichWithStatus(item: LibraryItemWithStatus): void {
    const cadence = item.trainingCadence || TrainingCadence.Annually;
    
    // For "Once" trainings that have been completed, no next due
    if (cadence === TrainingCadence.Once && item.lastTrainedAt) {
      item.status = 'current';
      item.nextDueDate = undefined;
      return;
    }

    // Calculate next due date
    const nextDue = this.calculateNextDueDate(item.lastTrainedAt, cadence, item.scheduledDueDate);
    item.nextDueDate = nextDue;

    if (!nextDue) {
      item.status = 'current';
      return;
    }

    const now = new Date();
    const diffTime = nextDue.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    item.daysUntilDue = diffDays;

    if (diffDays < 0) {
      item.status = 'overdue';
    } else if (diffDays <= 14) {
      item.status = 'dueSoon';
    } else if (!item.lastTrainedAt) {
      item.status = 'neverTrained';
    } else {
      item.status = 'current';
    }
  }

  private calculateNextDueDate(lastTrainedAt: any, cadence: TrainingCadence, scheduledDueDate?: any): Date | undefined {
    if (cadence === TrainingCadence.Once) {
      if (lastTrainedAt) return undefined;
      if (scheduledDueDate) {
        return scheduledDueDate?.toDate ? scheduledDueDate.toDate() : new Date(scheduledDueDate);
      }
      return new Date();
    }

    if (lastTrainedAt) {
      const lastTrained = lastTrainedAt?.toDate ? lastTrainedAt.toDate() : new Date(lastTrainedAt);
      return this.addCadenceInterval(lastTrained, cadence);
    }

    if (scheduledDueDate) {
      return scheduledDueDate?.toDate ? scheduledDueDate.toDate() : new Date(scheduledDueDate);
    }

    return new Date();
  }

  private addCadenceInterval(date: Date, cadence: TrainingCadence): Date {
    const result = new Date(date);
    switch (cadence) {
      case TrainingCadence.Monthly:
        result.setMonth(result.getMonth() + 1);
        break;
      case TrainingCadence.Quarterly:
        result.setMonth(result.getMonth() + 3);
        break;
      case TrainingCadence.SemiAnnually:
        result.setMonth(result.getMonth() + 6);
        break;
      case TrainingCadence.Annually:
      default:
        result.setFullYear(result.getFullYear() + 1);
        break;
    }
    return result;
  }

  private sortByStatus(a: LibraryItemWithStatus, b: LibraryItemWithStatus): number {
    const statusOrder: Record<TrainingStatus, number> = {
      'overdue': 0,
      'dueSoon': 1,
      'neverTrained': 2,
      'current': 3
    };

    const aOrder = statusOrder[a.status || 'current'];
    const bOrder = statusOrder[b.status || 'current'];

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    // Within same status, sort by next due date
    if (a.nextDueDate && b.nextDueDate) {
      return a.nextDueDate.getTime() - b.nextDueDate.getTime();
    }
    if (a.nextDueDate) return -1;
    if (b.nextDueDate) return 1;

    // Fall back to name
    return a.name.localeCompare(b.name);
  }

  public routeTo(article: LibraryItemWithStatus): void {
    this.router.navigate([
      "user/article",
      article.id
    ], { queryParamsHandling: "preserve" });
  }

  public goBack(): void {
    this.location.back();
  }
}
