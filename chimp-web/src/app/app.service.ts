import { Injectable } from "@angular/core";
import { Firestore, collection, collectionData, query, orderBy } from "@angular/fire/firestore";
import { MatDialog } from "@angular/material/dialog";
import { VideoDialogComponent } from "./video-dialog/video-dialog.component";
import { Auth } from "@angular/fire/auth";
import { Router } from "@angular/router";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { AnalyticsService, EngagementEvent } from "./shared/analytics.service";

@Injectable({
  providedIn: "root"
})
export class AppService {
  /* Set on sign-up-page */
  email: string;
  /* Checking for invites sets this here */
  invites: any[];

  isUser: boolean = false; // decides if a user has logged in before
  isLoggedIn: boolean = false; // decides if a user is logged in
  firstTimeUser: boolean = false; // lets the system show new member dialog
  isAuthReady: boolean = false; // tracks if auth state has been determined

  removeFromInvite: boolean = false;
  toolbarShadow: boolean = true;

  constructor(
    public db: Firestore,
    public dialog: MatDialog,
    private auth: Auth,
    private router: Router,
    private analytics: AnalyticsService
  ) {}

  watchVideo() {
    let dialog = this.dialog.open(VideoDialogComponent);
    this.analytics.trackVideo('play', 'homepage_explainer');
  }

  /* When they put in their email address check it first */
  checkForExistingUser(email): Promise<boolean> {
    return (
      fetchSignInMethodsForEmail(this.auth, email)
        /* If length > 0, not new else new user */
        .then(
          data => {
            return data.length ? true : false;
          },
          error => {
            throw error;
          }
        )
    );
  }


  public getSubscriptionPlans(): Observable<SubscriptionPlan[]> {
    const plansRef = collection(this.db, "subscription-plans");
    const plansQuery = query(plansRef, orderBy("order", "asc"));
    return collectionData(plansQuery, { idField: "id" }).pipe(
      map((plans: any[]) => plans.sort((a, b) => a.order - b.order))
    ) as Observable<SubscriptionPlan[]>;
  }
}

export class User {
  // also in account service
  id?: string;
  name?: string;
  email: string;
  profileUrl?: string;
  username?: string;
  phone?: string;
  accountType?: string;
  teams?: any[];
  preferEmail?: boolean;
}

export class SubscriptionPlan {
  id: string;
  name: string;
  annualPrice: number;
  classCap: number;
  memorialCap: number;
  mostPopular: boolean;
  description: string;
  stripePlanId: string;
}

export class Survey {
  id?: string;
  libraryId: string;
  userId: string;
  title: string;
  active: boolean = true;
  createdAt: any = new Date();
  trainees: any[] = [];
  teamId: string;


  user?;
  author?;
  category?;
  articleId?;
}

export class SurveyResponse {
  createdAt: Date;
  longAnswer: string;
  shortAnswer: ShortAnswer;
  surveyId: string;
  teamMemberId: string;
  teamId: string;
  id?: string;
  signatureUrl: any;
  color?: string;
  user?: any;
}

export enum ShortAnswer {
  Yes = "Yes",
  No = "No"
}
