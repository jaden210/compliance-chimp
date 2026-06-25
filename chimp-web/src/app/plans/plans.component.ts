import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from "@angular/core";
import { CommonModule, isPlatformBrowser, DOCUMENT } from "@angular/common";
import { RouterModule } from "@angular/router";
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
export class PlansComponent implements OnInit, OnDestroy {

  // FAQ data for structured data
  private pricingFaqs = [
    {
      question: "What's included?",
      answer: "Everything! Unlimited team members, all features, no hidden fees. The same tools whether you have 5 employees or 50."
    },
    {
      question: "Is there a catch?",
      answer: "No. No long-term contracts and nothing to cancel. Use it as long as you like."
    },
    {
      question: "Is it really free?",
      answer: "Yes! Every feature, no restrictions, no credit card required. Just create an account and start right away."
    },
    {
      question: "Do I need to enter payment info?",
      answer: "Never. There's no card required to sign up and no billing to worry about."
    }
  ];

  constructor(
    private _router: Router,
    private analytics: AnalyticsService,
    @Inject(PLATFORM_ID) private platformId: Object,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    // Track pricing page view
    this.analytics.trackEngagement(EngagementEvent.PRICING_VIEWED);
    
    // Add structured data for pricing and FAQ
    this.addPricingStructuredData();
    this.addFaqStructuredData();
  }

  ngOnDestroy(): void {
    // Clean up structured data when leaving the page
    if (isPlatformBrowser(this.platformId)) {
      const pricingScript = this.document.querySelector('script[data-pricing-schema]');
      if (pricingScript) {
        pricingScript.remove();
      }
      const faqScript = this.document.querySelector('script[data-pricing-faq-schema]');
      if (faqScript) {
        faqScript.remove();
      }
    }
  }

  private addPricingStructuredData(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Remove any existing pricing structured data
    const existingScript = this.document.querySelector('script[data-pricing-schema]');
    if (existingScript) {
      existingScript.remove();
    }

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Compliance Chimp Safety Compliance Platform",
      "description": "Complete OSHA safety compliance platform with unlimited team members, safety training, injury reporting, and self-inspection tools.",
      "brand": {
        "@type": "Brand",
        "name": "Compliance Chimp"
      },
      "offers": {
        "@type": "Offer",
        "url": "https://compliancechimp.com/plans",
        "priceCurrency": "USD",
        "price": "0.00",
        "priceValidUntil": new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        "availability": "https://schema.org/InStock",
        "seller": {
          "@type": "Organization",
          "name": "Compliance Chimp"
        }
      }
    };

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-pricing-schema', 'true');
    script.textContent = JSON.stringify(structuredData);
    this.document.head.appendChild(script);
  }

  private addFaqStructuredData(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Remove any existing FAQ structured data
    const existingScript = this.document.querySelector('script[data-pricing-faq-schema]');
    if (existingScript) {
      existingScript.remove();
    }

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": this.pricingFaqs.map(faq => ({
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.answer
        }
      }))
    };

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-pricing-faq-schema', 'true');
    script.textContent = JSON.stringify(structuredData);
    this.document.head.appendChild(script);
  }

  public startTrial() {
    // Track CTA click from pricing page
    this.analytics.trackCTA('start_trial', 'pricing_page');
    this._router.navigate(['/sign-up']);
  }
}
