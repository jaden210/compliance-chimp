import { Component, Inject, ViewChild, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { AccountService, User, InviteToTeam, TeamMember } from "../account.service";
import { environment } from "src/environments/environment";
import { map, take } from "rxjs/operators";

import {
  MatDialog,
  MatDialogRef,
  MatDialogModule,
  MAT_DIALOG_DATA
} from "@angular/material/dialog";
import { MatTableModule, MatTable } from "@angular/material/table";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatIconModule } from "@angular/material/icon";
import { MapDialogComponent } from "../map-dialog/map-dialog.component";
import { Observable, Subscription, forkJoin } from "rxjs";
import { HomeService } from "./home.service";
import { SelfInspection } from "../self-inspections/self-inspections.service";
import { TrainingService, MyContent } from "../training/training.service";
import { Router } from "@angular/router";
import { WelcomeService } from "../welcome.service";
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from "ng2-charts";
import { ChartConfiguration } from "chart.js";
import { ContactInfoBannerComponent } from "../contact-info-banner/contact-info-banner.component";
declare var gtag: Function;

@Component({
  standalone: true,
  selector: "app-home",
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.css"],
  providers: [TrainingService, provideCharts(withDefaultRegisterables())],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatDialogModule,
    MatButtonModule,
    BaseChartDirective,
    ContactInfoBannerComponent
  ]
})
export class HomeComponent implements OnDestroy {
  private subscription: Subscription;
  invitedUsers: InviteToTeam[];
  files: Observable<any>;
  users:TeamMember[] = [];
  @ViewChild(MatTable) table: MatTable<any>;
  displayedColumns: string[] = [
    "name",
    "training",
    "page"
  ];
  public helper: any;
  public trainingComplete: number = 0;
  public totalTrainingAssignments: number = 0;
  public compliantTrainingAssignments: number = 0;
  public needsTraining: string[] = [];
  public trainingsGiven: number = 0;

  selfInspection: { overdue: number; dueSoon: number; onTrack: number; neverRun: number; total: number } = 
    { overdue: 0, dueSoon: 0, onTrack: 0, neverRun: 0, total: 0 };
  trainingHealth: { compliant: number; inProgress: number; notStarted: number; total: number } =
    { compliant: 0, inProgress: 0, notStarted: 0, total: 0 };
  incidentReportsCount: number = 0;
  surveyResponsesCount: number = 0;
  surveysGivenCount: number = 0;
  teamFilesCount: number = 0;
  showTable: boolean = false;

  // Content states
  hasTeamMembers: boolean = false;
  hasTrainingContent: boolean = false;
  hasSelfInspections: boolean = false;
  selfInspectionCount: number = 0;
  trainingContentCount: number = 0;
  dataLoaded: boolean = false;

