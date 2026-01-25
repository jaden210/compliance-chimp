import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ChallengeService } from "../challenge.service";
import { Clipboard } from "@angular/cdk/clipboard";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { AnalyticsService, FunnelStep } from "../../shared/analytics.service";

@Component({
  standalone: true,
  selector: "challenge-complete",
  templateUrl: "./complete.component.html",
  styleUrls: ["./complete.component.scss"],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule
  ]
})
export class CompleteComponent implements OnInit {
  finalTime = '0:00';
  beatTimer = false;
  couponCode = '';
  couponMonths = 0;
  
  // Coupon codes - these should match what's created in Stripe
  private readonly WINNER_COUPON = 'CHIMP2MONTHS';
  private readonly CONSOLATION_COUPON = 'CHIMP1MONTH';

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private clipboard: Clipboard,
    private snackBar: MatSnackBar,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Stop the timer
    this.challengeService.stopTimer();
    
    // Get final time
    this.finalTime = this.challengeService.getFinalTimeDisplay();
    this.beatTimer = this.challengeService.didBeatTimer();
    
    // Set coupon based on result
    if (this.beatTimer) {
      this.couponCode = this.WINNER_COUPON;
      this.couponMonths = 2;
    } else {
      this.couponCode = this.CONSOLATION_COUPON;
      this.couponMonths = 1;
    }
    
    // Track the challenge completion - this is a key conversion!
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_COMPLETE, {
      final_time: this.finalTime,
      beat_timer: this.beatTimer,
      coupon_code: this.couponCode,
      coupon_months: this.couponMonths,
      completion_time_seconds: this.challengeService.getElapsedSeconds()
    });
  }

  copyCoupon(): void {
    this.clipboard.copy(this.couponCode);
    this.snackBar.open('Coupon code copied!', 'OK', {
      duration: 2000,
      horizontalPosition: 'center'
    });
  }

  finish(): void {
    // Clear the challenge state
    this.challengeService.reset();
    
    // Navigate to account dashboard
    this.router.navigate(['/account']);
  }
}
