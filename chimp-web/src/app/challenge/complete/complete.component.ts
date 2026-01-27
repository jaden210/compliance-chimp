import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ChallengeService } from "../challenge.service";
import { AnalyticsService, FunnelStep } from "../../shared/analytics.service";

@Component({
  standalone: true,
  selector: "challenge-complete",
  templateUrl: "./complete.component.html",
  styleUrls: ["./complete.component.scss"],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class CompleteComponent implements OnInit {
  finalTime = '0:00';

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Stop the timer
    this.challengeService.stopTimer();
    
    // Get final time
    this.finalTime = this.challengeService.getFinalTimeDisplay();
    
    // Track the challenge completion - this is a key conversion!
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_COMPLETE, {
      final_time: this.finalTime,
      completion_time_seconds: this.challengeService.getElapsedSeconds()
    });
  }

  finish(): void {
    // Clear the challenge state
    this.challengeService.reset();
    
    // Navigate to account dashboard
    this.router.navigate(['/account']);
  }
}
