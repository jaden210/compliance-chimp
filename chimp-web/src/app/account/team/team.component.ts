import { Component, Inject, ViewChild, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { AccountService, User, InviteToTeam, TeamMember, Team } from "../account.service";
import moment from "moment";
import {
  MatDialog,
  MatDialogRef,
  MatDialogModule,
  MAT_DIALOG_DATA
} from "@angular/material/dialog";
import { MatTableModule, MatTable } from "@angular/material/table";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatMenuModule } from "@angular/material/menu";
import { MapDialogComponent } from "../map-dialog/map-dialog.component";
import { Observable, Subscription, forkJoin, combineLatest } from "rxjs";
import { TeamService } from "./team.service";
import { SelfInspection } from "../self-inspections/self-inspections.service";
import { TrainingService, MyContent } from "../training/training.service";
import { Router } from "@angular/router";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Firestore, addDoc, collection, collectionData, deleteDoc, doc, updateDoc } from "@angular/fire/firestore";
import { Storage, ref, uploadBytes, getDownloadURL } from "@angular/fire/storage";
import { map } from "rxjs/operators";
import { MatProgressBarModule } from "@angular/material/progress-bar";
declare var gtag: Function;

@Component({
  standalone: true,
  selector: "app-team",
  templateUrl: "./team.component.html",
  styleUrls: ["./team.component.scss"],
  providers: [TrainingService],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatTableModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatMenuModule
  ]
})
export class TeamComponent implements OnDestroy {
  private subscription: Subscription;
  files: Observable<any>;
  teamMembers:TeamMember[] = [];
  managers: User[] = [];
  @ViewChild(MatTable) table: MatTable<any>;
  displayedColumns: string[] = [
    "name",
    "compliance",
    "page",
    "invites",
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
    private teamService: TeamService,
    private router: Router,
    private functions: Functions
  ) {
    this.accountService.helper = this.accountService.helperProfiles.team;
    this.accountService.showLD = true;
    this.subscription = this.accountService.teamMembersObservable.subscribe(teamMembers => {
        if (teamMembers) {
          teamMembers.forEach(tm => {
            this.teamService.getSurveysByTeamMember(tm.id).subscribe(([surveys, surveyResponses]) => {
              tm['surveyCount'] = `${surveyResponses.length || 0} | ${surveys.length || 0}`;
              tm['surveys'] = surveys.map(s => {
                s.response = surveyResponses.find(sr => sr.surveyId == s.id);
                return s;
              });
            });
          });
          this.files = this.teamService.getFiles();
          this.teamMembers = teamMembers;
          this.showTable = true;
        }
      }
    );
    this.accountService.teamManagersObservable.subscribe(managers => this.managers = managers);
  }

  public routeToUserPage(userId: string) {
    this.router.navigate([`/user`], {
      queryParams: { "member-id": userId }
    });
  }

  inviteMember() {
    let dialog = this.dialog.open(InviteDialog, {
      data:  new TeamMember(),
      disableClose: true
    });
    dialog.afterClosed().subscribe((invite: TeamMember) => {
      if (invite) {
        invite.email = invite.email ? invite.email.toLowerCase() : null;
        invite.phone = invite.phone ? invite.phone.split(/\D+/g).join("") : null;
        invite.teamId = this.accountService.aTeam.id;
        invite.createdAt = new Date();
        addDoc(collection(this.accountService.db, "team-members"), { ...invite });
      }
    });
  }

  public resendInvite(teamMember: TeamMember): void {
    teamMember['sending'] = true;
    const sendInvite = httpsCallable(this.functions, "resendTeamMemberInvite");
    sendInvite({ teamMember: teamMember, team: this.accountService.aTeam}).then(() => {
      delete teamMember['sending'];
    });
  }

  public manageManagers(): void {
    this.dialog.open(ManagersDialog);
  }

  openTeamFilesDialog() {
    this.dialog.open(TeamFilesDialog);
  }

  public openUserSurveyDialog(user: TeamMember): void {
    this.dialog.open(SurveysDialog, {
      data: user
    })
  }

  public saveTeamMember(teamMember) {
    updateDoc(doc(this.accountService.db, `team-members/${teamMember.id}`), { ...teamMember });
  }
  
  editTeamMember(teamMember: TeamMember) {
    let dialog = this.dialog.open(EditUserDialog, {
      data: teamMember,
      disableClose: true
    });
    dialog.afterClosed().subscribe((data: TeamMember) => {
      if (data) {
        if (data['removeFromTeam']) {
          this.teamService.removeUser(data).then(() => {
            this.accountService.checkStripePlan(); // will alter the team payment plan
          });
        } else {
          updateDoc(doc(this.accountService.db, `team-members/${data.id}`), { ...data });
        }
      }
    });
  }


  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}

@Component({
  standalone: true,
  selector: "invite-dialog",
  templateUrl: "invite-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule
  ]
})
export class InviteDialog {
  public phoneError: boolean = false;
  constructor(
    public dialogRef: MatDialogRef<InviteDialog>,
    private teamService: TeamService,
    @Inject(MAT_DIALOG_DATA) public invite: any
  ) {}

