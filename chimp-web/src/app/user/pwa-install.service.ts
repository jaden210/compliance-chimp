import { Injectable, inject, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { BehaviorSubject } from "rxjs";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

@Injectable({
  providedIn: "root"
})
export class PwaInstallService {
  private readonly platformId = inject(PLATFORM_ID);
  
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private readonly canInstallSubject = new BehaviorSubject<boolean>(false);
  private readonly isInstalledSubject = new BehaviorSubject<boolean>(false);

  readonly canInstall$ = this.canInstallSubject.asObservable();
  readonly isInstalled$ = this.isInstalledSubject.asObservable();

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initPwaEvents();
      this.checkIfInstalled();
    }
  }

  private initPwaEvents(): void {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (event: Event) => {
      // Prevent the default mini-infobar from appearing
      event.preventDefault();
      // Store the event for later use
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      // Show the install button
      this.canInstallSubject.next(true);
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstallSubject.next(false);
      this.isInstalledSubject.next(true);
    });
  }

  private checkIfInstalled(): void {
    // Check if running in standalone mode (already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    
    if (isStandalone) {
      this.isInstalledSubject.next(true);
      this.canInstallSubject.next(false);
    }
  }

  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    // Show the install prompt
    await this.deferredPrompt.prompt();

    // Wait for user response
    const { outcome } = await this.deferredPrompt.userChoice;

    // Clear the deferred prompt
    this.deferredPrompt = null;
    this.canInstallSubject.next(false);

    return outcome === 'accepted';
  }

  get canInstall(): boolean {
    return this.canInstallSubject.value;
  }

  get isInstalled(): boolean {
    return this.isInstalledSubject.value;
  }
}
