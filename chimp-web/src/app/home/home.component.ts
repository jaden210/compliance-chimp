import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { AnalyticsService } from "../shared/analytics.service";

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule
  ],
  selector: "app-home",
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.css"]
})
export class HomeComponent implements OnInit, OnDestroy {
  private scrollMilestones = new Set<25 | 50 | 75 | 90 | 100>();
  private scrollContainer: HTMLElement | null = null;
  private boundScrollHandler: (() => void) | null = null;

  constructor(
    private analytics: AnalyticsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Get the scroll container (the #scroll element in app.component)
    // Use try-catch to ensure this never breaks the component
    try {
      this.scrollContainer = document.getElementById('scroll');
      if (this.scrollContainer) {
        this.boundScrollHandler = this.onScroll.bind(this);
        this.scrollContainer.addEventListener('scroll', this.boundScrollHandler, { passive: true });
      }
    } catch (e) {
      // Silently fail - scroll tracking is optional
    }
  }

  ngOnDestroy(): void {
    try {
      if (this.scrollContainer && this.boundScrollHandler) {
        this.scrollContainer.removeEventListener('scroll', this.boundScrollHandler);
      }
    } catch (e) {
      // Silently fail
    }
  }

  private onScroll(): void {
    try {
      if (!this.scrollContainer) return;
      
      const scrollTop = this.scrollContainer.scrollTop;
      const scrollHeight = this.scrollContainer.scrollHeight - this.scrollContainer.clientHeight;
      
      // Avoid division by zero
      if (scrollHeight <= 0) return;
      
      const scrollPercent = Math.round((scrollTop / scrollHeight) * 100);

      const milestones: (25 | 50 | 75 | 90 | 100)[] = [25, 50, 75, 90, 100];
      for (const milestone of milestones) {
        if (scrollPercent >= milestone && !this.scrollMilestones.has(milestone)) {
          this.scrollMilestones.add(milestone);
          this.analytics.trackScrollDepth(milestone);
        }
      }
    } catch (e) {
      // Silently fail - scroll tracking should never break the page
    }
  }

  // Track CTA clicks from the home page
  trackCTA(ctaName: string): void {
    this.analytics.trackCTA(ctaName, 'home_page');
  }

  // Navigate to sign-up with tracking
  goToSignUp(location: string): void {
    this.analytics.trackCTA('sign_up', `home_${location}`);
    this.router.navigate(['/sign-up']);
  }
}
