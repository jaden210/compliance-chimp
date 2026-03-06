import { Component, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { collection, collectionData, orderBy, query, where } from "@angular/fire/firestore";
import { Subscription } from "rxjs";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { AccountService } from "../../account.service";
import { exportOsha300LogPdf } from "../../../shared/osha-pdf";
import {
  IncidentReportLike,
  normalizeOshaCase,
  OshaCase,
  toDisplayDate
} from "../../../shared/osha-recordkeeping";

@Component({
  standalone: true,
  selector: "app-osha-300-log",
  templateUrl: "./osha-300-log.component.html",
  styleUrls: ["./osha-300-log.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressBarModule
  ]
})
export class Osha300LogComponent implements OnInit, OnDestroy {
  private subscription?: Subscription;
  loading = true;
  selectedYear = new Date().getFullYear();
  cases: Array<OshaCase & { reportId: string }> = [];
  pendingReviewCount = 0;

  constructor(
    public accountService: AccountService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.subscription = this.accountService.teamMembersObservable.subscribe(members => {
      if (!members || !this.accountService.aTeam?.id) return;
      const reportQuery = query(
        collection(this.accountService.db, "incident-report"),
        where("teamId", "==", this.accountService.aTeam.id),
        orderBy("createdAt", "desc")
      );

      collectionData(reportQuery, { idField: "id" }).subscribe(reports => {
        const normalized = (reports as IncidentReportLike[]).map(report => {
          const user = members.find(member => member.id === report.submittedBy);
          return {
            ...normalizeOshaCase(report, this.accountService.aTeam, user),
            reportId: report.id || ""
          };
        });
        this.cases = normalized;
        this.pendingReviewCount = normalized.filter(item => item.requiresReview).length;
        this.selectedYear = this.availableYears[0] || this.selectedYear;
        this.loading = false;
      });
    });
  }

  get availableYears(): number[] {
    return [...new Set(this.cases.map(item => item.calendarYear))].sort((a, b) => b - a);
  }

  get filteredCases(): Array<OshaCase & { reportId: string }> {
    return this.cases.filter(item => item.calendarYear === this.selectedYear && item.isRecordable);
  }

  get totalDaysAway(): number {
    return this.filteredCases.reduce((total, item) => total + (item.daysAwayFromWork || 0), 0);
  }

  get totalRestrictedDays(): number {
    return this.filteredCases.reduce((total, item) => total + (item.daysJobTransferOrRestriction || 0), 0);
  }

  exportLog(): void {
    exportOsha300LogPdf(this.accountService.aTeam, this.selectedYear, this.filteredCases);
  }

  openReport(reportId: string): void {
    this.router.navigate(["../", reportId], { relativeTo: this.route });
  }

  displayDate(value?: string): string {
    return toDisplayDate(value);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
