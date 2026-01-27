import { Injectable, Inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface SeoConfig {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SeoService implements OnDestroy {
  private baseUrl = 'https://compliancechimp.com';
  private defaultImage = 'https://compliancechimp.com/assets/og-image.png';
  private siteName = 'Compliance Chimp';
  private routerSubscription: Subscription | null = null;

  // SEO configurations for each route
  private routeSeoConfig: { [key: string]: SeoConfig } = {
    '/home': {
      title: 'Compliance Chimp | OSHA Safety Training & Compliance Software',
      description: 'Simplify OSHA compliance for your small business. Safety training, self-inspections, injury reporting, and compliance tracking—all in one platform.',
      keywords: 'OSHA compliance, safety training, workplace safety, compliance software, small business safety'
    },
    '/plans': {
      title: 'Pricing - Simple, Flat-Rate Safety Compliance | Compliance Chimp',
      description: '$99/month for complete OSHA compliance. Unlimited team members, safety training, injury reporting, and self-inspections. 14-day free trial, no credit card required.',
      keywords: 'OSHA compliance pricing, safety software cost, compliance software pricing, safety training subscription, workplace safety platform'
    },
    '/how-it-works': {
      title: 'How It Works | Compliance Chimp',
      description: 'Learn how Compliance Chimp simplifies OSHA compliance. Guided self-assessments, team training, injury reporting, and compliance tracking.',
      keywords: 'how OSHA compliance works, safety training process, compliance software guide'
    },
    '/common-questions': {
      title: 'FAQ | Compliance Chimp - Common Questions',
      description: 'Frequently asked questions about Compliance Chimp. Learn about OSHA compliance, safety training, pricing, and getting started.',
      keywords: 'OSHA compliance FAQ, safety training questions, compliance software help'
    },
    '/contact': {
      title: 'Contact Us | Compliance Chimp',
      description: 'Get in touch with the Compliance Chimp team. We\'re here to help with your OSHA compliance and safety training questions.',
      keywords: 'contact compliance chimp, OSHA compliance support, safety software help'
    },
    '/blog': {
      title: 'Blog | Compliance Chimp - Safety & Compliance Insights',
      description: 'Stay up to date with the latest OSHA regulations, safety tips, and compliance best practices from the Compliance Chimp blog.',
      keywords: 'OSHA blog, safety compliance blog, workplace safety articles'
    },
    '/sign-up': {
      title: 'Sign Up | Compliance Chimp - Start Free Trial',
      description: 'Create your Compliance Chimp account and start your free trial. Get started with OSHA compliance in minutes.',
      keywords: 'sign up compliance software, start OSHA compliance, free safety training trial'
    },
    '/sign-in': {
      title: 'Sign In | Compliance Chimp',
      description: 'Sign in to your Compliance Chimp account to manage OSHA compliance, training, and safety documentation.',
      keywords: 'login compliance chimp, sign in safety software'
    },
    '/terms-of-service': {
      title: 'Terms of Service | Compliance Chimp',
      description: 'Read the Compliance Chimp terms of service. Understand your rights and responsibilities when using our platform.',
      keywords: 'terms of service, compliance chimp legal'
    },
    '/privacy-policy': {
      title: 'Privacy Policy | Compliance Chimp',
      description: 'Learn how Compliance Chimp protects your data. Our privacy policy explains how we collect, use, and secure your information.',
      keywords: 'privacy policy, data protection, compliance chimp security'
    },
    '/customer-agreement': {
      title: 'Customer Agreement | Compliance Chimp',
      description: 'Review the Compliance Chimp customer agreement. Understand the terms of your subscription and service.',
      keywords: 'customer agreement, subscription terms'
    }
  };

  constructor(
    private meta: Meta,
    private title: Title,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.initRouteListener();
  }

  ngOnDestroy(): void {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
      this.routerSubscription = null;
    }
  }

  private initRouteListener(): void {
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const path = event.urlAfterRedirects.split('?')[0];
        this.updateMetaForRoute(path);
      });
  }

  private updateMetaForRoute(path: string): void {
    // Find matching config (try exact match first, then check for partial matches)
    let config = this.routeSeoConfig[path];
    
    if (!config) {
      // Check for partial matches (e.g., /blog/some-post matches /blog)
      for (const route of Object.keys(this.routeSeoConfig)) {
        if (path.startsWith(route) && route !== '/') {
          config = this.routeSeoConfig[route];
          break;
        }
      }
    }

    // Default to home config if no match found
    if (!config) {
      config = this.routeSeoConfig['/home'];
    }

    this.updateSeoTags({
      ...config,
      url: `${this.baseUrl}${path}`
    });
  }

  updateSeoTags(config: SeoConfig): void {
    // Update title
    this.title.setTitle(config.title);

    // Update meta tags
    this.updateMetaTag('description', config.description);
    this.updateMetaTag('keywords', config.keywords || '');
    this.updateMetaTag('robots', 'index, follow');
    this.updateMetaTag('author', 'Compliance Chimp');

    // Open Graph tags
    this.updateMetaProperty('og:title', config.title);
    this.updateMetaProperty('og:description', config.description);
    this.updateMetaProperty('og:url', config.url || this.baseUrl);
    this.updateMetaProperty('og:image', config.image || this.defaultImage);
    this.updateMetaProperty('og:type', config.type || 'website');
    this.updateMetaProperty('og:site_name', this.siteName);

    // Twitter Card tags
    this.updateMetaTag('twitter:card', config.type === 'article' ? 'summary_large_image' : 'summary');
    this.updateMetaTag('twitter:title', config.title);
    this.updateMetaTag('twitter:description', config.description);
    this.updateMetaTag('twitter:image', config.image || this.defaultImage);
    this.updateMetaTag('twitter:url', config.url || this.baseUrl);
    this.updateMetaTag('twitter:site', '@compliancechimp');

    // Update canonical URL
    this.updateCanonicalUrl(config.url || this.baseUrl);
  }

  private updateMetaTag(name: string, content: string): void {
    if (content) {
      this.meta.updateTag({ name, content });
    }
  }

  private updateMetaProperty(property: string, content: string): void {
    if (content) {
      this.meta.updateTag({ property, content });
    }
  }

  private updateCanonicalUrl(url: string): void {
    if (isPlatformBrowser(this.platformId)) {
      let link: HTMLLinkElement | null = this.document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = this.document.createElement('link');
        link.setAttribute('rel', 'canonical');
        this.document.head.appendChild(link);
      }
      link.setAttribute('href', url);
    }
  }

  // Method to set custom SEO for dynamic pages (like blog posts)
  setCustomSeo(config: Partial<SeoConfig>): void {
    const fullConfig: SeoConfig = {
      title: config.title || 'Compliance Chimp',
      description: config.description || 'OSHA compliance and safety training for small businesses.',
      keywords: config.keywords,
      image: config.image || this.defaultImage,
      url: config.url,
      type: config.type
    };
    this.updateSeoTags(fullConfig);
  }
}
