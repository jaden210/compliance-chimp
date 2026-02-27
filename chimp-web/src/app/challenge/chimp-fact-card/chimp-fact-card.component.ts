import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { trigger, transition, style, animate, state } from "@angular/animations";
import { ChallengeService } from "../challenge.service";

@Component({
  standalone: true,
  selector: "chimp-fact-card",
  templateUrl: "./chimp-fact-card.component.html",
  styleUrls: ["./chimp-fact-card.component.scss"],
  imports: [CommonModule],
  animations: [
    // Card entrance
    trigger('cardEnter', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('400ms ease-out', style({ opacity: 1 }))
      ])
    ]),
    // Crossfade for fact text
    trigger('crossfade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('600ms 150ms ease-in', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('500ms ease-out', style({ opacity: 0 }))
      ])
    ])
  ]
})
export class ChimpFactCardComponent implements OnInit, OnDestroy, OnChanges {
  /** Animation style: 'crossfade' swaps text, 'typewriter' types it out */
  @Input() animationStyle: 'crossfade' | 'typewriter' = 'crossfade';

  /** Cycle interval in ms. 0 = no cycling (one-shot). */
  @Input() cycleInterval = 0;

  /** Hint passed to the AI to tailor the fact to the current page context. */
  @Input() contextHint = '';

  /** Additional job titles to pass as context. */
  @Input() jobTitles: string[] = [];

  /** Recent items being created (e.g. inspection checklists, training titles). Chimp can reference these specifically. */
  @Input() recentActivity: string[] = [];

  /** When true, hides the chimp avatar/icon. Use for compact placements like the complete page. */
  @Input() hideAvatar = false;

  fact: string | null = null;
  displayedText = '';
  showText = false;
  isLoading = false;
  isTyping = false;

  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private typewriterTimer: ReturnType<typeof setInterval> | null = null;
  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
  private getChimpFactFn: ReturnType<typeof httpsCallable>;
  private previousFacts: string[] = [];
  private cycleCount = 0;

  // Random chimp quips — personality moments, not OSHA facts
  private static readonly CHIMP_QUIPS: string[] = [
    "I had a banana for lunch. Unrelated, but worth mentioning.",
    "My therapist says I worry too much about fall protection. I say she doesn't worry enough.",
    "People ask why a chimp runs a compliance company. I ask why it took this long for one to step up.",
    "I type 40 words per minute. Impressive for someone who also uses his feet.",
    "Fun fact about me: I can bench press 600 pounds. Unrelated to compliance but I like to bring it up.",
    "Sometimes I just sit and think about PPE. That's not a joke. I genuinely do that.",
    "My team wanted casual Fridays. I reminded them that hard hats aren't optional. We compromised on Hawaiian hard hats.",
    "I once read the entire OSHA 1910 general industry standard. Cover to cover. On vacation.",
    "They say dress for the job you want. I want the job where everyone goes home safe. So, steel-toed banana peels.",
    "I started this company because I care about two things: safety and bananas. In that order. Usually.",
    "Technically I'm not licensed to give legal advice. Technically I'm also a chimp. Lots of technicalities.",
    "I was grooming earlier and found a citation under my fur. Just kidding. But I have found them in stranger places."
  ];

  constructor(
    private challengeService: ChallengeService,
    private functions: Functions
  ) {
    this.getChimpFactFn = httpsCallable(this.functions, 'getChimpFact');
  }

  ngOnInit(): void {
    this.loadFact();

    if (this.cycleInterval > 0) {
      this.cycleTimer = setInterval(() => this.loadFact(), this.cycleInterval);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If job titles change significantly, could trigger a reload — but we let the cycle handle it
  }

  ngOnDestroy(): void {
    if (this.cycleTimer) clearInterval(this.cycleTimer);
    if (this.typewriterTimer) clearInterval(this.typewriterTimer);
    if (this.crossfadeTimer) clearTimeout(this.crossfadeTimer);
  }

  private async loadFact(): Promise<void> {
    if (this.isLoading) return;
    this.cycleCount++;

    // After 2+ cycles, ~25% chance of a random chimp quip instead of an OSHA fact
    if (this.cycleCount > 2 && Math.random() < 0.25) {
      this.showFact(this.getRandomQuip());
      return;
    }

    this.isLoading = true;

    try {
      const result: any = await this.getChimpFactFn({
        businessName: this.challengeService.businessName || '',
        businessWebsite: this.challengeService.businessWebsite || '',
        industry: this.challengeService.industry || '',
        jobTitles: this.jobTitles,
        contextHint: this.contextHint,
        recentActivity: this.recentActivity,
        previousFacts: this.previousFacts.slice(-6) // Send last 6 to avoid repeats without huge payload
      });

      if (result.data?.fact) {
        const newFact = result.data.fact;
        this.previousFacts.push(newFact);
        this.showFact(newFact);
      }
    } catch (err) {
      console.error('Error fetching chimp fact:', err);
    } finally {
      this.isLoading = false;
    }
  }

  private showFact(text: string): void {
    if (this.animationStyle === 'typewriter') {
      this.fact = text;
      this.typeOut(text);
    } else {
      // Crossfade: toggle showText to trigger :enter/:leave animations
      if (!this.fact) {
        // First load — just show it
        this.fact = text;
        this.displayedText = text;
        this.showText = true;
      } else {
        // Subsequent loads — fade out, swap text, fade in
        this.showText = false;
        if (this.crossfadeTimer) clearTimeout(this.crossfadeTimer);
        this.crossfadeTimer = setTimeout(() => {
          this.crossfadeTimer = null;
          this.fact = text;
          this.displayedText = text;
          this.showText = true;
        }, 550);
      }
    }
  }

  private usedQuipIndices = new Set<number>();

  private getRandomQuip(): string {
    const quips = ChimpFactCardComponent.CHIMP_QUIPS;
    // If we've used them all, reset
    if (this.usedQuipIndices.size >= quips.length) {
      this.usedQuipIndices.clear();
    }
    let idx: number;
    do {
      idx = Math.floor(Math.random() * quips.length);
    } while (this.usedQuipIndices.has(idx));
    this.usedQuipIndices.add(idx);
    return quips[idx];
  }

  private typeOut(text: string): void {
    if (this.typewriterTimer) clearInterval(this.typewriterTimer);

    this.displayedText = '';
    this.isTyping = true;
    let i = 0;
    const speed = Math.max(8, Math.min(20, 1000 / text.length)); // ~1s total

    this.typewriterTimer = setInterval(() => {
      if (i < text.length) {
        this.displayedText = text.substring(0, i + 1);
        i++;
      } else {
        clearInterval(this.typewriterTimer);
        this.typewriterTimer = null;
        this.isTyping = false;
      }
    }, speed);
  }
}
