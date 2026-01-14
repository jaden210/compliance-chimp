import { Component, Inject, ViewChild, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { AccountService, User, InviteToTeam, TeamMember } from "../account.service";
import { map } from "rxjs/operators";
import moment from "moment";
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
declare var gtag: Function;

@Component({
  standalone: true,
  selector: "app-home",
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.css"],
  providers: [TrainingService],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatDialogModule
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
  public trainingComplete: number;
  public needsTraining: string[];
  public trainingsGiven: number;

  selfInspection;
  achievements;
  completedCount: number;
  complianceLevel: number;
  showTable: boolean = false;

  constructor(
    public accountService: AccountService,
    public dialog: MatDialog,
    private homeService: HomeService,
    private trainingService: TrainingService,
    private router: Router
  ) {
    this.accountService.helper = this.accountService.helperProfiles.team;
    this.subscription = this.accountService.teamMembersObservable.subscribe(
      TeamMember => {
        if (TeamMember) {
          if (TeamMember.length == 0) this.accountService.showHelper = true;
          this.getSelfInspectionStats();
          this.files = this.homeService.getFiles();
          this.buildUsers();
        }
      }
    );
  }

  public get Users(): TeamMember[] {
    return this.accountService.teamMembers;
  }

  private buildUsers(): void {
    const teamId = this.accountService.aTeam.id;
    this.trainingService.getMyContent(teamId).subscribe(myContent => {
      this.users = [];
      this.setMetrics(myContent);
      this.accountService.teamMembers.forEach((tm: any) => {
        const srt = myContent.filter(mc =>
          Object.keys(mc.shouldReceiveTraining).includes(tm.id)
        );
        const nt = srt.filter(mc => mc.needsTraining.includes(tm.id));
        this.users.push({ ...tm, srt, nt, status });
      });
      this.showTable = true;
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
    this.trainingComplete = Math.ceil(
      (compliantTrainings / totalTrainings) * 100
    );
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
    this.selfInspection = { expired: 0, current: 0 };
    this.homeService.getSelfInspections().subscribe(selfInspections => {
      selfInspections.forEach((inspection: SelfInspection) => {
        if (inspection.inspectionExpiration && inspection.inspectionExpiration !== "Manual") {
          switch (inspection.inspectionExpiration) {
            case "Anually":
              this.setSelfInspectionCount(inspection, "years");
              return;
            case "Semi-Anually":
              this.setSelfInspectionCount(inspection, "months", 6);
              return;
            case "Quarterly":
              this.setSelfInspectionCount(inspection, "months", 3);
              return;
            case "Monthly":
              this.setSelfInspectionCount(inspection, "month");
              return;
          }
        } else this.selfInspection.current++;
      });
    });
  }

  setSelfInspectionCount(
    inspection: SelfInspection,
    unitOfTime,
    compare?
  ): void {
    if (
      moment(inspection.lastCompletedAt).diff(
        inspection.createdAt,
        unitOfTime
      ) > compare ||
      0
    ) {
      this.selfInspection.expired++;
    } else this.selfInspection.current++;
  }


  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
