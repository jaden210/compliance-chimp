import { Component, inject, DestroyRef } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SelfInspectionsService, SelfInspection } from "../self-inspections.service";
import { UserService } from "../../user.service";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";

interface SelfInspectionWithDue extends SelfInspection {
  nextDueDate?: Date;
  isOverdue?: boolean;
  daysUntilDue?: number;
}

@Component({
  standalone: true,
  selector: "app-self-inspection",
  templateUrl: "./self-inspections-list.component.html",
  styleUrls: ["./self-inspections-list.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  providers: [DatePipe]
})
export class SelfInspectionsListComponent {
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);
  private readonly selfInspectionsService = inject(SelfInspectionsService);
  readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);

  selfInspections: SelfInspectionWithDue[];

  constructor() {
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team) {
          this.selfInspectionsService.getSelfInspections(team.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((si) => {
              // Calculate next due dates and sort
              this.selfInspections = si
                .map(inspection => this.enrichWithDueDate(inspection))
                .sort((a, b) => this.sortByDueDate(a, b));
            });
        }
      });
  }

  private enrichWithDueDate(inspection: SelfInspection): SelfInspectionWithDue {
    const result: SelfInspectionWithDue = { ...inspection };
    const frequency = inspection.inspectionExpiration;
    
    // If manual or no frequency, no next due date
    if (!frequency || frequency === 'Manual') {
      result.nextDueDate = undefined;
      return result;
    }

    // Get last completed date
    const lastCompletedAt = inspection.lastCompletedAt;
    if (!lastCompletedAt) {
      // Never completed - due now
      result.nextDueDate = new Date();
      result.isOverdue = true;
      result.daysUntilDue = 0;
      return result;
    }

    const lastDate = lastCompletedAt?.toDate ? lastCompletedAt.toDate() : new Date(lastCompletedAt);
    const nextDue = this.calculateNextDueDate(lastDate, frequency);
    const now = new Date();
    const diffTime = nextDue.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    result.nextDueDate = nextDue;
    result.isOverdue = diffDays < 0;
    result.daysUntilDue = diffDays;

    return result;
  }

  private calculateNextDueDate(lastCompleted: Date, frequency: string): Date {
    const nextDue = new Date(lastCompleted);

    switch (frequency) {
      case 'Monthly':
        nextDue.setMonth(nextDue.getMonth() + 1);
        break;
      case 'Quarterly':
        nextDue.setMonth(nextDue.getMonth() + 3);
        break;
      case 'Semi-Anually':
        nextDue.setMonth(nextDue.getMonth() + 6);
        break;
      case 'Anually':
      default:
        nextDue.setFullYear(nextDue.getFullYear() + 1);
        break;
    }

    return nextDue;
  }

  private sortByDueDate(a: SelfInspectionWithDue, b: SelfInspectionWithDue): number {
    // Overdue items first
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;

    // Then by next due date (soonest first)
    if (a.nextDueDate && b.nextDueDate) {
      return a.nextDueDate.getTime() - b.nextDueDate.getTime();
    }

    // Items with due dates before items without
    if (a.nextDueDate && !b.nextDueDate) return -1;
    if (!a.nextDueDate && b.nextDueDate) return 1;

    // Fall back to alphabetical
    return a.title.localeCompare(b.title);
  }

  selectSelfInspection(inspection: SelfInspection) {
    this.router.navigate([inspection.id], { relativeTo: this.route });
  }

  startNewSelfInspection() {
    this.router.navigate(['new'], { relativeTo: this.route });
  }

  startInspection(inspection: SelfInspection) {
    this.selfInspectionsService.startInspection(inspection).then(newInspection => {
      this.router.navigate([inspection.id, newInspection.id], { relativeTo: this.route });
    });
  }

  close() {
    this.router.navigate(['/user']);
  }
}
