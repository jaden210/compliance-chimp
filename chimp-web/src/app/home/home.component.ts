import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { Auth } from "@angular/fire/auth";
import { onAuthStateChanged } from "firebase/auth";
import { AppService } from "../app.service";
import { SignUpComponent } from "../sign-up/sign-up.component";

declare var gtag: Function;

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    SignUpComponent
  ],
  selector: "app-home",
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.css"]
})
export class HomeComponent implements OnInit {
  loginErrorStr;
  email;

  constructor(
    public appService: AppService,
    private router: Router,
    public auth: Auth
  ) {}

  ngOnInit() {}

  createAccount(): void {
    this.loginErrorStr = !this.email ? "email required" : null;
    if (!this.loginErrorStr) {
      this.appService.email = this.email;
      this.appService.checkForExistingUser(this.email).then(
        isExistingUser => {
          if (!isExistingUser) {
            this.router.navigate(["/get-started"]);
          } else {
            this.router.navigate(["/sign-in"]);
          }
        },
        error => (this.loginErrorStr = error)
      );
    }
  }

  routeSignUp() {
    onAuthStateChanged(this.auth, user => {
      if (user && user.uid) {
        this.router.navigate(["account"]);
      } else {
        gtag("event", "click", {
          event_category: "sign up funnel",
          event_label: "start today its free"
        });
        this.router.navigate(["/sign-up"]);
      }
    });
  }
}
