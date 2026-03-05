import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { AccountService } from "../../account.service";
import { map } from "rxjs/operators";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatBottomSheet, MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { Subscription } from "rxjs";
import { Router, ActivatedRoute, RouterModule } from "@angular/router";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { collection, collectionData, query, where, orderBy } from "@angular/fire/firestore";
import { SendIncidentReportSheetComponent } from "./send-incident-report-sheet.component";

@Component({
  standalone: true,
  selector: "app-incident-reports-list",
  templateUrl: "./incident-reports-list.component.html",
  styleUrls: ["./incident-reports-list.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatBottomSheetModule,
    MatSnackBarModule
  ],
  providers: [DatePipe]
})
export class IncidentReportsListComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  incidentReports: any[] = [];
  loading = true;
  sending = false;

  constructor(
    public accountService: AccountService,
    private router: Router,
    private route: ActivatedRoute,
    private bottomSheet: MatBottomSheet,
    private snackbar: MatSnackBar,
    private functions: Functions
  ) {
    this.accountService.helper = this.accountService.helperProfiles.incidentReport;
    this.subscription = this.accountService.teamMembersObservable.subscribe(team => {
      if (team && this.accountService.aTeam?.id) {
        const reportCollection = collection(this.accountService.db, "incident-report");
        const reportQuery = query(
          reportCollection,
          where("teamId", "==", this.accountService.aTeam.id),
          orderBy("createdAt", "desc")
        );
        collectionData(reportQuery, { idField: "id" })
          .pipe(
            map((actions: any[]) =>
              actions.map((data) => ({
                ...data,
                createdAt: data["createdAt"]?.toDate ? data["createdAt"].toDate() : data["createdAt"]
              }))
            )
          )
          .subscribe((incidentReports) => {
            this.incidentReports = incidentReports;
            incidentReports.forEach(report => {
              report.user = this.accountService.teamMembers.find(
                user => user.id == report.submittedBy
              );
            });
            this.loading = false;
          });
      }
    });
  }

  ngOnInit() {}

  public openSendIncidentReport(): void {
    const sheetRef = this.bottomSheet.open(SendIncidentReportSheetComponent, {
      panelClass: 'incident-report-sheet'
    });

    sheetRef.afterDismissed().subscribe((result) => {
      if (!result?.sent || !result.recipients?.length) return;

      this.sending = true;
      const sendFn = httpsCallable(this.functions, 'sendIncidentReportNotification');
      sendFn({
        teamMembers: result.recipients,
        team: this.accountService.aTeam
      }).then(() => {
        this.sending = false;
        const count = result.recipients.length;
        const names = result.recipients.map((r: any) => r.name).join(', ');
        this.snackbar.open(
          `Incident report link sent to ${count === 1 ? names : `${count} team members`}`,
          null,
          { duration: 4000 }
        );
      }).catch((error) => {
        this.sending = false;
        console.error('Error sending incident report notification:', error);
        this.snackbar.open('Failed to send incident report link', null, { duration: 4000 });
      });
    });
  }

  selectReport(report: any) {
    this.router.navigate([report.id], { relativeTo: this.route });
  }

  getTypeBadgeClass(type: string): string {
    const lower = (type || '').toLowerCase();
    if (lower.includes('injury') || lower.includes('accident')) {
      return 'injury';
    } else if (lower.includes('near') || lower.includes('miss')) {
      return 'near-miss';
    } else if (lower.includes('property') || lower.includes('damage')) {
      return 'property';
    }
    return '';
  }

  trackByReportId(index: number, report: any) {
    return report.id || index;
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }
}
