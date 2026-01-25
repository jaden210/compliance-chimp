import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterModule } from "@angular/router";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { ChallengeService } from "../challenge.service";
import { AppService } from "../../app.service";
import { AnalyticsService, FunnelStep } from "../../shared/analytics.service";

@Component({
  standalone: true,
  selector: "challenge-step2",
  templateUrl: "./step2.component.html",
  styleUrls: ["./step2.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule
  ]
})
export class Step2Component implements OnInit {
  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  agreedToTerms = false;
  
  isLoading = false;
  errorMessage = '';
  hidePassword = true;
  hideConfirmPassword = true;

  constructor(
    public challengeService: ChallengeService,
    private appService: AppService,
    private router: Router,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Load any previously entered data
    this.name = this.challengeService.name;
    this.email = this.challengeService.email;
    
    // Track step 2 view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP2_VIEW);
    
    // Resume timer if it was paused
    if (this.challengeService.isTimerStarted) {
      this.challengeService.resumeTimer();
    }
  }

  isValid(): boolean {
    return !!(
      this.name?.trim() &&
      this.email?.trim() &&
      this.isValidEmail(this.email) &&
      this.password?.length >= 6 &&
      this.password === this.confirmPassword &&
      this.agreedToTerms
    );
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async createAccount(): Promise<void> {
    if (!this.isValid() || this.isLoading) return;
    
    this.isLoading = true;
    this.errorMessage = '';
    
    try {
      // Check if user already exists
      const isExisting = await this.appService.checkForExistingUser(this.email);
      if (isExisting) {
        this.errorMessage = 'An account with this email already exists. Please sign in.';
        this.isLoading = false;
        return;
      }
      
      // Store user info
      this.challengeService.setUserInfo(this.name.trim(), this.email.trim().toLowerCase());
      
      // Create Firebase auth user
      const userCredential = await this.challengeService.createAuthUser(this.password);
      
      // Create team document
      const teamId = await this.challengeService.createTeam(userCredential.user.uid);
      
      // Create user document
      await this.challengeService.createUser(userCredential, teamId);
      
      // Track account creation - this is a key conversion!
      this.analytics.setUserId(userCredential.user.uid);
      this.analytics.setTeamId(teamId);
      this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_ACCOUNT_CREATED, {
        user_id: userCredential.user.uid,
        team_id: teamId,
        industry: this.challengeService.industry
      });
      
      // Navigate to next step
      this.router.navigate(['/get-started/step3']);
      
    } catch (error: any) {
      console.error('Error creating account:', error);
      this.errorMessage = this.getErrorMessage(error);
      this.analytics.trackError('account_creation', error?.code || error?.message || 'Unknown error');
      this.isLoading = false;
    }
  }

  private getErrorMessage(error: any): string {
    if (error?.code === 'auth/email-already-in-use') {
      return 'An account with this email already exists.';
    }
    if (error?.code === 'auth/invalid-email') {
      return 'Please enter a valid email address.';
    }
    if (error?.code === 'auth/weak-password') {
      return 'Password must be at least 6 characters.';
    }
    return error?.message || 'An error occurred. Please try again.';
  }

  goBack(): void {
    this.router.navigate(['/get-started/step1']);
  }
}
