import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ChallengeService } from "../challenge.service";
import { AnalyticsService, FunnelStep } from "../../shared/analytics.service";

@Component({
  standalone: true,
  selector: "challenge-welcome",
  templateUrl: "./welcome.component.html",
  styleUrls: ["./welcome.component.scss"],
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class WelcomeComponent implements OnInit {
  private preselectedIndustry = "";

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private route: ActivatedRoute,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Reset the challenge state whenever welcome page is loaded
    // This ensures a fresh start when returning to the beginning
    this.challengeService.reset();

    this.preselectedIndustry = this.route.snapshot.queryParamMap.get("industry")?.trim() || "";
    if (this.preselectedIndustry) {
      this.challengeService.setBusinessInfo("", "", this.preselectedIndustry);
    }
    
    // Track welcome page view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_WELCOME_VIEW);
  }

  getStarted(): void {
    // Track that user is starting the challenge
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_START);

    this.router.navigate(['/get-started/step1'], {
      queryParams: this.preselectedIndustry ? { industry: this.preselectedIndustry } : undefined
    });
  }
}
