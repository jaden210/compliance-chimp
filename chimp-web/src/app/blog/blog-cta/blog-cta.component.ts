import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

/**
 * Reusable CTA component for blog posts.
 * Provides consistent messaging across all blog articles.
 * Edit this component to update CTAs across all blog posts at once.
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule
  ],
  selector: "blog-cta",
  templateUrl: "./blog-cta.component.html",
  styleUrls: ["./blog-cta.component.scss"]
})
export class BlogCtaComponent {
  /**
   * Optional industry name to personalize the CTA.
   * If provided, the CTA will mention the specific industry.
   */
  @Input() industry?: string;

  // ===== EDITABLE CTA CONTENT =====
  // Update these values to change the CTA messaging across all blog posts

  /** Main headline for the CTA section */
  headline = "Ready to simplify OSHA compliance?";

  /** Subheadline with value proposition */
  subheadline = "Get your business on track to full OSHA compliance in under 6 minutes.";

  /** Primary CTA button text */
  buttonText = "Get My Team on Track";

  /** Route for the primary CTA button */
  buttonRoute = "/get-started";

  /** Pricing/offer text */
  offerText = "$99/month • 14-day free trial • No credit card required";

  /** Features list - displayed as checkmarks */
  features = [
    "The chimp sets you up in 6 minutes or less",
    "Trainings go out automatically on autopilot",
    "Guided self-inspections tailored to your industry",
    "Permanent compliance records stored forever",
    "Smart reminders so nothing falls through the cracks"
  ];

  // ===== END EDITABLE CONTENT =====

  /**
   * Get personalized headline if industry is provided.
   */
  get personalizedHeadline(): string {
    if (this.industry) {
      return `Ready to simplify compliance for your ${this.industry.toLowerCase()} business?`;
    }
    return this.headline;
  }
}
