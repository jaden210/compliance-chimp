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
import { MatIconModule } from "@angular/material/icon";
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
import { environment } from "src/environments/environment";
import { AnalyticsService } from "../shared/analytics.service";

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
  teamMembersLoaded: boolean = false;
  teamManagers: User[];
  teamManagersObservable: BehaviorSubject<any> = new BehaviorSubject(null);
  showHelper: boolean = false;
  showFeedback: boolean = false;
  searchForHelper: string; // template var to assist event system;
  public showLD: boolean = false;

  // Trial and read-only mode
  public isReadOnly: boolean = false;
  public trialDaysRemaining: number = 0;
  public isTrialExpired: boolean = false;
  private trialDialogShown: boolean = false;

  helperProfiles: any;
  helper: Helper;
  feedback: Helper;

  constructor(
    public db: Firestore,
    private auth: Auth,
    public dialog: MatDialog,
    public router: Router,
    public snackbar: MatSnackBar,
    private helperService: HelperService,
    private analytics: AnalyticsService
  ) {
    this.helperProfiles = this.helperService.helperProfiles;
    this.feedback = this.helperProfiles.feedback;
  }

  buildTeam(teamId: string) {
    this.teamMembersLoaded = false;
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
        
        // Set analytics user properties for segmentation
        this.analytics.setTeamId(team.id);
        this.analytics.setUserProperties({
          team_name: team.name,
          industry: team.industry || 'unknown',
          has_subscription: !!team.stripeSubscriptionId
        });
        
        // Check trial expiration status
        this.checkTrialStatus(team);
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
      this.teamMembersLoaded = true;
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

  /**
   * Check if the team's 14-day trial has expired
   * If no subscription and trial expired, set read-only mode
   */
  private checkTrialStatus(team: Team): void {
    // If team has a Stripe subscription, they're not in trial
    if (team.stripeSubscriptionId) {
      this.isReadOnly = false;
      this.isTrialExpired = false;
      this.trialDaysRemaining = 0;
      return;
    }

    // Calculate trial status
    const createdAt = team.createdAt instanceof Date 
      ? team.createdAt 
      : (team.createdAt as any)?.toDate?.() || new Date(team.createdAt);
    
    const trialDays = 14;
    const trialEndDate = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    
    const msRemaining = trialEndDate.getTime() - now.getTime();
    this.trialDaysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    
    if (now > trialEndDate) {
      // Trial has expired
      this.isTrialExpired = true;
      this.isReadOnly = true;
      
      // Show trial expired dialog once per session
      if (!this.trialDialogShown) {
        this.trialDialogShown = true;
        this.showTrialExpiredDialog(team);
      }
    } else {
      this.isTrialExpired = false;
      this.isReadOnly = false;
    }
  }

  /**
   * Show dialog when trial has expired
   */
  showTrialExpiredDialog(team: Team): void {
    const dialog = this.dialog.open(TrialExpiredDialog, {
      disableClose: true,
      data: {
        teamId: team.id,
        teamEmail: team.email || this.user?.email
      }
    });
    
    dialog.afterClosed().subscribe(result => {
      if (result?.subscribe) {
        // User clicked subscribe - redirect to Stripe
        this.startCheckout();
      }
      // If they clicked continue in read-only, just close dialog
      // isReadOnly is already set to true
    });
  }

  /**
   * Redirect to Stripe checkout
   */
  public startCheckout(): void {
    // Track checkout initiation
    this.analytics.trackSubscription('begin_checkout', 'standard', 99);
    
    const email = this.user?.email || this.aTeam?.email;
    let paymentUrl = `${environment.stripe.paymentLink}?client_reference_id=${this.aTeam.id}`;
    if (email) {
      paymentUrl += `&prefilled_email=${encodeURIComponent(email)}`;
    }
    window.location.href = paymentUrl;
  }

  public getShouldShowAgain(): boolean {
    return JSON.parse(localStorage.getItem('ccld')) || true;
  }

  public createUser(user: User): Promise<any> {
    user.teamId = this.aTeam.id;
    user.createdAt = new Date();
    const cleanedUser = Object.fromEntries(
      Object.entries(user).filter(([_, v]) => v !== undefined)
    );
    return addDoc(collection(this.db, "user"), cleanedUser);
  }

  public updateUser(user: User): Promise<any> {
    const cleanedUser = Object.fromEntries(
      Object.entries(user).filter(([_, v]) => v !== undefined)
    );
    return setDoc(doc(this.db, `user/${user.id}`), cleanedUser);
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

@Component({
  standalone: true,
  selector: "trial-expired-dialog",
  templateUrl: "trial-expired-dialog.html",
  styleUrls: ["./account.component.css"],
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule]
})
export class TrialExpiredDialog {
  constructor(
    public dialogRef: MatDialogRef<TrialExpiredDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  subscribe(): void {
    this.dialogRef.close({ subscribe: true });
  }

  continueReadOnly(): void {
    this.dialogRef.close({ subscribe: false });
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
  tags?: string[];
  preferEmail?: boolean;
}

export class Team {
  id?: string; // Optional - generated by Firestore on creation
  name: string;
  createdAt: Date;
  ownerId: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  website?: string; // Business website URL for AI context
  industry?: string; // Freeform industry description (new approach)
  industries?: string[]; // Legacy - array of industry IDs
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
  // Coverage analysis cache for inspections (populated by Cloud Function)
  coverageAnalysis?: any;
  coverageAnalysisStale?: boolean;
  coverageAnalysisUpdatedAt?: any;
  coverageAnalysisInvalidatedAt?: any;
  // Training coverage analysis cache (populated by Cloud Function)
  trainingCoverageAnalysis?: any;
  trainingCoverageAnalysisStale?: boolean;
  trainingCoverageAnalysisUpdatedAt?: any;
  // Auto-start trainings setting - defaults to true for new teams
  autoStartTrainings?: boolean;
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
