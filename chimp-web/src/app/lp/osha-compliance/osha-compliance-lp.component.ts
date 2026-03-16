import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AnalyticsService } from '../../shared/analytics.service';
import { SeoService } from '../../shared/seo.service';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule
  ],
  selector: 'app-osha-compliance-lp',
  templateUrl: './osha-compliance-lp.component.html',
  styleUrls: ['./osha-compliance-lp.component.css']
})
export class OshaComplianceLpComponent implements OnInit, OnDestroy {
  private scrollMilestones = new Set<25 | 50 | 75 | 90 | 100>();
  private scrollContainer: HTMLElement | null = null;
  private boundScrollHandler: (() => void) | null = null;

  constructor(
    private analytics: AnalyticsService,
    private seo: SeoService,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    // Set SEO for this landing page
    this.seo.setCustomSeo({
      title: 'Avoid OSHA Fines for $99/Month | Compliance Chimp',
      description: 'OSHA fines start at $16,550 per violation. Get your team compliant in 6 minutes for just $99/month. Automated training, self-inspections, and audit-ready documentation.',
      keywords: 'OSHA compliance software, avoid OSHA fines, OSHA training, small business OSHA compliance'
    });

    // Track landing page view for Google Ads attribution
    this.analytics.trackEvent('landing_page_view', {
      event_category: 'landing_page',
      landing_page: 'osha_compliance',
      traffic_source: 'google_ads'
    });

    // Set up scroll tracking
    try {
      this.scrollContainer = this.document.getElementById('scroll');
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
      // Silently fail
    }
  }

  trackCTAClick(location: string): void {
    this.analytics.trackCTA('start_trial', `lp_osha_${location}`);
  }
}
