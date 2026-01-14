import { Component, inject, DestroyRef } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SelfInspectionsService, SelfInspection } from "../self-inspections.service";
import { UserService } from "../../user.service";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";

@Component({
  standalone: true,
  selector: "app-self-inspection",
  templateUrl: "./self-inspections-list.component.html",
  styleUrls: ["./self-inspections-list.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
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

  selfInspections: SelfInspection[];

  constructor() {
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team) {
          this.selfInspectionsService.getSelfInspections(team.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((si) => {
              this.selfInspections = si.sort((a, b) => a.title.localeCompare(b.title));
            });
        }
      });
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
