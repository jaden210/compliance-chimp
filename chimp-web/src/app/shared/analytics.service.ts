import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

declare var gtag: Function;

// GA4 Measurement ID
const GA_MEASUREMENT_ID = 'G-JJR9XF3TVD';

// Conversion funnel step definitions
export enum FunnelStep {
  // Signup Funnel
  SIGNUP_PAGE_VIEW = 'signup_page_view',
  SIGNUP_EMAIL_ENTERED = 'signup_email_entered',
  SIGNUP_EMAIL_NEW_USER = 'signup_email_new_user',
  SIGNUP_EMAIL_EXISTING_USER = 'signup_email_existing_user',
  
  // Challenge Funnel (Get Started flow)
  CHALLENGE_START = 'challenge_start',
  CHALLENGE_STEP1_VIEW = 'challenge_step1_view',
  CHALLENGE_STEP1_COMPLETE = 'challenge_step1_complete',
  CHALLENGE_STEP2_VIEW = 'challenge_step2_view',
  CHALLENGE_ACCOUNT_CREATED = 'challenge_account_created',
  CHALLENGE_STEP3_VIEW = 'challenge_step3_view',
  CHALLENGE_QUICKBOOKS_CONNECTED = 'challenge_quickbooks_connected',
  CHALLENGE_TEAM_MEMBER_ADDED = 'challenge_team_member_added',
  CHALLENGE_STEP3_COMPLETE = 'challenge_step3_complete',
  CHALLENGE_STEP4_VIEW = 'challenge_step4_view',
  CHALLENGE_STEP4_COMPLETE = 'challenge_step4_complete',
  CHALLENGE_COMPLETE = 'challenge_complete',
  
  // Sign In
  SIGNIN_PAGE_VIEW = 'signin_page_view',
  SIGNIN_SUCCESS = 'signin_success',
  SIGNIN_PASSWORD_RESET = 'signin_password_reset',
  
  // Join Team
  JOIN_TEAM_PAGE_VIEW = 'join_team_page_view',
  JOIN_TEAM_COMPLETE = 'join_team_complete',
}

// User engagement events
export enum EngagementEvent {
  VIDEO_WATCHED = 'video_watched',
  CTA_CLICKED = 'cta_clicked',
  FEATURE_EXPLORED = 'feature_explored',
  PRICING_VIEWED = 'pricing_viewed',
  CONTACT_FORM_SUBMITTED = 'contact_form_submitted',
  HELP_ARTICLE_VIEWED = 'help_article_viewed',
  TRAINING_STARTED = 'training_started',
  TRAINING_COMPLETED = 'training_completed',
  SURVEY_COMPLETED = 'survey_completed',
  SELF_INSPECTION_COMPLETED = 'self_inspection_completed',
  INCIDENT_REPORT_CREATED = 'incident_report_created',
}

// Product interaction events
export enum ProductEvent {
  TEAM_MEMBER_INVITED = 'team_member_invited',
  TEAM_MEMBER_REMOVED = 'team_member_removed',
  FILE_UPLOADED = 'file_uploaded',
  SUBSCRIPTION_STARTED = 'subscription_started',
  SUBSCRIPTION_UPGRADED = 'subscription_upgraded',
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',
}

export interface EventParams {
  [key: string]: string | number | boolean | undefined | any[];
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private userId: string | null = null;
  private teamId: string | null = null;
  private isInitialized = false;

  constructor(private router: Router) {
    this.init();
  }

