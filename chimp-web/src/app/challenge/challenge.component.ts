import { Component, OnInit, OnDestroy, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { ChallengeService } from "./challenge.service";
import { TimeoutDialogComponent } from "./timeout-dialog/timeout-dialog.component";
import { Subscription } from "rxjs";

const TOTAL_SECONDS = 360; // 6 minutes
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 54; // 2πr where r=54

@Component({
  standalone: true,
  selector: "app-challenge",
  templateUrl: "./challenge.component.html",
  styleUrls: ["./challenge.component.scss"],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule
  ]
})
export class ChallengeComponent implements OnInit, OnDestroy {
  timerDisplay = "6:00";
  isPaused = false;
  isComplete = false;
  timerColor = 'green';
  progressPercent = 100;
  private timeoutDialogShown = false;
  
  private subscriptions: Subscription[] = [];

  constructor(
    public challengeService: ChallengeService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    // Subscribe to timer updates
    this.subscriptions.push(
      this.challengeService.elapsedSeconds$.subscribe(() => {
        this.updateTimerDisplay();
        this.checkTimeout();
      }),
      this.challengeService.isPaused$.subscribe(paused => {
        this.isPaused = paused;
      }),
      this.challengeService.isComplete$.subscribe(complete => {
        this.isComplete = complete;
      })
    );
    
    this.updateTimerDisplay();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    // Pause timer when user leaves the page
    if (this.challengeService.isTimerStarted && !this.isComplete) {
      this.challengeService.pauseTimer();
    }
  }

  private updateTimerDisplay(): void {
    this.timerDisplay = this.challengeService.getTimerDisplay();
    
    const remaining = this.challengeService.getRemainingSeconds();
    this.progressPercent = (remaining / TOTAL_SECONDS) * 100;
    
    if (remaining > 180) {
      this.timerColor = 'green';
    } else if (remaining > 60) {
      this.timerColor = 'yellow';
    } else {
      this.timerColor = 'red';
    }
  }

  getStrokeDashoffset(): number {
    // Full circle = 0 offset, empty circle = full circumference offset
    const remaining = this.challengeService.getRemainingSeconds();
    const progress = remaining / TOTAL_SECONDS;
    return CIRCLE_CIRCUMFERENCE * (1 - progress);
  }

  private checkTimeout(): void {
    // Show timeout dialog when timer hits zero (but not if already complete or dialog shown)
    const remaining = this.challengeService.getRemainingSeconds();
    if (remaining <= 0 && !this.isComplete && !this.timeoutDialogShown && !this.isPaused) {
      this.timeoutDialogShown = true;
      this.dialog.open(TimeoutDialogComponent, {
        disableClose: true,
        panelClass: 'timeout-dialog-panel'
      });
    }
  }
}
