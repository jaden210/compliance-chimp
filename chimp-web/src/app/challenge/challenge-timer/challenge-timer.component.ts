import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChallengeService } from "../challenge.service";
import { Subscription } from "rxjs";

const TOTAL_SECONDS = 360; // 6 minutes
// Rounded rect perimeter: 2*(w+h) - 8*r + 2*π*r where w=164, h=192, r=14
const RECT_PERIMETER = 2 * (164 + 192) - 8 * 14 + 2 * Math.PI * 14; // ≈ 688

@Component({
  standalone: true,
  selector: "challenge-timer",
  templateUrl: "./challenge-timer.component.html",
  styleUrls: ["./challenge-timer.component.scss"],
  imports: [CommonModule]
})
export class ChallengeTimerComponent implements OnInit, OnDestroy {
  timerDisplay = "0:00";
  isPaused = false;
  isComplete = false;
  isOvertime = false;

  private subscriptions: Subscription[] = [];

  constructor(public challengeService: ChallengeService) {}

  ngOnInit(): void {
    this.updateTimerDisplay();
    this.subscriptions.push(
      this.challengeService.elapsedSeconds$.subscribe(() => this.updateTimerDisplay()),
      this.challengeService.isPaused$.subscribe(paused => this.isPaused = paused),
      this.challengeService.isComplete$.subscribe(complete => this.isComplete = complete)
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private updateTimerDisplay(): void {
    this.timerDisplay = this.challengeService.getTimerDisplay();
    const elapsed = this.challengeService.getElapsedSeconds();
    this.isOvertime = elapsed >= TOTAL_SECONDS;
  }

  getRectStrokeDashoffset(): number {
    const elapsed = this.challengeService.getElapsedSeconds();
    const progress = elapsed / TOTAL_SECONDS;
    return RECT_PERIMETER * (1 - progress);
  }
}
