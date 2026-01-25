import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { Title, Meta } from '@angular/platform-browser';
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { AnalyticsService, EngagementEvent } from "../shared/analytics.service";

@Component({
  standalone: true,
  templateUrl: "./plans.component.html",
  styleUrls: ["./plans.component.scss"],
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule]
})
export class PlansComponent implements OnInit {

  constructor(
    private titleService: Title,
    private metaTagService: Meta,
    private _router: Router,
    private analytics: AnalyticsService
  ) {
    this.titleService.setTitle('Pricing - Compliancechimp');
    this.metaTagService.updateTag({ 
      name: 'description', 
      content: 'Simple, flat-rate pricing for safety compliance. $99/month for unlimited team members.' 
    });
  }

  ngOnInit(): void {
    // Track pricing page view
    this.analytics.trackEngagement(EngagementEvent.PRICING_VIEWED);
  }

  public startTrial() {
    // Track CTA click from pricing page
    this.analytics.trackCTA('start_trial', 'pricing_page');
    this._router.navigate(['/sign-up']);
  }
}
