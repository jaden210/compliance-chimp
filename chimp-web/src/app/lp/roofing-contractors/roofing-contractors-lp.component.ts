import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AnalyticsService } from '../../shared/analytics.service';
import { SeoService } from '../../shared/seo.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
  selector: 'app-roofing-contractors-lp',
  templateUrl: './roofing-contractors-lp.component.html',
  styleUrls: ['./roofing-contractors-lp.component.css']
})
export class RoofingContractorsLpComponent implements OnInit, OnDestroy {
  readonly getStartedQueryParams = { industry: 'Roofing Contractors' };
  private injectedJsonLdScripts: HTMLScriptElement[] = [];

  constructor(
    private analytics: AnalyticsService,
    private seo: SeoService,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.seo.setCustomSeo({
      title: 'Roofing OSHA Compliance Software | Compliance Chimp',
      description: 'Roofing contractors can avoid costly fall protection citations with Compliance Chimp. Get OSHA-focused training, inspection checklists, and audit-ready records in 6 minutes.',
      keywords: 'roofing OSHA compliance, roofing fall protection training, OSHA software for roofing contractors, roofing safety documentation, avoid OSHA roofing fines',
      url: 'https://compliancechimp.com/lp/roofing-contractors'
    });

    this.analytics.trackEvent('landing_page_view', {
      event_category: 'landing_page',
      landing_page: 'roofing_contractors',
      traffic_source: 'direct_marketing'
    });

    this.injectStructuredData();
  }

  ngOnDestroy(): void {
    for (const script of this.injectedJsonLdScripts) {
      script.remove();
    }
    this.injectedJsonLdScripts = [];
  }

  trackCTAClick(location: string): void {
    this.analytics.trackCTA('start_trial', `lp_roofing_${location}`);
  }

  private injectStructuredData(): void {
    const serviceSchema = {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Compliance Chimp for Roofing Contractors',
      provider: {
        '@type': 'Organization',
        name: 'Compliance Chimp',
        url: 'https://compliancechimp.com'
      },
      areaServed: 'US',
      audience: {
        '@type': 'BusinessAudience',
        audienceType: 'Roofing contractors and roofing safety managers'
      },
      serviceType: 'OSHA compliance software for roofing contractors',
      description: 'Compliance Chimp helps roofing companies deliver OSHA training, track completion, run inspections, and keep audit-ready safety records.'
    };

    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How fast can a roofing company get started?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Most roofing contractors can complete setup in about 6 minutes. You answer a few business questions and Compliance Chimp builds your training and compliance workflow.'
          }
        },
        {
          '@type': 'Question',
          name: 'How does training work for field crews?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Training is delivered by text message and email so crews can complete assignments from any phone without downloading an app or managing new passwords.'
          }
        },
        {
          '@type': 'Question',
          name: 'Does Compliance Chimp help with OSHA inspections?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Compliance Chimp keeps timestamped training records, safety activity logs, and inspection documents organized so you can quickly show documentation during an OSHA visit.'
          }
        }
      ]
    };

    this.appendJsonLd(serviceSchema);
    this.appendJsonLd(faqSchema);
  }

  private appendJsonLd(schema: Record<string, unknown>): void {
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    this.document.head.appendChild(script);
    this.injectedJsonLdScripts.push(script);
  }
}
