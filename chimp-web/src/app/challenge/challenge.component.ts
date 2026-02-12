import { Component, OnInit, OnDestroy, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterModule, NavigationEnd } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { ChallengeService } from "./challenge.service";
import { ChallengeTimerComponent } from "./challenge-timer/challenge-timer.component";
import { Subscription, filter } from "rxjs";

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
    ChallengeTimerComponent
  ]
})
export class ChallengeComponent implements OnInit, OnDestroy {
  isOnStep3 = false;
  isOnStep4 = false;
  isOnComplete = false;
  isTabletViewport = false;

  private subscriptions: Subscription[] = [];

  constructor(
    public challengeService: ChallengeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkCurrentRoute(this.router.url);
    this.updateTabletViewport();
    this.subscriptions.push(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd)
      ).subscribe(event => {
        this.checkCurrentRoute(event.urlAfterRedirects);
      })
    );
  }

  private updateTabletViewport(): void {
    this.isTabletViewport = window.innerWidth >= 600 && window.innerWidth < 1500;
  }

  get showChallengeTimer(): boolean {
    if (!this.challengeService.isTimerStarted || this.isOnStep3) return false;
    // On step4 in tablet viewport, timer is shown inside the step card
    if (this.isOnStep4 && this.isTabletViewport) return false;
    // On complete page in tablet viewport (600-1500px), hide the global timer
    if (this.isOnComplete && this.isTabletViewport) return false;
    return true;
  }

  private checkCurrentRoute(url: string): void {
    this.isOnStep3 = url.includes('/step3');
    this.isOnStep4 = url.includes('/step4');
    this.isOnComplete = url.includes('/complete');
  }

  exitDryRun(): void {
    this.challengeService.setDryRun(false);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    const isComplete = this.challengeService.isComplete$?.getValue?.() ?? false;
    if (this.challengeService.isTimerStarted && !isComplete) {
      this.challengeService.pauseTimer();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateTabletViewport();
  }
}
