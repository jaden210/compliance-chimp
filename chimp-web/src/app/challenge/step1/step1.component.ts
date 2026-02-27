import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatDialog, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { TextFieldModule } from "@angular/cdk/text-field";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Subject, Subscription, debounceTime } from "rxjs";
import { trigger, transition, style, animate } from "@angular/animations";
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
    MatIconModule,
    MatProgressBarModule,
    MatDialogModule,
    TextFieldModule
  ],
  animations: [
    trigger('overlayFade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('chimpPop', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.8) translateY(20px)' }),
        animate('400ms 200ms ease-out', style({ opacity: 1, transform: 'scale(1) translateY(0)' }))
      ])
    ]),
    trigger('factReveal', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('350ms 500ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class Step1Component implements OnInit, OnDestroy {
  businessName = '';
  businessWebsite = '';
  industry = '';

  // Industry suggestion state
  industrySuggestion: string | null = null;
  isSuggestingIndustry = false;
  suggestionDismissed = false;
  private industryTrigger$ = new Subject<void>();
  private triggerSub?: Subscription;
  private lastSuggestionInputs = '';

  // Interstitial overlay state
  showOverlay = false;
  overlayFact: string | null = null;
  overlayProgress = 0;
  private overlayTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private factPollInterval: ReturnType<typeof setInterval> | null = null;

  // Pre-fetched chimp fact
  private prefetchedFact: string | null = null;
  private isFetchingFact = false;
  private factTrigger$ = new Subject<void>();
  private factTriggerSub?: Subscription;
  private lastFactInputs = '';

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private route: ActivatedRoute,
    private analytics: AnalyticsService,
    private functions: Functions,
    private dialog: MatDialog
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

    // Set up debounced industry suggestion trigger
    this.triggerSub = this.industryTrigger$
      .pipe(debounceTime(600))
      .subscribe(() => this.fetchIndustrySuggestion());

    // Set up debounced chimp fact pre-fetch (fires when industry is set)
    this.factTriggerSub = this.factTrigger$
      .pipe(debounceTime(1500))
      .subscribe(() => this.prefetchChimpFact());

    // If industry is already set (returning to step), pre-fetch immediately
    if (this.industry?.trim()?.length >= 3) {
      this.prefetchChimpFact();
    }
    
    // Track step 1 view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP1_VIEW);
  }

  ngOnDestroy(): void {
    this.triggerSub?.unsubscribe();
    this.factTriggerSub?.unsubscribe();
    if (this.overlayTimer) clearTimeout(this.overlayTimer);
    if (this.progressTimer) clearInterval(this.progressTimer);
    if (this.factPollInterval) clearInterval(this.factPollInterval);
  }

  onBusinessNameChange(): void {
    this.triggerIndustrySuggestion();
  }

  onBusinessWebsiteChange(): void {
    this.triggerIndustrySuggestion();
  }

  private triggerIndustrySuggestion(): void {
    // Only trigger if we have a company name and user hasn't already typed an industry
    if (!this.businessName?.trim() || this.businessName.trim().length < 2) {
      this.industrySuggestion = null;
      return;
    }

    // Don't re-fetch if inputs haven't changed
    const currentInputs = `${this.businessName.trim()}|${this.businessWebsite?.trim() || ''}`;
    if (currentInputs === this.lastSuggestionInputs) return;

    // Reset dismissed state when inputs change
    this.suggestionDismissed = false;
    this.industryTrigger$.next();
  }

  private async fetchIndustrySuggestion(): Promise<void> {
    const companyName = this.businessName?.trim();
    if (!companyName || companyName.length < 2) return;

    const currentInputs = `${companyName}|${this.businessWebsite?.trim() || ''}`;
    this.lastSuggestionInputs = currentInputs;
    this.isSuggestingIndustry = true;

    try {
      const suggestIndustry = httpsCallable(this.functions, 'suggestIndustryDescription');
      const result: any = await suggestIndustry({
        companyName,
        businessWebsite: this.businessWebsite?.trim() || ''
      });

      // Only apply if inputs haven't changed while we were waiting
      const latestInputs = `${this.businessName?.trim()}|${this.businessWebsite?.trim() || ''}`;
      if (latestInputs !== currentInputs) return;

      if (result.data?.suggestion) {
        this.industrySuggestion = result.data.suggestion;
      } else {
        this.industrySuggestion = null;
      }
    } catch (err) {
      console.error('Error fetching industry suggestion:', err);
      this.industrySuggestion = null;
    } finally {
      this.isSuggestingIndustry = false;
    }
  }

  onIndustryChange(): void {
    this.triggerFactPrefetch();
  }

  applySuggestion(): void {
    if (this.industrySuggestion) {
      this.industry = this.industrySuggestion;
      this.industrySuggestion = null;
      this.triggerFactPrefetch();
    }
  }

  dismissSuggestion(): void {
    this.industrySuggestion = null;
    this.suggestionDismissed = true;
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
    
    // Show interstitial overlay with chimp fact before navigating
    this.showInterstitial();
  }

  private triggerFactPrefetch(): void {
    if (!this.industry?.trim() || this.industry.trim().length < 3) return;

    const currentInputs = `${this.businessName?.trim() || ''}|${this.businessWebsite?.trim() || ''}|${this.industry.trim()}`;
    if (currentInputs === this.lastFactInputs) return;

    this.factTrigger$.next();
  }

  private async prefetchChimpFact(): Promise<void> {
    const industry = this.industry?.trim();
    if (!industry || industry.length < 3) return;

    const currentInputs = `${this.businessName?.trim() || ''}|${this.businessWebsite?.trim() || ''}|${industry}`;
    this.lastFactInputs = currentInputs;
    this.isFetchingFact = true;

    try {
      const getChimpFact = httpsCallable(this.functions, 'getChimpFact');
      const result: any = await getChimpFact({
        businessName: this.businessName?.trim() || '',
        businessWebsite: this.businessWebsite?.trim() || '',
        industry,
        jobTitles: [],
        contextHint: "They just entered their business info and are about to create their account. Reinforce why OSHA compliance matters for their specific industry. Make it hit home."
      });

      // Only use if inputs haven't changed while we were waiting
      const latestInputs = `${this.businessName?.trim() || ''}|${this.businessWebsite?.trim() || ''}|${this.industry?.trim()}`;
      if (latestInputs === currentInputs && result.data?.fact) {
        this.prefetchedFact = result.data.fact;
      }
    } catch (err) {
      console.error('Error pre-fetching chimp fact:', err);
    } finally {
      this.isFetchingFact = false;
    }
  }

  private showInterstitial(): void {
    // Use pre-fetched fact immediately if available
    this.overlayFact = this.prefetchedFact;
    this.showOverlay = true;
    this.overlayProgress = 0;

    // If we don't have a fact yet (still loading or never fetched), fetch now
    if (!this.overlayFact && !this.isFetchingFact) {
      this.prefetchChimpFact().then(() => {
        if (this.prefetchedFact) {
          this.overlayFact = this.prefetchedFact;
        }
      });
    } else if (!this.overlayFact && this.isFetchingFact) {
      // Wait for the in-flight fetch to finish
      this.factPollInterval = setInterval(() => {
        if (!this.isFetchingFact) {
          if (this.factPollInterval) clearInterval(this.factPollInterval);
          this.factPollInterval = null;
          if (this.prefetchedFact) {
            this.overlayFact = this.prefetchedFact;
          }
        }
      }, 200);
    }

    // Start progress animation (6 seconds)
    const duration = 6000;
    const interval = 40;
    let elapsed = 0;
    this.progressTimer = setInterval(() => {
      elapsed += interval;
      this.overlayProgress = Math.min(100, (elapsed / duration) * 100);
    }, interval);

    // Auto-advance after 4 seconds
    this.overlayTimer = setTimeout(() => {
      this.dismissOverlay();
    }, duration);
  }

  dismissOverlay(): void {
    if (this.progressTimer) clearInterval(this.progressTimer);
    if (this.overlayTimer) clearTimeout(this.overlayTimer);
    if (this.factPollInterval) clearInterval(this.factPollInterval);
    this.factPollInterval = null;
    this.showOverlay = false;
    this.router.navigate(['/get-started/step2']);
  }

  openWebsiteHelpDialog(): void {
    this.dialog.open(WebsiteHelpDialog, {
      width: '440px',
      maxWidth: '95vw'
    });
  }
}

@Component({
  standalone: true,
  selector: "website-help-dialog",
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">language</mat-icon>
      Why we ask for your website
    </h2>
    <mat-dialog-content>
      <p class="help-text">
        The more information we can gather, the better your safety program will be.
      </p>
      <p class="help-text">
        Knowing your website helps us understand who you are, what you do, and the types
        of hazards your team may face — so we can tailor your trainings, inspections, and
        surveys to your specific business.
      </p>
      <p class="help-text reassurance">
        If you don't have a website or prefer not to provide one, that's totally okay.
        We'll still build a great program based on the other information you provide.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" mat-dialog-close>Got it</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      padding: 16px 24px;
      font-size: 20px;
      font-weight: 500;
    }
    .title-icon {
      color: #054d8a;
    }
    mat-dialog-content {
      padding: 0 24px 16px;
    }
    .help-text {
      font-size: 14px;
      color: #555;
      margin: 0 0 12px 0;
      line-height: 1.6;
    }
    .help-text:last-child {
      margin-bottom: 0;
    }
    .help-text.reassurance {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 12px;
      color: #666;
      font-style: italic;
    }
  `],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class WebsiteHelpDialog {
  constructor(public dialogRef: MatDialogRef<WebsiteHelpDialog>) {}
}
