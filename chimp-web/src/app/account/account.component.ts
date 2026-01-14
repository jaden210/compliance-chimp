import { Component, ViewChild, AfterViewInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { trigger, style, transition, animate } from "@angular/animations";
import { AccountService, User, Team, InviteToTeam } from "./account.service";
import { Auth } from "@angular/fire/auth";
import { take } from "rxjs/operators";
import { Router } from "@angular/router";
import { MatDialog } from "@angular/material/dialog";
import { MatSidenavModule, MatSidenav } from "@angular/material/sidenav";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatTooltipModule } from "@angular/material/tooltip";
import { AppService } from "../app.service";
import { Subscription } from "rxjs";
import { HelpDialogComponent } from "../help-dialog/help-dialog.component";
import { LoadingChimpComponent } from "./loading-chimp/loading-chimp.component";
import { addDoc, collection, doc, docData, Firestore } from "@angular/fire/firestore";
import { onAuthStateChanged } from "firebase/auth";

@Component({
  standalone: true,
  selector: "app-account",
  templateUrl: "./account.component.html",
  styleUrls: ["./account.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    LoadingChimpComponent
  ],
  providers: [DatePipe],
  animations: [
    trigger("helper", [
      transition(":enter", [
        style({ transform: "translateX(-150%)", opacity: 0 }),
        animate(
          "400ms ease-out",
          style({ transform: "translateX(0)", opacity: 1 })
        )
      ]),
      transition(":leave", [
        style({ transform: "translateX(0)", opacity: 1 }),
        animate(
          "400ms ease-in",
          style({ transform: "translateX(-150%)", opacity: 0 })
        )
      ])
    ])
  ]
})
export class AccountComponent implements AfterViewInit, OnDestroy {
  @ViewChild("sidenav") public sidenav: MatSidenav;
  bShowAccountInfo: boolean = false; // template var
  helperContrast: boolean = false; // template var
  private authUnsubscribe?: () => void;

  constructor(
    public accountService: AccountService,
    public appService: AppService,
    private auth: Auth,
    private db: Firestore,
    public router: Router,
    public dialog: MatDialog
  ) {
    this.authUnsubscribe = onAuthStateChanged(this.auth, (user) => {
      if (user && user.uid) {
        const userRef = doc(this.db, `user/${user.uid}`);
        docData(userRef, { idField: 'id' }).pipe(take(1)).subscribe((userData: any) => {
          if (userData && userData.id) {
            this.accountService.userObservable.next(userData as User);
            this.accountService.user = userData as User;
            this.accountService.buildTeam(userData.teamId);
          }
        });
      } else {
        this.accountService.logout();
      }
    });
  }

  ngOnDestroy() {
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
    }
  }

  ngAfterViewInit() {
    this.accountService.setSidenav(this.sidenav);
  }

  public openHelp(): void {
    this.dialog.open(HelpDialogComponent);
  }

  closeHelper() {
    this.accountService.showHelper = false;
  }

  submitFeedback() {
    let fbtext = JSON.parse(
      JSON.stringify(this.accountService.helperProfiles.feedback)
    );
    this.accountService.feedback.name = "Thanks for your feedback!";
    setTimeout(() => {
      this.accountService.showFeedback = false;
      addDoc(collection(this.accountService.db, "feedback"), {
        origin: "feeback helper",
        originPage: location.pathname,
        description: this.accountService.feedback.description,
        userId: this.accountService.user.id,
        userName: this.accountService.user.name,
        teamName: this.accountService.aTeam.name,
        email: this.accountService.user.email,
        isClosed: false,
        createdAt: new Date()
      }).then(() => {
        this.accountService.feedback = fbtext;
        this.accountService.feedback.description = "";
      });
    }, 2000);
  }
}
