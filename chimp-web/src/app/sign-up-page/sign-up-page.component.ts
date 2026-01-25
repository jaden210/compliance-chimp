import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatInputModule } from "@angular/material/input";
import { MatFormFieldModule } from "@angular/material/form-field";
import { Router } from "@angular/router";
import { AppService } from "../app.service";
import { AnalyticsService, FunnelStep } from "../shared/analytics.service";

@Component({
  standalone: true,
  selector: "app-sign-up-page",
  templateUrl: "./sign-up-page.component.html",
  styleUrls: ["./sign-up-page.component.css"],
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, MatButtonModule, MatInputModule, MatFormFieldModule]
})
export class SignUpPageComponent implements OnInit {
  loginErrorStr: string;
  email: string;

  constructor(
    public router: Router,
    public appService: AppService,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Track signup page view as funnel entry point
    this.analytics.trackSignupFunnel(FunnelStep.SIGNUP_PAGE_VIEW);
  }

  createAccount(): void {
    this.loginErrorStr = !this.email ? "email required" : null;
    if (!this.loginErrorStr) {
      // Track email submission
      this.analytics.trackSignupFunnel(FunnelStep.SIGNUP_EMAIL_ENTERED, {
        email_domain: this.email.split('@')[1] || 'unknown'
      });
      
      this.appService.email = this.email;
      this.appService.checkForExistingUser(this.email).then(
        isExistingUser => {
          if (isExistingUser) {
            // Track existing user redirect
            this.analytics.trackSignupFunnel(FunnelStep.SIGNUP_EMAIL_EXISTING_USER);
            this.router.navigate(["/sign-in"]);
          } else {
            // Track new user proceeding to signup
            this.analytics.trackSignupFunnel(FunnelStep.SIGNUP_EMAIL_NEW_USER);
            this.router.navigate(["/get-started"]);
          }
        },
        error => {
          this.loginErrorStr = error;
          this.analytics.trackError('signup_email_check', error);
        }
      );
    }
  }
}
