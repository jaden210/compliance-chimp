import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { trigger, transition, style, animate } from "@angular/animations";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { ChallengeService } from "../challenge.service";
import { ChimpFactCardComponent } from "../chimp-fact-card/chimp-fact-card.component";
import { ChallengeTimerComponent } from "../challenge-timer/challenge-timer.component";
import { Firestore, doc, onSnapshot } from "@angular/fire/firestore";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { AnalyticsService, FunnelStep } from "../../shared/analytics.service";

interface ProgressInfo {
  currentAction: string;
  inspectionsCreated?: number;
  trainingsCreated?: number;
  total?: number;
}

interface LogEntry {
  id: number;
  type: 'info' | 'success' | 'working';
  source: 'inspection' | 'training';
  message: string;
  timestamp: Date;
}

interface QueuedLogEntry {
  type: 'info' | 'success' | 'working';
  source: 'inspection' | 'training';
  message: string;
  timestamp: string;
  order?: number;
}

@Component({
  standalone: true,
  selector: "challenge-step4",
  templateUrl: "./step4.component.html",
  styleUrls: ["./step4.component.scss"],
  animations: [
    trigger('logEntryAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-20px) scale(0.95)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ])
    ])
  ],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    ChimpFactCardComponent,
    ChallengeTimerComponent
  ]
})
export class Step4Component implements OnInit, OnDestroy {
  // Build state
  buildStarted = false;
  
  // Progress tracking
  inspectionProgress: ProgressInfo | null = null;
  trainingProgress: ProgressInfo | null = null;
  inspectionComplete = false;
  trainingComplete = false;
  
  // Activity log — stored newest-first so no reversal getter is needed in the template
  activityLog: LogEntry[] = [];
  // Maintained list of recently created item names for the chimp fact card context
  recentActivityItems: string[] = [];
  
  // Track processed log queue entries to avoid duplicates
  private processedLogMessages = new Set<string>();
  private logQueueBuffer: QueuedLogEntry[] = [];
  private isProcessingLogQueue = false;
  private drainTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private dryRunTimeoutIds: ReturnType<typeof setTimeout>[] = [];
  private destroyed = false;
  private logEntryIdCounter = 0;
  
  // Firestore unsubscribe functions
  private unsubscribeProgress: (() => void) | null = null;

  constructor(
    public challengeService: ChallengeService,
    private router: Router,
    private db: Firestore,
    private functions: Functions,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Track step 4 view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP4_VIEW);
    
