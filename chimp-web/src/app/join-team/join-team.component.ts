import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { JoinTeamService } from "./join-team.service";
import { AppService } from "../app.service";
import { FormControl, Validators } from "@angular/forms";
import { Team, User } from "../account/account.service";
import { doc, docData } from "@angular/fire/firestore";
import { Observable } from "rxjs";

@Component({
  standalone: true,
  selector: "join-team",
  templateUrl: "./join-team.component.html",
  styleUrls: ["./join-team.component.scss"],
  providers: [JoinTeamService],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatToolbarModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ]
})
export class JoinTeamComponent implements OnInit {
  
  emailError: string;
  password: string;
  confirmPassword: string;
  error: string;

  private userId: string;
  public user: User = new User();
  public team: Team = new Team();
  public loaded: boolean = true;

  constructor(
    private _router: Router,
    private _route: ActivatedRoute,
    private joinTeamService: JoinTeamService,
    private appService: AppService
  ) {}

  ngOnInit() {
    this._route.queryParamMap.subscribe(params => {
      this.userId = params.get("userId");
      this.userId == null ? this.loaded = false : this.getData();
    });
  }

  private getData(): void {
    (docData(doc(this.appService.db, `user/${this.userId}`), { idField: "id" }) as Observable<User | null>)
      .subscribe(user => {
        if (!user) return;
        this.user = user;
        (docData(doc(this.appService.db, `team/${user.teamId}`), { idField: "id" }) as Observable<Team | null>)
          .subscribe(team => {
            if (!team) return;
            this.team = team;
          });
      });
  }

  public createUser() {
    this.error =
      !this.password || !this.confirmPassword
        ? "Please enter the required items"
        : this.password.length < 6
        ? "Password must be at least 6 characters"
        : this.password !== this.confirmPassword
        ? "Passwords do not match"
        : null;
    if (!this.error)
    this.joinTeamService.createAuthUser(this.password, this.user.email).then(
      (authUser: any) => this.joinTeamService.createUser(this.user, authUser.user.uid).then(() =>
      this._router.navigate(["/account"])),
        error => {
          console.error(error);
          this.error =
            error.code == "auth/email-already-in-use"
              ? "This email is already in use by another account, please contact support"
              : error.code == "auth/invalid email"
              ? "Please enter a valid email address"
              : "We're having trouble creating your account, try again later";
        }
      );
  }
}
