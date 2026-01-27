import { Component, OnInit, Inject, PLATFORM_ID } from "@angular/core";
import { Router, NavigationEnd, RouterModule } from "@angular/router";
import { CommonModule, isPlatformBrowser, DOCUMENT } from "@angular/common";
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
export class AppComponent implements OnInit {
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
    private analytics: AnalyticsService,
    @Inject(PLATFORM_ID) private platformId: Object,
    @Inject(DOCUMENT) private document: Document
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

  ngOnInit(): void {
    this.addGlobalStructuredData();
  }

  private addGlobalStructuredData(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Add Organization schema
    const orgSchema = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Compliance Chimp",
      "url": "https://compliancechimp.com",
      "logo": "https://compliancechimp.com/assets/ccLogo.png",
      "description": "OSHA safety compliance and training software for small businesses. Simplify workplace safety with automated training, self-inspections, and injury reporting.",
      "sameAs": [
        "https://twitter.com/compliancechimp"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "support@compliancechimp.com",
        "contactType": "customer support"
      },
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "US"
      }
    };

    const orgScript = this.document.createElement('script');
    orgScript.type = 'application/ld+json';
    orgScript.setAttribute('data-org-schema', 'true');
    orgScript.textContent = JSON.stringify(orgSchema);
    this.document.head.appendChild(orgScript);

    // Add WebSite schema with SearchAction for sitelinks search box
    const websiteSchema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Compliance Chimp",
      "url": "https://compliancechimp.com",
      "description": "OSHA compliance and safety training platform for small businesses",
      "publisher": {
        "@type": "Organization",
        "name": "Compliance Chimp"
      },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://compliancechimp.com/blog?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    };

    const websiteScript = this.document.createElement('script');
    websiteScript.type = 'application/ld+json';
    websiteScript.setAttribute('data-website-schema', 'true');
    websiteScript.textContent = JSON.stringify(websiteSchema);
    this.document.head.appendChild(websiteScript);
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
