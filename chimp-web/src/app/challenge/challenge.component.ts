import { Component, OnInit, OnDestroy, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterModule, NavigationEnd } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { ChallengeService } from "./challenge.service";
import { Subscription, filter } from "rxjs";

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
    MatButtonModule
  ]
})
export class ChallengeComponent implements OnInit, OnDestroy {
  timerDisplay = "0:00";
  isPaused = false;
  isComplete = false;
  timerColor = 'green';
  progressPercent = 0;
  isOnStep3 = false;
  
  private subscriptions: Subscription[] = [];

  constructor(
    public challengeService: ChallengeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Track current route to hide timer during team building (step3)
    this.checkCurrentRoute(this.router.url);
    this.subscriptions.push(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd)
      ).subscribe(event => {
        this.checkCurrentRoute(event.urlAfterRedirects);
      })
    );
    
    // Subscribe to timer updates
    this.subscriptions.push(
      this.challengeService.elapsedSeconds$.subscribe(() => {
        this.updateTimerDisplay();
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

  private checkCurrentRoute(url: string): void {
    this.isOnStep3 = url.includes('/step3');
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
    
    const elapsed = this.challengeService.getElapsedSeconds();
    this.progressPercent = (elapsed / TOTAL_SECONDS) * 100;
    
    // Color based on elapsed time: green when plenty of time, yellow getting close, red running out
    if (elapsed < 180) {
      this.timerColor = 'green';  // Less than 3 minutes elapsed
    } else if (elapsed < 300) {
      this.timerColor = 'yellow'; // 3-5 minutes elapsed
    } else {
      this.timerColor = 'red';    // More than 5 minutes elapsed
    }
  }

  getStrokeDashoffset(): number {
    // Empty circle = full circumference offset, full circle = 0 offset
    // Circle fills as time elapses
    const elapsed = this.challengeService.getElapsedSeconds();
    const progress = elapsed / TOTAL_SECONDS;
    return CIRCLE_CIRCUMFERENCE * (1 - progress);
  }
}
