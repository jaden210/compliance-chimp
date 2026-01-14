import { Component, Inject } from "@angular/core";
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
import { SignUpComponent } from "./sign-up/sign-up.component";
declare var gtag: Function;

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
    SignUpComponent
  ]
})
export class AppComponent {
  open: boolean = false;
  body: HTMLElement;

  constructor(
    public router: Router,
    public appService: AppService,
    public auth: Auth
  ) {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        gtag("config", "UA-125391496-1", { page_path: event.url });
      }
      if (!(event instanceof NavigationEnd)) {
        return;
      }
      document.getElementById("scroll").scrollTop = 0;
    });
    if (localStorage.getItem("cc-user")) {
      //they have been here before
      this.appService.isUser = true;
      onAuthStateChanged(this.auth, user => {
        if (user && user.uid) {
          this.appService.isLoggedIn = true;
        }
      });
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
        gtag("event", "click", {
          event_category: "sign up funnel",
          event_label: "toolbar button"
        });
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
