import { Injectable, signal } from "@angular/core";

export interface WelcomeState {
  teamVisible: boolean;
  trainingVisible: boolean;
  inspectionsVisible: boolean;
}

export type WelcomeSection = 'team' | 'training' | 'inspections';

const STORAGE_KEY = 'cc-welcome-visible';

// Default: show banners initially
const DEFAULT_STATE: WelcomeState = {
  teamVisible: true,
  trainingVisible: true,
  inspectionsVisible: true
};

@Injectable({
  providedIn: "root"
})
export class WelcomeService {
  private state = signal<WelcomeState>(this.loadState());

  // Check if a section's banner should be visible
  isVisible(section: WelcomeSection): boolean {
    const s = this.state();
    switch (section) {
      case 'team':
        return s.teamVisible;
      case 'training':
        return s.trainingVisible;
      case 'inspections':
        return s.inspectionsVisible;
      default:
        return false;
    }
  }

  // Toggle banner visibility
  toggle(section: WelcomeSection): void {
    const current = this.state();
    let updated: WelcomeState;

    switch (section) {
      case 'team':
        updated = { ...current, teamVisible: !current.teamVisible };
        break;
      case 'training':
        updated = { ...current, trainingVisible: !current.trainingVisible };
        break;
      case 'inspections':
        updated = { ...current, inspectionsVisible: !current.inspectionsVisible };
        break;
      default:
        return;
    }

    this.state.set(updated);
    this.saveState(updated);
  }

  // Hide a section's banner
  hide(section: WelcomeSection): void {
    const current = this.state();
    let updated: WelcomeState;

    switch (section) {
      case 'team':
        updated = { ...current, teamVisible: false };
        break;
      case 'training':
        updated = { ...current, trainingVisible: false };
        break;
      case 'inspections':
        updated = { ...current, inspectionsVisible: false };
        break;
      default:
        return;
    }

    this.state.set(updated);
    this.saveState(updated);
  }

  // Show a section's banner
  show(section: WelcomeSection): void {
    const current = this.state();
    let updated: WelcomeState;

    switch (section) {
      case 'team':
        updated = { ...current, teamVisible: true };
        break;
      case 'training':
        updated = { ...current, trainingVisible: true };
        break;
      case 'inspections':
        updated = { ...current, inspectionsVisible: true };
        break;
      default:
        return;
    }

    this.state.set(updated);
    this.saveState(updated);
  }

  // Reset welcome state (for testing or re-onboarding)
  reset(): void {
    this.state.set(DEFAULT_STATE);
    this.saveState(DEFAULT_STATE);
  }

  private loadState(): WelcomeState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_STATE, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_STATE;
  }

  private saveState(state: WelcomeState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }
}
