import { Injectable, Component, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { BehaviorSubject } from "rxjs";
import { Firestore, collection, collectionData, doc, docData, query, where, updateDoc, setDoc, addDoc } from "@angular/fire/firestore";
import { map, debounceTime } from "rxjs/operators";
import {
  MatDialog,
  MatDialogRef,
  MatDialogModule,
  MAT_DIALOG_DATA,
} from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatTooltipModule } from "@angular/material/tooltip";
import {
  MatSidenav
} from "@angular/material/sidenav";
import {
  MatSnackBar,
  MatSnackBarRef,
} from "@angular/material/snack-bar";
import { Auth } from "@angular/fire/auth";
import { signOut } from "firebase/auth";
import { Router } from "@angular/router";
import moment from "moment";
import { HelperService, Helper } from "./helper.service";

@Injectable({
  providedIn: "root"
})
export class AccountService {
  private sidenav: MatSidenav;
  userObservable: BehaviorSubject<any> = new BehaviorSubject(null);
  user: User = new User();
  aTeamObservable: BehaviorSubject<any> = new BehaviorSubject(null);
  aTeam: Team = new Team();
  teamMembers: TeamMember[];
  teamMembersObservable: BehaviorSubject<any> = new BehaviorSubject(null);
  teamManagers: User[];
  teamManagersObservable: BehaviorSubject<any> = new BehaviorSubject(null);
  showHelper: boolean = false;
  showFeedback: boolean = false;
  searchForHelper: string; // template var to assist event system;
  public showLD: boolean = false;

  helperProfiles: any;
  helper: Helper;
  feedback: Helper;

  constructor(
    public db: Firestore,
    private auth: Auth,
    public dialog: MatDialog,
    public router: Router,
    public snackbar: MatSnackBar,
    private helperService: HelperService
  ) {
    this.helperProfiles = this.helperService.helperProfiles;
    this.feedback = this.helperProfiles.feedback;
  }

  buildTeam(teamId: string) {
    if (!this.user.teamId) {
      let dialog = this.dialog.open(NoAccessDialog, {
        disableClose: true
      });
      dialog.afterClosed().subscribe(() => {
        this.logout();
        return;
      });
      return;
    }
    
    const teamRef = doc(this.db, `team/${teamId}`);
    docData(teamRef, { idField: "id" }).subscribe((team: Team) => {
      if (team?.disabled) {
        this.showTeamDisabledDialog(team);
        return;
      } else if (team) {
        this.aTeamObservable.next(team);
        this.aTeam = team;
        this.checkFreeTrial(team);
      }
    });
    
    const usersCollection = collection(this.db, "user");
    const usersQuery = query(usersCollection, where("teamId", "==", teamId));
    collectionData(usersQuery, { idField: "id" }).subscribe((users: User[]) => {
      users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.teamManagers = users;
      this.teamManagersObservable.next(users);
    });
    
    const membersCollection = collection(this.db, "team-members");
    const membersQuery = query(membersCollection, where("teamId", "==", teamId));
    collectionData(membersQuery, { idField: "id" }).subscribe((teamMembers: TeamMember[]) => {
      teamMembers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.teamMembers = teamMembers;
      this.teamMembersObservable.next(teamMembers);
    });
  }

  showTeamDisabledDialog(team): void {
    let dialog = this.dialog.open(TeamDisabledDialog, {
      disableClose: true,
      data: {
        isOwner: this.user.id == team.ownerId ? true : false,
        disabledAt: team.disabledAt.toDate(),
      }
    });
    dialog.afterClosed().subscribe(data => {
      if (data.reEnable) {
        const teamRef = doc(this.db, `team/${team.id}`);
        updateDoc(teamRef, { disabled: false, disabledAt: null }).then(() => {
          window.location.reload(); // easiest way to get new data.
        });
      } else {
        this.logout();
      }
    });
  }

  public getShouldShowAgain(): boolean {
    return JSON.parse(localStorage.getItem('ccld')) || true;
  }

  public createUser(user: User): Promise<any> {
    user.teamId = this.aTeam.id;
    user.createdAt = new Date();
    return addDoc(collection(this.db, "user"), { ...user });
  }

  public updateUser(user: User): Promise<any> {
    return setDoc(doc(this.db, `user/${user.id}`), { ...user });
  }

  checkFreeTrial(team): void {
    // if (!team.cardToken) {
    //   this.trialDaysLeft =
    //     30 - moment().diff(this.aTeam.createdAt, "days") < 0
    //       ? 0
    //       : 30 - moment().diff(this.aTeam.createdAt, "days");
    //   let shouldOpen: boolean = false;
    //   if (this.trialDaysLeft == 28) shouldOpen = true;
    //   if (this.trialDaysLeft == 20) shouldOpen = true;
    //   if (this.trialDaysLeft == 10) shouldOpen = true;
    //   if (this.trialDaysLeft <= 5) shouldOpen = true;
    //   if (shouldOpen) {
    //     this.isTrialVersion = true;
    //     this.trialSnackbar = this.snackbar.open(
    //       `${this.trialDaysLeft} days left in your free trial`,
    //       "enter billing info",
    //       {
    //         horizontalPosition: "right"
    //       }
    //     );
    //     this.trialSnackbar.onAction().subscribe(() => {
    //       this.router.navigate(["account/account"]);
    //     });
    //   }
    // } else {
    //   this.isTrialVersion = false;
    //   this.closeSnackbar();
    // }
  }

