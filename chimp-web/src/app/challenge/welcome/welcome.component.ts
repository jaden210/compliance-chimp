import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ChallengeService } from "../challenge.service";
import { AnalyticsService, FunnelStep } from "../../shared/analytics.service";
import { LeadTrackingService } from "../../shared/lead-tracking.service";

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
  hasConsultationPrefill = false;
  consultationImportanceScore: number | null = null;

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private route: ActivatedRoute,
    private analytics: AnalyticsService,
    private leadTracking: LeadTrackingService
  ) {}

  ngOnInit(): void {
    // Reset the challenge state whenever welcome page is loaded
    // This ensures a fresh start when returning to the beginning
    this.challengeService.reset();

    const consultationPrefill = this.challengeService.getConsultationPrefill();
    if (consultationPrefill) {
      this.hasConsultationPrefill = true;
      this.consultationImportanceScore = consultationPrefill.importanceScore ?? null;
      this.preselectedIndustry = consultationPrefill.industryDescription.trim();
      this.challengeService.setBusinessInfo(
        consultationPrefill.companyName.trim(),
        consultationPrefill.website.trim(),
        consultationPrefill.industryDescription.trim()
      );
      this.challengeService.setBusinessMetadata(
        consultationPrefill.state.trim(),
        consultationPrefill.employeeCount,
        consultationPrefill.assessmentId || null,
        consultationPrefill.importanceScore ?? null
      );
    }

    const industryQueryParam = this.route.snapshot.queryParamMap.get("industry")?.trim() || "";
    if (industryQueryParam) {
      this.preselectedIndustry = industryQueryParam;
    }

    if (industryQueryParam) {
      this.challengeService.setBusinessInfo(
        this.challengeService.businessName,
        this.challengeService.businessWebsite,
        this.preselectedIndustry
      );
    }

    const dryrun = this.route.snapshot.queryParamMap.get("dryrun");
    if (dryrun !== null) {
      this.challengeService.setDryRun(dryrun === 'true');
    }

    // Track welcome page view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_WELCOME_VIEW);

    if (this.leadTracking.hasActiveJourney()) {
      this.leadTracking.trackEvent('signup_started', '/get-started/welcome');
      this.leadTracking.syncToFirestore();
    }
  }

  getStarted(): void {
    // Track that user is starting the challenge
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_START);

    this.router.navigate(['/get-started/step1'], {
      queryParams: this.preselectedIndustry ? { industry: this.preselectedIndustry } : undefined
    });
  }
}
