import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { AccountService, TeamMember } from "../../account.service";
import { map } from "rxjs/operators";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { combineLatest, Subscription } from "rxjs";
import { Router, ActivatedRoute, RouterModule } from "@angular/router";
import { collection, collectionData, query, where, orderBy } from "@angular/fire/firestore";

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
    MatProgressBarModule
  ],
  providers: [DatePipe]
})
export class IncidentReportsListComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  incidentReports: any[] = [];
  loading = true;
  public loggedInTeamMember: TeamMember;

  constructor(
    public accountService: AccountService,
    private router: Router,
    private route: ActivatedRoute
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

  ngOnInit() {
    combineLatest([
      this.accountService.userObservable,
      this.accountService.teamMembersObservable
    ]).subscribe(([user, teamMembers]) => {
      if (user && teamMembers) this.loggedInTeamMember = teamMembers.find(tm => tm.phone == user.phone);
    });
  }

  public navMemberPage(): void {
    this.router.navigate([`/user`], {
      queryParams: { "member-id": this.loggedInTeamMember.id }
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