  checkStripePlan() {
    this.teamMembersObservable.subscribe(async users => {
      if (users) {
        let plan;
        let q = 1;
        if (users.length <= 10) {
          plan = "small-teams";
        } else if (11 < users.length && users.length <= 100) {
          plan = "large-teams";
        } else {
          plan = "enterprise";
          q = users.length;
        }
        if (this.aTeam.stripePlanId !== plan && this.aTeam.cardToken) {
          const res = await fetch(
            "https://teamlog-2d74c.cloudfunctions.net/setStripePlan",
            {
              method: "POST",
              body: JSON.stringify({
                stripeSubscriptionId: this.aTeam.stripeSubscriptionId,
                quantity: q,
                plan
              })
            }
          );
          const data = await res.json();
          data.body = JSON.parse(data.body);
          return data;
        }
      }
    });
  }

  logout(): void {
    signOut(this.auth).then(() => {
      this.router.navigate(["/sign-in"]);
      window.location.reload();
    });
  }

  public setSidenav(sidenav: MatSidenav) {
    this.sidenav = sidenav;
  }

  public toggle(): void {
    this.sidenav.toggle();
  }

  // TODO: Implement multi-team switching if needed
  userTeams: Team[] = [];

  setActiveTeam(teamId: string): void {
    // Placeholder for team switching functionality
    console.log('setActiveTeam called with:', teamId);
  }

}

@Component({
  standalone: true,
  selector: "no-access-dialog",
  templateUrl: "no-access-dialog.html",
  styleUrls: ["./account.component.css"],
  imports: [CommonModule, MatDialogModule, MatButtonModule]
})
export class NoAccessDialog {
  constructor(public dialogRef: MatDialogRef<NoAccessDialog>) {}

  close(): void {
    this.dialogRef.close();
  }
}

@Component({
  standalone: true,
  selector: "team-disabled-dialog",
  templateUrl: "team-disabled-dialog.html",
  styleUrls: ["./account.component.css"],
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatTooltipModule]
})
export class TeamDisabledDialog {
  count;
  constructor(
    public dialogRef: MatDialogRef<TeamDisabledDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.count = 30 - moment().diff(this.data.disabledAt, "days");
  }

  close(reEnable, teamId?): void {
    this.dialogRef.close({ reEnable, teamId });
  }
}

export class User {
  email: string;
  username?: string;
  phone?: string;
  accountType?: string;
  profileUrl?: string;
  jobTitle?: string;
  name?: string;
  id?: string;
  teamId: string;
  createdAt: any;
  disabledBy: string = null;
  isManager: boolean = true;
  isDev?: boolean;
  preferEmail?: boolean;
}

export class TeamMember {
  email: string;
  phone: string;
  profileUrl?: string;
  jobTitle?: string;
  name?: string;
  id?: string;
  createdAt: any;
  teamId: string;
}

export class Team {
  id: string;
  name: string;
  createdAt: Date;
  ownerId: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  industries?: string[];
  cardToken?: any;
  disabled: boolean = false;
  disabledAt?: any;
  stripeSubscriptionId?: string;
  stripePlanId?: string;
  stripeCustomerId?: string;
  stripeInvoicesRetrievedAt?: any;
  stripeInvoices?: any;
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export class Log {
  id: string;
  createdAt: Date;
  teamId: string;
  userId: string;
  description: string;
  images: any[] = [];
  surveySubject?: string;
  surveyQuestion?: string;
  LatPos: number;
  LongPos: number;
  updatedId: string;
  updatedBy: string;
  updatedAt: Date;
}

export class Timeclock {
  userId: string;
  shiftStarted: Date = new Date();
  actions: any = {};
  locations: any = {};
  shiftEnded: Date = null;
  secondsWorked: number = 0; // set on shiftEnded
  updatedAt: Date;
  updatedBy: string;
  updatedId: string;
  id?: string;
  loggedHours?: number;
  loggedMinutes?: number;
}

export class InviteToTeam {
  inviteName: string;
  inviteEmail: string;
  companyName: string;
  teamId: string;
  status: string = "invited";
  isAdmin: boolean = false;
  invitedBy: string;
}

export class Event {
  id?: string;
  action: any;
  createdAt: any;
  description: string;
  documentId: string;
  type: string; // survey, survey response, timeclock, log, injury report, supervisor report, self assesment
  userId: string;
}
