import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { Auth } from "@angular/fire/auth";
import { signOut } from "firebase/auth";
import { ChallengeService } from "../challenge.service";
import { ChimpFactCardComponent } from "../chimp-fact-card/chimp-fact-card.component";
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
    ChimpFactCardComponent
  ]
})
export class CompleteComponent implements OnInit {
  finalTime = '0:00';
  isDryRun = false;

  constructor(
    public challengeService: ChallengeService,
    private router: Router,
    private auth: Auth,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    this.isDryRun = this.challengeService.isDryRun;
    
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

  async finish(): Promise<void> {
    if (this.isDryRun) {
      await signOut(this.auth);
    }
    
    // Clear the challenge state
    this.challengeService.reset();
    
    if (this.isDryRun) {
      // Dry run: loop back to the start of the onboarding flow
      this.router.navigate(['/get-started/welcome']);
      return;
    }
    
    // Navigate to account dashboard
    this.router.navigate(['/account']);
  }
}