    // Check if there's an existing build in progress (e.g., page refresh)
    this.checkExistingBuildProgress();
  }
  
  private async checkExistingBuildProgress(): Promise<void> {
    if (!this.challengeService.teamId || this.challengeService.isDryRun) return;
    
    // Check team document for existing build progress
    const teamRef = doc(this.db, `team/${this.challengeService.teamId}`);
    
    // One-time read to check current state
    const unsubscribe = onSnapshot(teamRef, (snapshot) => {
      const data = snapshot.data();
      if (data?.autoBuildProgress) {
        const progress = data.autoBuildProgress;
        
        // If there's progress data, the build was started
        if (progress.inspections || progress.trainings) {
          this.buildStarted = true;
          
          // Resume timer if not complete
          const inspComplete = progress.inspections?.complete;
          const trainComplete = progress.trainings?.complete;
          
          if (!inspComplete || !trainComplete) {
            // Build is still in progress, resume listening
            this.listenForProgress();
            
            // Resume timer if it was started
            if (this.challengeService.isTimerStarted) {
              this.challengeService.resumeTimer();
            }
          } else {
            // Build is complete, just update the state
            this.inspectionComplete = true;
            this.trainingComplete = true;
            this.inspectionProgress = {
              currentAction: 'Complete',
              inspectionsCreated: progress.inspections?.created || 0
            };
            this.trainingProgress = {
              currentAction: 'Complete',
              trainingsCreated: progress.trainings?.created || 0
            };
          }
        }
      }
      
      // Unsubscribe after initial check - listenForProgress will handle ongoing updates
      unsubscribe();
    });
  }
  
  startBuild(): void {
    if (this.buildStarted) return;
    
    this.buildStarted = true;
    
    // Start timer when build begins - the Chimp is now on the clock
    this.challengeService.startTimer();
    
    // Dry run: simulate the build process with fake progress
    if (this.challengeService.isDryRun) {
      this.simulateDryRunBuild();
      return;
    }
    
    // Start the auto-build process
    this.startAutoBuild();
  }

  // Dry run: simulate the build process with fake progress and log entries
  private simulateDryRunBuild(): void {
    console.log('[DRY RUN] Simulating auto-build process');
    
    this.addLogEntry('info', 'inspection', 'Starting inspection builder...');
    this.addLogEntry('info', 'training', 'Starting training builder...');
    
    this.inspectionProgress = { currentAction: 'Analyzing team roles...', inspectionsCreated: 0 };
    this.trainingProgress = { currentAction: 'Analyzing team roles...', trainingsCreated: 0, total: 8 };
    
    const steps = [
      { delay: 800, action: () => {
        this.inspectionProgress = { currentAction: 'Creating inspection checklists...', inspectionsCreated: 2 };
        this.addLogEntry('working', 'inspection', 'Generating safety inspection checklists...');
      }},
      { delay: 1200, action: () => {
        this.inspectionProgress = { currentAction: 'Creating inspection checklists...', inspectionsCreated: 5 };
        this.addLogEntry('success', 'inspection', 'Created: Workplace Safety Checklist');
      }},
      { delay: 800, action: () => {
        this.trainingProgress = { currentAction: 'Generating training content...', trainingsCreated: 2, total: 8 };
        this.addLogEntry('working', 'training', 'Generating training articles...');
      }},
      { delay: 1000, action: () => {
        this.inspectionProgress = { currentAction: 'Complete', inspectionsCreated: 8 };
        this.inspectionComplete = true;
        this.addLogEntry('success', 'inspection', 'Completed 8 inspections');
      }},
      { delay: 1200, action: () => {
        this.trainingProgress = { currentAction: 'Generating training content...', trainingsCreated: 5, total: 8 };
        this.addLogEntry('success', 'training', 'Created: Hazard Communication Training');
      }},
      { delay: 1000, action: () => {
        this.trainingProgress = { currentAction: 'Generating training content...', trainingsCreated: 7, total: 8 };
        this.addLogEntry('success', 'training', 'Created: PPE Requirements Training');
      }},
      { delay: 800, action: () => {
        this.trainingProgress = { currentAction: 'Complete', trainingsCreated: 8, total: 8 };
        this.trainingComplete = true;
        this.addLogEntry('success', 'training', 'Completed 8 training articles');
        this.challengeService.stopTimer();
      }}
    ];
    
    let cumulativeDelay = 0;
    for (const step of steps) {
      cumulativeDelay += step.delay;
      this.dryRunTimeoutIds.push(setTimeout(() => {
        if (!this.destroyed) step.action();
      }, cumulativeDelay));
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.unsubscribeProgress) {
      this.unsubscribeProgress();
    }
    if (this.drainTimeoutId !== null) {
      clearTimeout(this.drainTimeoutId);
      this.drainTimeoutId = null;
    }
    this.dryRunTimeoutIds.forEach(id => clearTimeout(id));
    this.dryRunTimeoutIds = [];
    this.logQueueBuffer = [];
    this.isProcessingLogQueue = false;
  }

  private startAutoBuild(): void {
    if (!this.challengeService.teamId) {
      console.error('No team ID available');
      return;
    }

    // Add initial log entries
    this.addLogEntry('info', 'inspection', 'Starting inspection builder...');
    this.addLogEntry('info', 'training', 'Starting training builder...');

    // Listen for progress updates via Firestore
    this.listenForProgress();

    // Trigger the auto-build cloud function (don't await - progress tracked via Firestore)
    const autoBuild = httpsCallable(this.functions, 'autoBuildCompliance');
    autoBuild({ teamId: this.challengeService.teamId }).catch(err => {
      // Only log client-side errors - the function may still be running
      // and progress is tracked via Firestore snapshots
      console.warn('Auto-build call returned error (function may still be running):', err);
    });
  }

  private listenForProgress(): void {
    if (!this.challengeService.teamId) return;

    // Listen to team document for build progress
    const teamRef = doc(this.db, `team/${this.challengeService.teamId}`);
    
    this.unsubscribeProgress = onSnapshot(teamRef, (snapshot) => {
      const data = snapshot.data();
      if (data?.autoBuildProgress) {
        const progress = data.autoBuildProgress;
        
        // Process log queue entries - these come in from parallel async operations
        if (progress.logQueue && Array.isArray(progress.logQueue)) {
          this.processLogQueue(progress.logQueue);
        }
        
        // Update inspection progress
        if (progress.inspections) {
          this.inspectionProgress = {
            currentAction: progress.inspections.currentAction || 'Processing...',
            inspectionsCreated: progress.inspections.created || 0
          };
          
          if (progress.inspections.complete && !this.inspectionComplete) {
            this.inspectionComplete = true;
            this.addLogEntry('success', 'inspection', `Completed ${progress.inspections.created || 0} inspections`);
            
            // Stop timer when build is complete
            if (this.trainingComplete) {
              this.challengeService.stopTimer();
            }
          }
        }
        
        // Update training progress
        if (progress.trainings) {
          this.trainingProgress = {
            currentAction: progress.trainings.currentAction || 'Processing...',
            trainingsCreated: progress.trainings.created || 0,
            total: progress.trainings.total
          };
          
          if (progress.trainings.complete && !this.trainingComplete) {
            this.trainingComplete = true;
            this.addLogEntry('success', 'training', `Completed ${progress.trainings.created || 0} training articles`);
            
            // Stop timer when build is complete
            if (this.inspectionComplete) {
              this.challengeService.stopTimer();
            }
            
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
  
  // Process log queue entries with staggered timing for smooth UX
  private processLogQueue(queue: QueuedLogEntry[]): void {
    // Find new entries we haven't processed yet
    const newEntries = queue.filter(entry => {
      const key = `${entry.source}-${entry.message}-${entry.timestamp}`;
      return !this.processedLogMessages.has(key);
    });
    
    if (newEntries.length === 0) return;
    
    // Sort by order/timestamp to maintain sequence
    newEntries.sort((a, b) => {
      const orderA = a.order || new Date(a.timestamp).getTime();
      const orderB = b.order || new Date(b.timestamp).getTime();
      return orderA - orderB;
    });
    
    // Add new entries to buffer
    this.logQueueBuffer.push(...newEntries);
    
    // Mark as processed
    newEntries.forEach(entry => {
      const key = `${entry.source}-${entry.message}-${entry.timestamp}`;
      this.processedLogMessages.add(key);
    });
    
    // Start processing buffer if not already running
    if (!this.isProcessingLogQueue) {
      this.drainLogBuffer();
    }
  }
  
  // Drain the log buffer with staggered timing for natural feel
  private drainLogBuffer(): void {
    this.drainTimeoutId = null;

    if (this.destroyed || this.logQueueBuffer.length === 0) {
      this.isProcessingLogQueue = false;
      return;
    }
    
    this.isProcessingLogQueue = true;
    
    // Take next entry from buffer
    const entry = this.logQueueBuffer.shift()!;
    
    // Add to activity log newest-first
    const logEntry: LogEntry = {
      id: ++this.logEntryIdCounter,
      type: entry.type,
      source: entry.source,
      message: entry.message,
      timestamp: new Date(entry.timestamp)
    };
    this.activityLog.unshift(logEntry);
    const createdMatch = entry.message.match(/Created:\s*(.+)/);
    if (createdMatch) {
      this.recentActivityItems = [...this.recentActivityItems, createdMatch[1].trim()].slice(-12);
    }
    
    // Stagger next entry with 500ms delay for readable pacing
    this.drainTimeoutId = setTimeout(() => this.drainLogBuffer(), 500);
  }
  
  // Determine log entry type based on action text
  private getLogTypeForAction(action: string): 'info' | 'success' | 'working' {
    if (action.startsWith('Created:')) {
      return 'success';
    } else if (action.startsWith('Generating:') || action.startsWith('Creating ') || action.includes('...')) {
      return 'working';
    } else if (action.startsWith('Analyzing') || action.startsWith('Identifying')) {
      return 'info';
    }
    return 'working';
  }

  private addLogEntry(type: 'info' | 'success' | 'working', source: 'inspection' | 'training', message: string): void {
    this.activityLog.unshift({
      id: ++this.logEntryIdCounter,
      type,
      source,
      message,
      timestamp: new Date()
    });
    const createdMatch = message.match(/Created:\s*(.+)/);
    if (createdMatch) {
      this.recentActivityItems = [...this.recentActivityItems, createdMatch[1].trim()].slice(-12);
    }
  }


  get isComplete(): boolean {
    return this.inspectionComplete && this.trainingComplete;
  }

  getOverallProgress(): number {
    // Inspections are fast (Firestore writes only) - 20% of progress
    // Trainings involve AI generation and are slower - 80% of progress
    const expectedInspections = 10;
    // Use actual total from backend if available, otherwise use expected
    const expectedTrainings = this.trainingProgress?.total || 12;
    
    let inspectionProgress = 0;
    if (this.inspectionComplete) {
      inspectionProgress = 20;
    } else if (this.inspectionProgress) {
      // Progress based on items created
      const created = this.inspectionProgress.inspectionsCreated || 0;
      // 2% for starting, up to 18% for items created (before complete flag)
      inspectionProgress = 2 + Math.min(18, (created / expectedInspections) * 18);
    }
    
    let trainingProgress = 0;
    if (this.trainingComplete) {
      trainingProgress = 80;
    } else if (this.trainingProgress) {
      // Progress based on items created
      const created = this.trainingProgress.trainingsCreated || 0;
      // 2% for starting, up to 78% for items created (before complete flag)
      trainingProgress = 2 + Math.min(78, (created / expectedTrainings) * 78);
    }
    
    return Math.round(inspectionProgress + trainingProgress);
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
    
    // Track step 4 completion
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP4_COMPLETE, {
      inspections_created: this.inspectionProgress?.inspectionsCreated || 0,
      trainings_created: this.trainingProgress?.trainingsCreated || 0
    });
    
    this.router.navigate(['/get-started/complete']);
  }

  goBack(): void {
    this.router.navigate(['/get-started/step3']);
  }
}