  // Activity chart
  hasEvents: boolean = false;
  totalEventsCount: number = 0;
  activityChartConfig: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(5, 77, 138, 0.9)',
          titleFont: { size: 13, weight: 'normal' },
          bodyFont: { size: 13, weight: 'bold' },
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (item) => {
              const val = item.raw as number;
              return val === 1 ? '1 event' : `${val} events`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.06)'
          },
          ticks: {
            font: { size: 11 },
            stepSize: 1,
            precision: 0
          },
          border: { display: false }
        }
      }
    }
  };

  constructor(
    public accountService: AccountService,
    public dialog: MatDialog,
    private homeService: HomeService,
    private trainingService: TrainingService,
    private router: Router,
    public welcomeService: WelcomeService
  ) {
    this.accountService.helper = this.accountService.helperProfiles.team;
    this.subscription = this.accountService.teamMembersObservable.subscribe(
      TeamMember => {
        if (TeamMember) {
          if (TeamMember.length == 0) this.accountService.showHelper = true;
          this.hasTeamMembers = TeamMember.length > 0;
          this.getSelfInspectionStats();
          this.getIncidentReportsCount();
          this.getSurveyStats();
          this.getTeamFilesCount();
          this.getActivityChart();
          this.files = this.homeService.getFiles();
          this.buildUsers();
        }
      }
    );
  }

  public get Users(): TeamMember[] {
    return this.accountService.teamMembers;
  }

  public get hasActiveSubscription(): boolean {
    return !!this.accountService.aTeam?.stripeSubscriptionId;
  }

  public startCheckout(): void {
    const email = this.accountService.user?.email || this.accountService.aTeam?.email;
    let paymentUrl = `${environment.stripe.paymentLink}?client_reference_id=${this.accountService.aTeam.id}`;
    if (email) {
      paymentUrl += `&prefilled_email=${encodeURIComponent(email)}`;
    }
    window.location.href = paymentUrl;
  }

  private buildUsers(): void {
    const teamId = this.accountService.aTeam.id;
    
    // Check both training-content and library collections
    forkJoin({
      myContent: this.trainingService.getMyContent(teamId),
      library: this.trainingService.getLibrary(teamId).pipe(take(1))
    }).subscribe(({ myContent, library }) => {
      this.users = [];
      // Has training content if either training-content or library has items
      this.hasTrainingContent = (myContent && myContent.length > 0) || (library && library.length > 0);
      this.trainingContentCount = (myContent?.length || 0) + (library?.length || 0);
      this.setMetrics(myContent);
      this.setTrainingHealth(myContent, library || []);
      this.accountService.teamMembers.forEach((tm: any) => {
        const srt = myContent.filter(mc =>
          Object.keys(mc.shouldReceiveTraining).includes(tm.id)
        );
        const nt = srt.filter(mc => mc.needsTraining.includes(tm.id));
        this.users.push({ ...tm, srt, nt, status });
      });
      this.showTable = true;
      this.dataLoaded = true;
    });
  }

  private setMetrics(myContent: MyContent[]): void {
    let totalTrainings = 0;
    let compliantTrainings = 0;
    let needsTraining = {};
    let trainingsGiven = 0;

    myContent.forEach(mc => {
      const srt = Object.keys(mc.shouldReceiveTraining).length;
      const nt = mc.needsTraining.length;
      totalTrainings += srt;
      compliantTrainings += srt - nt;
      mc.needsTraining.forEach(id => {
        needsTraining[id] = 1;
      });
      if (nt < srt) trainingsGiven += 1;
    });
    this.trainingsGiven = trainingsGiven;
    this.needsTraining = Object.keys(needsTraining);
    this.totalTrainingAssignments = totalTrainings;
    this.compliantTrainingAssignments = compliantTrainings;
    this.trainingComplete = totalTrainings > 0
      ? Math.ceil((compliantTrainings / totalTrainings) * 100)
      : 0;
  }

  private setTrainingHealth(myContent: MyContent[], library: any[]): void {
    this.trainingHealth = { compliant: 0, inProgress: 0, notStarted: 0, total: 0 };

    // Process myContent items
    myContent.forEach(mc => {
      this.trainingHealth.total++;
      const srt = Object.keys(mc.shouldReceiveTraining).length;
      const nt = mc.needsTraining?.length || 0;

      if (srt === 0) {
        this.trainingHealth.notStarted++;
      } else if (nt === 0) {
        this.trainingHealth.compliant++;
      } else if (nt < srt) {
        this.trainingHealth.inProgress++;
      } else {
        this.trainingHealth.notStarted++;
      }
    });

    // Process library items
    library.forEach((item: any) => {
      this.trainingHealth.total++;
      const srt = item.shouldReceiveTraining ? Object.keys(item.shouldReceiveTraining).length : 0;

      if (srt === 0) {
        this.trainingHealth.notStarted++;
        return;
      }

      // Count how many still need training (value is null = never trained)
      const entries = Object.values(item.shouldReceiveTraining) as any[];
      const needsCount = entries.filter(v => v === null || v === undefined).length;

      if (needsCount === 0) {
        this.trainingHealth.compliant++;
      } else if (needsCount < srt) {
        this.trainingHealth.inProgress++;
      } else {
        this.trainingHealth.notStarted++;
      }
    });
  }

  public routeToIndividualCompliance(userId: string) {
    const srt = JSON.stringify([userId]);
    this.router.navigate(["account/training/my-content"], {
      queryParams: { srt }
    });
  }

  public routeToUserPage(userId: string) {
    const srt = JSON.stringify([userId]);
    this.router.navigate([`/user`], {
      queryParams: { userId, teamId: this.accountService.aTeam.id }
    });
  }

  public routeToTrainingDashboard(): void {
    this.router.navigate(["account", "training", "dashboard"]);
  }

  public showMap(location: { lat: number; long: number }): void {
    this.dialog.open(MapDialogComponent, {
      data: {
        longPos: location.long,
        latPos: location.lat
      }
    });
  }

  public openTeamFilesDialog(): void {
    this.router.navigate(['/account/files']);
  }


  getSelfInspectionStats(): void {
    this.homeService.getSelfInspections().subscribe(selfInspections => {
      // Reset all counts on each emission so they don't accumulate
      this.selfInspection = { overdue: 0, dueSoon: 0, onTrack: 0, neverRun: 0, total: 0 };
      this.hasSelfInspections = selfInspections && selfInspections.length > 0;
      this.selfInspectionCount = selfInspections?.length || 0;
      this.selfInspection.total = selfInspections?.length || 0;

      selfInspections.forEach((inspection: SelfInspection) => {
        const status = this.getInspectionStatus(inspection);
        switch (status) {
          case 'overdue': this.selfInspection.overdue++; break;
          case 'dueSoon': this.selfInspection.dueSoon++; break;
          case 'neverRun': this.selfInspection.neverRun++; break;
          default: this.selfInspection.onTrack++; break;
        }
      });
    });
  }

  private getInspectionStatus(inspection: SelfInspection): 'overdue' | 'dueSoon' | 'ok' | 'neverRun' {
    // Check for manually set nextDueDate first
    const manualNextDueDate = (inspection as any).nextDueDate;
    if (manualNextDueDate) {
      const nextDue = manualNextDueDate?.toDate ? manualNextDueDate.toDate() : new Date(manualNextDueDate);
      const diffDays = Math.ceil((nextDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return 'overdue';
      if (diffDays <= 14) return 'dueSoon';
      return 'ok';
    }

    // No lastCompletedAt or Manual frequency = never run or ok
    if (!inspection.lastCompletedAt || !inspection.inspectionExpiration || inspection.inspectionExpiration === 'Manual') {
      return inspection.lastCompletedAt ? 'ok' : 'neverRun';
    }

    // Calculate next due date from last completion + frequency
    const lastCompleted = inspection.lastCompletedAt?.toDate
      ? inspection.lastCompletedAt.toDate()
      : new Date(inspection.lastCompletedAt);
    const nextDue = this.calculateNextDueDate(lastCompleted, inspection.inspectionExpiration);
    const diffDays = Math.ceil((nextDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'overdue';
    if (diffDays <= 14) return 'dueSoon';
    return 'ok';
  }

  private calculateNextDueDate(lastCompleted: Date, frequency: string): Date {
    const nextDue = new Date(lastCompleted);
    switch (frequency) {
      case 'Monthly': nextDue.setMonth(nextDue.getMonth() + 1); break;
      case 'Quarterly': nextDue.setMonth(nextDue.getMonth() + 3); break;
      case 'Semi-Anually': nextDue.setMonth(nextDue.getMonth() + 6); break;
      case 'Anually':
      default: nextDue.setFullYear(nextDue.getFullYear() + 1); break;
    }
    return nextDue;
  }

  getIncidentReportsCount(): void {
    this.homeService.getIncidentReports().subscribe(reports => {
      this.incidentReportsCount = reports?.length || 0;
    });
  }

  getSurveyStats(): void {
    this.homeService.getSurveys().subscribe(surveys => {
      this.surveysGivenCount = surveys?.length || 0;
    });
    this.homeService.getSurveyResponses().subscribe(responses => {
      this.surveyResponsesCount = responses?.length || 0;
    });
  }

  getTeamFilesCount(): void {
    this.homeService.getFiles().subscribe((files: any[]) => {
      this.teamFilesCount = files?.length || 0;
    });
  }

  getActivityChart(): void {
    this.homeService.getEvents(30).subscribe(events => {
      this.hasEvents = events && events.length > 0;
      this.totalEventsCount = events?.length || 0;

      if (!this.hasEvents) return;

      // Build a map of date → count for last 30 days
      const dayMap: { [key: string]: number } = {};
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dayMap[key] = 0;
      }

      events.forEach(event => {
        if (event.createdAt) {
          const date = event.createdAt instanceof Date
            ? event.createdAt
            : new Date(event.createdAt);
          const key = date.toISOString().split('T')[0];
          if (dayMap[key] !== undefined) {
            dayMap[key]++;
          }
        }
      });

      const sortedKeys = Object.keys(dayMap).sort();
      const labels = sortedKeys.map(key => {
        const d = new Date(key + 'T12:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      const data = sortedKeys.map(key => dayMap[key]);

      this.activityChartConfig.data = {
        labels,
        datasets: [{
          data,
          backgroundColor: 'rgba(5, 77, 138, 0.7)',
          hoverBackgroundColor: 'rgba(255, 145, 0, 0.85)',
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }]
      };
    });
  }

  // Tour methods
  startTour(): void {
    // This will be handled by the parent AccountComponent
    // We emit an event or use a shared service to trigger the chat
    // For now, we'll use a custom event that AccountComponent listens to
    const event = new CustomEvent('startTour', { bubbles: true });
    document.dispatchEvent(event);
  }

  dismissTour(): void {
    this.welcomeService.dismissTour();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
