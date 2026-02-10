import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ChallengeService } from "../challenge.service";
import { AnalyticsService, FunnelStep } from "../../shared/analytics.service";

@Component({
  standalone: true,
  selector: "challenge-step1",
  templateUrl: "./step1.component.html",
  styleUrls: ["./step1.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class Step1Component implements OnInit {
  businessName = '';
  businessWebsite = '';
  industry = '';

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private route: ActivatedRoute,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Load any previously entered data
    this.businessName = this.challengeService.businessName;
    this.businessWebsite = this.challengeService.businessWebsite;
    this.industry = this.challengeService.industry;

    const industryQueryParam = this.route.snapshot.queryParamMap.get('industry')?.trim() || '';
    if (industryQueryParam) {
      this.industry = industryQueryParam;
      this.challengeService.setBusinessInfo(this.businessName, this.businessWebsite, industryQueryParam);
    }
    
    // Track step 1 view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP1_VIEW);
  }

  isValid(): boolean {
    return !!(
      this.businessName?.trim() &&
      this.industry?.trim() &&
      this.industry.trim().length >= 3
    );
  }

  next(): void {
    if (!this.isValid()) return;
    
    this.challengeService.setBusinessInfo(
      this.businessName.trim(),
      this.businessWebsite.trim(),
      this.industry.trim()
    );
    
    // Track step 1 completion with business info
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP1_COMPLETE, {
      industry: this.industry.trim(),
      has_website: !!this.businessWebsite.trim()
    });
    
    this.router.navigate(['/get-started/step2']);
  }
}