  public formatPhone(): void {
    let numbers = this.invite.phone;
    const cleaned = ('' + numbers).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      this.invite.phone = '(' + match[1] + ') ' + match[2] + '-' + match[3],
      this.phoneError = false;
    } else {
      this.phoneError = true;
    }
    return null;
  }


  close(): void {
    this.dialogRef.close();
  }
}

@Component({
  standalone: true,
  selector: "surveys-dialog",
  templateUrl: "surveys-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ]
})
export class SurveysDialog {
  constructor(
    public dialogRef: MatDialogRef<SurveysDialog>,
    public accountService: AccountService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    console.log(this.data);
    
  }

  close(): void {
    this.dialogRef.close();
  }
}

@Component({
  standalone: true,
  selector: "edit-user-dialog",
  templateUrl: "user-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatCheckboxModule
  ]
})
export class EditUserDialog {
  constructor(
    public dialogRef: MatDialogRef<EditUserDialog>,
    public accountService: AccountService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.data.removeFromTeam = false;
  }

  close(): void {
    this.dialogRef.close();
  }
}


@Component({
  standalone: true,
  selector: "managers-dialog",
  templateUrl: "managers-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule
  ]
})
export class ManagersDialog {
  public newManager: User = null;
  public phoneError: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<EditUserDialog>,
    public accountService: AccountService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {

  }

  public get Managers(): User[] {
    return this.accountService.teamManagers;
  }

  public isYou(id): boolean {
    return this.accountService.user.id == id;
  }

  public isOwner(id): boolean {
    return this.accountService.aTeam.ownerId == id;
  }

  public startManager(): void {
    this.newManager = new User();
  }

  public createManager(): void {
    this.accountService.createUser(this.newManager).then(() => {
      this.newManager = null;
    });
  }

  public removeManager(user: User): void {
    user.disabledBy = this.accountService.user.id;
    this.accountService.updateUser(user).then(() => {
      
    });
  }

  public formatPhone(): void {
    let numbers = this.newManager.phone;
    const cleaned = ('' + numbers).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      this.newManager.phone = '(' + match[1] + ') ' + match[2] + '-' + match[3],
      this.phoneError = false;
    } else {
      this.phoneError = true;
    }
    return null;
  }


  close(): void {
    this.dialogRef.close();
  }
}

@Component({
  standalone: true,
  selector: "team-files-dialog",
  templateUrl: "team-files-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule
  ]
})
export class TeamFilesDialog {
  files: File[];
  aFile: File = new File();
  loading: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<TeamFilesDialog>,
    public accountService: AccountService,
    private storage: Storage,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    collectionData(collection(this.accountService.db, `team/${this.accountService.aTeam.id}/file`), { idField: "id" })
      .pipe(
        map((actions: any[]) =>
          actions.map((data) => ({
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
          }))
        )
      )
      .subscribe(files => {
        this.files = files as File[];
        if (files.length) this.aFile = files[0];
      });
  }

  upload(): void {
    document.getElementById("upFile").click();
  }

  uploadFile(event) {
    this.loading = true;
    const uFile = event.target.files[0];
    if (!uFile) {
      this.loading = false;
      return;
    }
    const filePath = `${this.accountService.aTeam.id}/files/${new Date()}`;
    const storageRef = ref(this.storage, filePath);
    uploadBytes(storageRef, uFile)
      .then(() => getDownloadURL(storageRef))
      .then((url) => {
        let file = new File();
        file.createdAt = new Date();
        file.uploadedBy = this.accountService.user.id;
        file.fileUrl = url;
        file.name = uFile.name;
        file.type = uFile.type;
        return addDoc(collection(this.accountService.db, `team/${this.accountService.aTeam.id}/file`), { ...file })
          .then(snapshot => {
            this.loading = false;
            file.id = snapshot.id;
            this.aFile = file;
          });
      })
      .catch(() => {
        this.loading = false;
      });
  }

  save() {
    updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}/file/${this.aFile.id}`), { ...this.aFile });
  }

  delete() {
    const index = this.files.indexOf(this.aFile);
    deleteDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}/file/${this.aFile.id}`))
      .then(() => (this.aFile = this.files[index - 1 < 0 ? 0 : index - 1]));
  }

  download() {
    const xhr = new XMLHttpRequest();
    xhr.responseType = "blob";
    xhr.onload = event => {
      const blob = new Blob([xhr.response], { type: this.aFile.type });
      const a: any = document.createElement("a");
      a.style = "display: none";
      document.body.appendChild(a);
      const url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = this.aFile.name;
      a.click();
      window.URL.revokeObjectURL(url);
    };
    xhr.open("GET", this.aFile.fileUrl);
    xhr.send();
  }

  close(): void {
    this.dialogRef.close();
  }
}

export class File {
  id?: string;
  fileUrl: string;
  name: string;
  createdAt: any;
  uploadedBy: string;
  isPublic: boolean = false;
  type?: string;
}
