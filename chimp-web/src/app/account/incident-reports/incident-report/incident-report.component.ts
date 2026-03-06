import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { AccountService } from "../../account.service";
import { Subscription, combineLatest, filter, take } from "rxjs";
import { doc, getDoc, deleteDoc, collection, collectionData, query, where, updateDoc } from "@angular/fire/firestore";
import {
  OshaCase,
  formatAddress,
  normalizeOshaCase,
  toDisplayDate
} from "../../../shared/osha-recordkeeping";
import { exportOsha301Pdf } from "../../../shared/osha-pdf";

@Component({
  standalone: true,
  selector: "app-incident-report",
  templateUrl: "./incident-report.component.html",
  styleUrls: ["./incident-report.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatProgressBarModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule
  ],
  providers: [DatePipe]
})
export class IncidentReportComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  report: any = null;
  loading = true;
  savingOsha = false;
  readonly recordableOptions = [
    { label: "Pending review", value: null },
    { label: "Recordable", value: true },
    { label: "Not recordable", value: false }
  ];
  readonly classificationOptions = [
    { label: "Pending review", value: "pending-review" },
    { label: "Death", value: "death" },
    { label: "Days away from work", value: "days-away" },
    { label: "Job transfer or restriction", value: "job-transfer-restriction" },
    { label: "Other recordable", value: "other-recordable" },
    { label: "Not recordable", value: "not-recordable" },
    { label: "Near miss", value: "near-miss" }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public accountService: AccountService,
    private snackbar: MatSnackBar
  ) {}

  ngOnInit() {
    this.subscription = this.route.params.subscribe(params => {
      const reportId = params['reportId'];
      if (reportId) {
        this.loadReport(reportId);
      }
    });
  }

  async loadReport(reportId: string) {
    this.loading = true;
    try {
      const reportDoc = await getDoc(doc(this.accountService.db, `incident-report/${reportId}`));
      if (reportDoc.exists()) {
        this.report = { id: reportDoc.id, ...reportDoc.data() };
        
        // Convert createdAt timestamp
        if (this.report.createdAt?.toDate) {
          this.report.createdAt = this.report.createdAt.toDate();
        }

        this.hydrateOshaCase();

        // Wait for team members to be loaded, then get user info
        if (this.report.submittedBy) {
          combineLatest([
            this.accountService.teamMembersObservable,
            this.accountService.aTeamObservable
          ]).pipe(
            filter(([members, team]) => !!members && members.length > 0 && !!team),
            take(1)
          ).subscribe(([members, team]) => {
            // Get user info
            this.report.user = members.find(
              (user: any) => user.id === this.report.submittedBy
            );
            this.hydrateOshaCase();

            // Get previous reports count
            const reportsQuery = query(
              collection(this.accountService.db, "incident-report"),
              where("teamId", "==", team.id),
              where("submittedBy", "==", this.report.submittedBy)
            );
            collectionData(reportsQuery, { idField: "id" }).pipe(take(1)).subscribe(allReports => {
              this.report.previousReports = allReports;
            });
          });
        }
      }
    } catch (error) {
      console.error('Error loading report:', error);
    }
    this.loading = false;
  }

  leave() {
    this.router.navigate(['../'], { relativeTo: this.route });
  }

  private hydrateOshaCase(): void {
    if (!this.report) return;
    this.report.oshaCase = normalizeOshaCase(
      this.report,
      this.accountService.aTeam,
      this.report.user
    );
  }

  get oshaCase(): OshaCase | null {
    return this.report?.oshaCase || null;
  }

  get recordableValue(): string {
    const value = this.report?.oshaCase?.isRecordable;
    if (value === true) return "true";
    if (value === false) return "false";
    return "pending";
  }

  set recordableValue(value: string) {
    if (!this.report?.oshaCase) return;
    if (value === "true") {
      this.report.oshaCase.isRecordable = true;
    } else if (value === "false") {
      this.report.oshaCase.isRecordable = false;
      this.report.oshaCase.classification = "not-recordable";
    } else {
      this.report.oshaCase.isRecordable = null;
      this.report.oshaCase.classification = "pending-review";
    }
  }

  get classificationLabel(): string {
    const value = this.report?.oshaCase?.classification;
    return this.classificationOptions.find(option => option.value === value)?.label || "Pending review";
  }

  async saveOshaReview(): Promise<void> {
    if (!this.report?.id || !this.report.oshaCase) return;
    this.savingOsha = true;
    this.report.oshaCase.calendarYear = new Date(
      this.report.oshaCase.incidentDate || this.report.createdAt || Date.now()
    ).getFullYear();
    this.report.oshaCase.establishment = this.report.oshaCase.establishment || {
      name: this.accountService.aTeam?.name || "",
      phone: this.accountService.aTeam?.phone || "",
      email: this.accountService.aTeam?.email || "",
      street: this.accountService.aTeam?.street || "",
      street2: this.accountService.aTeam?.street2 || "",
      city: this.accountService.aTeam?.city || "",
      state: this.accountService.aTeam?.state || "",
      zip: this.accountService.aTeam?.zip || ""
    };
    this.report.oshaCase.outcomeDescription =
      this.report.oshaCase.outcomeDescription ||
      this.classificationLabel;
    this.report.oshaCase.updatedAt = new Date().toISOString();

    try {
      await updateDoc(doc(this.accountService.db, `incident-report/${this.report.id}`), {
        oshaCase: this.report.oshaCase
      });
      this.snackbar.open("OSHA review saved", undefined, { duration: 2500 });
    } catch (error) {
      console.error("Error saving OSHA review:", error);
      this.snackbar.open("Failed to save OSHA review", undefined, { duration: 4000 });
    } finally {
      this.savingOsha = false;
    }
  }

  delete() {
    if (this.report?.id) {
      const snackbarRef = this.snackbar.open("Deleting report...", "Undo", {
        duration: 6000
      });
      snackbarRef.afterDismissed().subscribe(action => {
        if (!action.dismissedByAction) {
          deleteDoc(doc(this.accountService.db, `incident-report/${this.report.id}`))
            .then(() => this.leave());
        }
      });
      snackbarRef.onAction().subscribe(() => {
        snackbarRef.dismiss();
      });
    }
  }

  async export() {
    if (!this.report) return;
    this.hydrateOshaCase();
    if (!this.report?.oshaCase) return;
    exportOsha301Pdf(this.report.oshaCase);
    this.snackbar.open("OSHA 301 equivalent PDF exported", undefined, { duration: 3000 });
  }

  displayDate(value?: string): string {
    return toDisplayDate(value);
  }

  displayAddress(value?: any): string {
    return formatAddress(value);
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }
}