  private init(): void {
    if (this.isInitialized) return;
    
    // Track page views on route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.trackPageView(event.urlAfterRedirects);
    });

    this.isInitialized = true;
  }

  /**
   * Track page views for SPA navigation
   * Wrapped in try-catch to never break app functionality
   */
  trackPageView(pagePath: string, pageTitle?: string): void {
    try {
      if (typeof gtag === 'undefined') return;

      gtag('event', 'page_view', {
        page_path: pagePath,
        page_title: pageTitle || document.title,
        page_location: window.location.origin + pagePath
      });
    } catch (e) {
      // Silently fail - analytics should never break the app
      console.debug('Analytics page view error:', e);
    }
  }

  /**
   * Set user ID for cross-device tracking and attribution
   */
  setUserId(userId: string): void {
    try {
      this.userId = userId;
      if (typeof gtag === 'undefined') return;
      
      gtag('config', GA_MEASUREMENT_ID, {
        user_id: userId
      });
      
      // Also set as user property
      gtag('set', 'user_properties', {
        user_id: userId
      });
    } catch (e) {
      console.debug('Analytics setUserId error:', e);
    }
  }

  /**
   * Set team ID as a user property for segmentation
   */
  setTeamId(teamId: string): void {
    try {
      this.teamId = teamId;
      if (typeof gtag === 'undefined') return;
      
      gtag('set', 'user_properties', {
        team_id: teamId
      });
    } catch (e) {
      console.debug('Analytics setTeamId error:', e);
    }
  }

  /**
   * Set user properties for segmentation
   */
  setUserProperties(properties: { [key: string]: string | number | boolean }): void {
    try {
      if (typeof gtag === 'undefined') return;
      
      gtag('set', 'user_properties', properties);
    } catch (e) {
      console.debug('Analytics setUserProperties error:', e);
    }
  }

  /**
   * Clear user identification (on logout)
   */
  clearUser(): void {
    this.userId = null;
    this.teamId = null;
  }

  /**
   * Track a funnel step event
   */
  trackFunnelStep(step: FunnelStep, params?: EventParams): void {
    this.trackEvent(step, {
      event_category: 'funnel',
      funnel_step: step,
      ...params
    });
  }

  /**
   * Track signup funnel with complete attribution
   */
  trackSignupFunnel(step: FunnelStep, params?: EventParams): void {
    const funnelIndex = this.getSignupFunnelIndex(step);
    
    this.trackEvent(step, {
      event_category: 'signup_funnel',
      funnel_step: step,
      funnel_step_number: funnelIndex,
      ...params
    });

    // For key conversion points, also send as conversion
    if (step === FunnelStep.CHALLENGE_ACCOUNT_CREATED) {
      this.trackConversion('sign_up', params);
    } else if (step === FunnelStep.CHALLENGE_COMPLETE) {
      this.trackConversion('signup_complete', params);
    }
  }

  private getSignupFunnelIndex(step: FunnelStep): number {
    const funnelOrder: FunnelStep[] = [
      FunnelStep.SIGNUP_PAGE_VIEW,
      FunnelStep.SIGNUP_EMAIL_ENTERED,
      FunnelStep.CHALLENGE_START,
      FunnelStep.CHALLENGE_STEP1_VIEW,
      FunnelStep.CHALLENGE_STEP1_COMPLETE,
      FunnelStep.CHALLENGE_STEP2_VIEW,
      FunnelStep.CHALLENGE_ACCOUNT_CREATED,
      FunnelStep.CHALLENGE_STEP3_VIEW,
      FunnelStep.CHALLENGE_STEP3_COMPLETE,
      FunnelStep.CHALLENGE_STEP4_VIEW,
      FunnelStep.CHALLENGE_STEP4_COMPLETE,
      FunnelStep.CHALLENGE_COMPLETE
    ];
    return funnelOrder.indexOf(step) + 1;
  }

  /**
   * Track a conversion event (for key business goals)
   */
  trackConversion(conversionName: string, params?: EventParams): void {
    this.trackEvent(conversionName, {
      event_category: 'conversion',
      ...params
    });
  }

  /**
   * Track user engagement events
   */
  trackEngagement(event: EngagementEvent, params?: EventParams): void {
    this.trackEvent(event, {
      event_category: 'engagement',
      ...params
    });
  }

  /**
   * Track product usage events
   */
  trackProduct(event: ProductEvent, params?: EventParams): void {
    this.trackEvent(event, {
      event_category: 'product',
      ...params
    });
  }

  /**
   * Track CTA button clicks with attribution
   */
  trackCTA(ctaName: string, location: string, params?: EventParams): void {
    this.trackEvent('cta_click', {
      event_category: 'cta',
      cta_name: ctaName,
      cta_location: location,
      page_path: this.router.url,
      ...params
    });
  }

  /**
   * Track form interactions
   */
  trackFormInteraction(formName: string, action: 'start' | 'field_focus' | 'field_complete' | 'submit' | 'error', params?: EventParams): void {
    this.trackEvent('form_interaction', {
      event_category: 'form',
      form_name: formName,
      form_action: action,
      ...params
    });
  }

  /**
   * Track errors for debugging
   */
  trackError(errorType: string, errorMessage: string, params?: EventParams): void {
    this.trackEvent('error', {
      event_category: 'error',
      error_type: errorType,
      error_message: errorMessage.substring(0, 100), // Limit error message length
      page_path: this.router.url,
      ...params
    });
  }

  /**
   * Track timing for performance monitoring
   */
  trackTiming(category: string, variable: string, valueMs: number, label?: string): void {
    this.trackEvent('timing_complete', {
      event_category: category,
      name: variable,
      value: valueMs,
      event_label: label
    });
  }

  /**
   * Track scroll depth
   */
  trackScrollDepth(depth: 25 | 50 | 75 | 90 | 100): void {
    this.trackEvent('scroll', {
      event_category: 'engagement',
      percent_scrolled: depth,
      page_path: this.router.url
    });
  }

  /**
   * Track outbound link clicks
   */
  trackOutboundLink(url: string, linkText?: string): void {
    this.trackEvent('click', {
      event_category: 'outbound',
      link_url: url,
      link_text: linkText,
      page_path: this.router.url
    });
  }

  /**
   * Track search queries
   */
  trackSearch(searchTerm: string, resultsCount?: number): void {
    this.trackEvent('search', {
      search_term: searchTerm,
      results_count: resultsCount
    });
  }

  /**
   * Track video interactions
   */
  trackVideo(action: 'play' | 'pause' | 'complete' | 'progress', videoTitle: string, params?: EventParams): void {
    this.trackEvent(`video_${action}`, {
      event_category: 'video',
      video_title: videoTitle,
      ...params
    });
  }

  /**
   * Base event tracking method
   * Wrapped in try-catch to never break app functionality
   */
  trackEvent(eventName: string, params?: EventParams): void {
    try {
      if (typeof gtag === 'undefined') {
        // Silently skip if gtag not loaded
        return;
      }

      const eventParams: EventParams = {
        ...params,
        // Add timestamp for debugging
        event_timestamp: new Date().toISOString()
      };

      // Add user context if available
      if (this.userId) {
        eventParams.user_id = this.userId;
      }
      if (this.teamId) {
        eventParams.team_id = this.teamId;
      }

      gtag('event', eventName, eventParams);
    } catch (e) {
      // Silently fail - analytics should never break the app
      console.debug('Analytics event error:', e);
    }
  }

  /**
   * Track e-commerce purchase (for subscription conversions)
   */
  trackPurchase(transactionId: string, value: number, currency: string = 'USD', items?: any[]): void {
    try {
      if (typeof gtag === 'undefined') return;

      gtag('event', 'purchase', {
        transaction_id: transactionId,
        value: value,
        currency: currency,
        items: items
      });
    } catch (e) {
      console.debug('Analytics purchase error:', e);
    }
  }

  /**
   * Track subscription events
   */
  trackSubscription(action: 'begin_checkout' | 'add_payment_info' | 'purchase', plan: string, value: number): void {
    this.trackEvent(action, {
      event_category: 'ecommerce',
      currency: 'USD',
      value: value,
      items: [{
        item_id: plan,
        item_name: `${plan} Plan`,
        item_category: 'subscription',
        price: value,
        quantity: 1
      }]
    });
  }
}
