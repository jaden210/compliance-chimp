import { Component } from "@angular/core";
import { Router, NavigationEnd, RouterModule } from "@angular/router";
import { CommonModule } from "@angular/common";
import { AppService } from "./app.service";
import { Auth } from "@angular/fire/auth";
import { onAuthStateChanged } from "firebase/auth";
import { MatSidenavModule } from "@angular/material/sidenav";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { FooterComponent } from "./footer/footer.component";
import { AnalyticsService, FunnelStep } from "./shared/analytics.service";

@Component({
  standalone: true,
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    FooterComponent
  ]
})
export class AppComponent {
  open: boolean = false;
  body: HTMLElement;
  
  // Check if we're on an account/user route (uses window.location for immediate availability)
  get isAccountRoute(): boolean {
    const path = window.location.pathname;
    return path.startsWith('/account') || path.startsWith('/user');
  }

  constructor(
    public router: Router,
    public appService: AppService,
    public auth: Auth,
    private analytics: AnalyticsService
  ) {
    // Page view tracking is handled by AnalyticsService
    // Just handle scroll reset here
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        document.getElementById("scroll")?.scrollTop && (document.getElementById("scroll").scrollTop = 0);
      }
    });
    
    // Listen for auth state changes and mark auth as ready once determined
    onAuthStateChanged(this.auth, user => {
      if (user && user.uid) {
        this.appService.isLoggedIn = true;
        // Set user ID for analytics attribution
        this.analytics.setUserId(user.uid);
      } else {
        // Clear user from analytics on logout
        this.analytics.clearUser();
      }
      this.appService.isAuthReady = true;
    });
    
    if (localStorage.getItem("cc-user")) {
      //they have been here before
      this.appService.isUser = true;
    }
  }

  navRoute(link?) {
    this.open = false;
    this.router.navigate([link]);
  }

  goToBlog() {
    window.open("https://blog.compliancechimp.com");
  }

  routeSignUp() {
    this.open = false;
    onAuthStateChanged(this.auth, user => {
      if (user && user.uid) {
        this.router.navigate(["account"]);
      } else {
        this.analytics.trackCTA('sign_up', 'toolbar');
        this.router.navigate(["/sign-up"]);
      }
    });
  }

  trySignIn() {
    this.open = false;
    onAuthStateChanged(this.auth, user => {
      if (user && user.uid) {
        this.router.navigate(["account"]);
      } else {
        this.router.navigate(["/sign-in"]);
      }
    });
  }
}
