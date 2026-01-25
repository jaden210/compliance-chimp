import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { ChallengeService } from "../challenge.service";
import { Firestore, doc, onSnapshot } from "@angular/fire/firestore";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { AnalyticsService, FunnelStep } from "../../shared/analytics.service";

interface ProgressInfo {
  currentAction: string;
  inspectionsCreated?: number;
  trainingsCreated?: number;
}

interface LogEntry {
  type: 'info' | 'success' | 'working';
  source: 'inspection' | 'training';
  message: string;
  timestamp: Date;
}

@Component({
  standalone: true,
  selector: "challenge-step4",
  templateUrl: "./step4.component.html",
  styleUrls: ["./step4.component.scss"],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule
  ]
})
export class Step4Component implements OnInit, OnDestroy {
  // Progress tracking
  inspectionProgress: ProgressInfo | null = null;
  trainingProgress: ProgressInfo | null = null;
  inspectionComplete = false;
  trainingComplete = false;
  
  // Activity log
  activityLog: LogEntry[] = [];
  
  // Firestore unsubscribe functions
  private unsubscribeInspection: (() => void) | null = null;
  private unsubscribeTraining: (() => void) | null = null;

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private db: Firestore,
    private functions: Functions,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Track step 4 view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP4_VIEW);
    
    // Pause timer during auto-build
    this.challengeService.pauseTimer();
    
    // Start the auto-build process
    this.startAutoBuild();
  }

  ngOnDestroy(): void {
    // Clean up Firestore listeners
    if (this.unsubscribeInspection) {
      this.unsubscribeInspection();
    }
    if (this.unsubscribeTraining) {
      this.unsubscribeTraining();
    }
  }

  private async startAutoBuild(): Promise<void> {
    if (!this.challengeService.teamId) {
      console.error('No team ID available');
      return;
    }

    // Add initial log entries
    this.addLogEntry('info', 'inspection', 'Starting inspection builder...');
    this.addLogEntry('info', 'training', 'Starting training builder...');

    // Listen for progress updates
    this.listenForProgress();

    // Trigger the auto-build cloud function
    try {
      const autoBuild = httpsCallable(this.functions, 'challenge-autoBuildCompliance');
      await autoBuild({ teamId: this.challengeService.teamId });
    } catch (err) {
      console.error('Error starting auto-build:', err);
      this.addLogEntry('info', 'inspection', 'Error starting build process');
    }
  }

  private listenForProgress(): void {
    if (!this.challengeService.teamId) return;

    // Listen to team document for build progress
    const teamRef = doc(this.db, `team/${this.challengeService.teamId}`);
    
    this.unsubscribeInspection = onSnapshot(teamRef, (snapshot) => {
      const data = snapshot.data();
      if (data?.autoBuildProgress) {
        const progress = data.autoBuildProgress;
        
        // Update inspection progress
        if (progress.inspections) {
          const prev = this.inspectionProgress;
          this.inspectionProgress = {
            currentAction: progress.inspections.currentAction || 'Processing...',
            inspectionsCreated: progress.inspections.created || 0
          };
          
          if (progress.inspections.currentAction && prev?.currentAction !== progress.inspections.currentAction) {
            this.addLogEntry('working', 'inspection', progress.inspections.currentAction);
          }
          
          if (progress.inspections.complete && !this.inspectionComplete) {
            this.inspectionComplete = true;
            this.addLogEntry('success', 'inspection', `Created ${progress.inspections.created || 0} inspections`);
          }
        }
        
        // Update training progress
        if (progress.trainings) {
          const prev = this.trainingProgress;
          this.trainingProgress = {
            currentAction: progress.trainings.currentAction || 'Processing...',
            trainingsCreated: progress.trainings.created || 0
          };
          
          if (progress.trainings.currentAction && prev?.currentAction !== progress.trainings.currentAction) {
            this.addLogEntry('working', 'training', progress.trainings.currentAction);
          }
          
          if (progress.trainings.complete && !this.trainingComplete) {
            this.trainingComplete = true;
            this.addLogEntry('success', 'training', `Created ${progress.trainings.created || 0} trainings`);
            
            // Track auto-build completion
            this.analytics.trackEvent('challenge_auto_build_complete', {
              event_category: 'challenge',
              inspections_created: progress.inspections?.created || 0,
              trainings_created: progress.trainings?.created || 0
            });
          }
        }
      }
    });
  }

  private addLogEntry(type: 'info' | 'success' | 'working', source: 'inspection' | 'training', message: string): void {
    this.activityLog.push({
      type,
      source,
      message,
      timestamp: new Date()
    });
  }

  get activityLogReversed(): LogEntry[] {
    return [...this.activityLog].reverse();
  }

  get isComplete(): boolean {
    return this.inspectionComplete && this.trainingComplete;
  }

  getOverallProgress(): number {
    let progress = 0;
    if (this.inspectionComplete) progress += 50;
    else if (this.inspectionProgress) progress += 25;
    
    if (this.trainingComplete) progress += 50;
    else if (this.trainingProgress) progress += 25;
    
    return progress;
  }

  getLogIcon(type: string): string {
    switch (type) {
      case 'success': return 'check_circle';
      case 'working': return 'sync';
      case 'info': 
      default: return 'info';
    }
  }

  next(): void {
    if (!this.isComplete) return;
    
    // Resume timer
    this.challengeService.resumeTimer();
    
    // Track step 4 completion
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP4_COMPLETE, {
      inspections_created: this.inspectionProgress?.inspectionsCreated || 0,
      trainings_created: this.trainingProgress?.trainingsCreated || 0
    });
    
    this.router.navigate(['/get-started/complete']);
  }

  goBack(): void {
    this.challengeService.resumeTimer();
    this.router.navigate(['/get-started/step3']);
  }
}
