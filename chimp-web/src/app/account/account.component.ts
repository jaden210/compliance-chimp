import { Component, ViewChild, AfterViewInit, OnDestroy, OnInit, inject } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { trigger, style, transition, animate } from "@angular/animations";
import { AccountService, User, Team, InviteToTeam } from "./account.service";
import { Auth } from "@angular/fire/auth";
import { take } from "rxjs/operators";
import { Router, NavigationEnd } from "@angular/router";
import { MatDialog } from "@angular/material/dialog";
import { MatSidenavModule, MatSidenav } from "@angular/material/sidenav";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatTooltipModule } from "@angular/material/tooltip";
import { AppService } from "../app.service";
import { BreakpointObserver } from "@angular/cdk/layout";
import { Subscription, combineLatest, filter } from "rxjs";
import { LoadingChimpComponent } from "./loading-chimp/loading-chimp.component";
import { ChimpChatComponent, ChimpChatMode } from "./chimp-chat/chimp-chat.component";
import { addDoc, collection, collectionData, doc, docData, Firestore, query, where } from "@angular/fire/firestore";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { onAuthStateChanged } from "firebase/auth";

interface NavItem {
  key: string;
  label: string;
  icon: string;
  route: string;
  devOnly?: boolean;
}

interface NavClickData {
  [key: string]: number;
}

@Component({
  standalone: true,
  selector: "app-account",
  templateUrl: "./account.component.html",
  styleUrls: ["./account.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    LoadingChimpComponent,
    ChimpChatComponent
  ],
  providers: [DatePipe],
  animations: [
    trigger("helper", [
      transition(":enter", [
        style({ transform: "translateX(-150%)", opacity: 0 }),
        animate(
          "400ms ease-out",
          style({ transform: "translateX(0)", opacity: 1 })
        )
      ]),
      transition(":leave", [
        style({ transform: "translateX(0)", opacity: 1 }),
        animate(
          "400ms ease-in",
          style({ transform: "translateX(-150%)", opacity: 0 })
        )
      ])
    ])
  ]
})
export class AccountComponent implements AfterViewInit, OnDestroy, OnInit {
  @ViewChild("sidenav") public sidenav: MatSidenav;
  bShowAccountInfo: boolean = false; // template var
  helperContrast: boolean = false; // template var
  showChimpChat: boolean = false; // ChimpChat panel visibility
  chatMode: ChimpChatMode = 'dialog'; // ChimpChat display mode
  pendingChatMessage: string | null = null; // Message to auto-submit when chat opens
  isMobile: boolean = false; // Responsive breakpoint detection
  isChatMinimized: boolean = false; // Whether ChimpChat is minimized to bubble on mobile
  private readonly CHAT_MODE_STORAGE_KEY = 'chimp_chat_mode';
  private breakpointObserver = inject(BreakpointObserver);
  private authUnsubscribe?: () => void;
  private routerSubscription?: Subscription;
  private openChimpChatSubscription?: Subscription;
  private breakpointSubscription?: Subscription;
  private startTourListener?: () => void;

  // Nav items configuration
  navItems: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', route: 'dashboard' },
    { key: 'team', label: 'Team', icon: 'supervisor_account', route: 'team' },
    { key: 'training', label: 'Training', icon: 'explore', route: 'training' },
    { key: 'inspections', label: 'Inspections', icon: 'import_contacts', route: 'self-inspections' },
    { key: 'incidents', label: 'Incidents', icon: 'assignment_late', route: 'incident-reports' },
    { key: 'files', label: 'Files', icon: 'folder', route: 'files' },
    { key: 'events', label: 'Events', icon: 'event_note', route: 'event' },
    { key: 'account', label: 'Account', icon: 'person', route: 'account' },
    { key: 'support', label: 'Admin', icon: 'hot_tub', route: 'support', devOnly: true }
  ];

  // Click tracking
  private navClickData: NavClickData = {};
  private readonly STORAGE_KEY = 'chimp_nav_clicks';
  private readonly CLICKS_PER_PIXEL = 10;
  private readonly MAX_BONUS_PIXELS = 25;
  private readonly BASE_SIZE = 55; // Base size in pixels
  private readonly MIN_SIZE = 40; // Minimum button size

  constructor(
    public accountService: AccountService,
    public appService: AppService,
    private auth: Auth,
    private db: Firestore,
    private functions: Functions,
    public router: Router,
    public dialog: MatDialog
  ) {
    this.authUnsubscribe = onAuthStateChanged(this.auth, (user) => {
      if (user && user.uid) {
        const userRef = doc(this.db, `user/${user.uid}`);
        docData(userRef, { idField: 'id' }).pipe(take(1)).subscribe((userData: any) => {
          if (userData && userData.id) {
            this.accountService.userObservable.next(userData as User);
            this.accountService.user = userData as User;
            this.accountService.buildTeam(userData.teamId);
          }
        });
      } else {
        this.accountService.logout();
      }
    });
  }

  ngOnInit() {
    this.loadNavClickData();
    this.loadChatMode();
    this.prefetchCoverageAnalyses();
    
    // Track route changes to increment clicks
    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      const navItem = this.navItems.find(item => event.url.includes(item.route));
      if (navItem) {
        this.incrementNavClick(navItem.key);
      }
    });

    // Listen for startTour events from child components
    this.startTourListener = () => this.openChimpChatWithMessage('Take the tour');
    document.addEventListener('startTour', this.startTourListener);

    this.openChimpChatSubscription = this.accountService.openChimpChatRequested.subscribe(() => {
      if (!this.showChimpChat) this.showChimpChat = true;
    });

    // Detect mobile breakpoint to auto-switch ChimpChat behavior
    this.breakpointSubscription = this.breakpointObserver
      .observe('(max-width: 768px)')
      .subscribe(result => {
        this.isMobile = result.matches;
        // On mobile, force dialog mode so the sidenav drawer never opens
        if (this.isMobile && this.chatMode === 'sidenav') {
          this.chatMode = 'dialog';
        }
      });
  }

  // Load chat mode preference from localStorage
  private loadChatMode(): void {
    try {
      const stored = localStorage.getItem(this.CHAT_MODE_STORAGE_KEY);
      if (stored === 'dialog' || stored === 'sidenav') {
        this.chatMode = stored;
      }
    } catch {
      this.chatMode = 'dialog';
    }
  }

  // Save chat mode preference to localStorage
  private saveChatMode(): void {
    try {
      localStorage.setItem(this.CHAT_MODE_STORAGE_KEY, this.chatMode);
    } catch {
      // localStorage might be full or unavailable
    }
  }

  ngOnDestroy() {
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
    }
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    this.openChimpChatSubscription?.unsubscribe();
    this.breakpointSubscription?.unsubscribe();
    if (this.startTourListener) {
      document.removeEventListener('startTour', this.startTourListener);
    }
  }

  ngAfterViewInit() {
    this.accountService.setSidenav(this.sidenav);
  }

  // Load click data from localStorage
  private loadNavClickData(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.navClickData = JSON.parse(stored);
      }
    } catch {
      this.navClickData = {};
    }
    // Initialize any missing keys
    this.navItems.forEach(item => {
      if (!(item.key in this.navClickData)) {
        this.navClickData[item.key] = 0;
      }
    });
  }

  // Save click data to localStorage
  private saveNavClickData(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.navClickData));
    } catch {
      // localStorage might be full or unavailable
    }
  }

  // Increment click count for a nav item
  incrementNavClick(key: string): void {
    if (key in this.navClickData) {
      this.navClickData[key]++;
      this.saveNavClickData();
    }
  }

  // Track click on nav item
  onNavClick(item: NavItem): void {
    this.incrementNavClick(item.key);
  }

  // Get the bonus pixels for a nav item based on clicks
  private getBonusPixels(key: string): number {
    const clicks = this.navClickData[key] || 0;
    const bonus = Math.floor(clicks / this.CLICKS_PER_PIXEL);
    return Math.min(bonus, this.MAX_BONUS_PIXELS);
  }

  // Calculate the size for each nav button using flex-grow
  // Buttons that are used more get more space, others shrink proportionally
  getNavItemSize(key: string): number {
    const visibleItems = this.navItems.filter(item => !item.devOnly || this.accountService.user?.isDev);
    
    // Calculate total bonus across all items
    let totalBonus = 0;
    visibleItems.forEach(item => {
      totalBonus += this.getBonusPixels(item.key);
    });

    // Each item gets base size + its share of bonus
    const itemBonus = this.getBonusPixels(key);
    
    // Calculate the size: base + bonus, but we need to balance
    // If some items have more bonus, others should be relatively smaller
    // We use a weighted approach where total available "extra" space is distributed
    const avgBonus = totalBonus / visibleItems.length;
    const sizeDelta = itemBonus - avgBonus;
    
    // The size is base + delta from average (clamped to min/max)
    const size = this.BASE_SIZE + sizeDelta;
    return Math.max(this.MIN_SIZE, Math.min(size, this.BASE_SIZE + this.MAX_BONUS_PIXELS));
  }

  // Get flex-grow value for proportional sizing
  getNavItemFlex(key: string): number {
    const clicks = this.navClickData[key] || 0;
    // Base flex of 1, plus bonus based on clicks
    // Every 10 clicks adds 0.1 to flex, capped at 2.5 total (1 base + 1.5 bonus)
    const bonusFlex = Math.min(clicks / this.CLICKS_PER_PIXEL * 0.1, 1.5);
    return 1 + bonusFlex;
  }

  // Determine if a nav item should be in compact (icon-only) mode
  // This happens when it's significantly less used than the average
  isCompact(key: string): boolean {
    const visibleItems = this.navItems.filter(item => !item.devOnly || this.accountService.user?.isDev);
    
    // Calculate average clicks across all items
    let totalClicks = 0;
    visibleItems.forEach(item => {
      totalClicks += this.navClickData[item.key] || 0;
    });
    const avgClicks = totalClicks / visibleItems.length;
    
    const itemClicks = this.navClickData[key] || 0;
    
    // If this item has less than 40% of average clicks AND
    // the average is at least 15 clicks (so we have enough data),
    // go into compact mode
    return avgClicks >= 15 && itemClicks < avgClicks * 0.4;
  }

  /**
   * Prefetch coverage analyses in the background so they're ready
   * before the user navigates to inspections or training pages.
   * The cloud functions save results to the team document, which
   * child components pick up automatically via aTeamObservable.
   */
  private prefetchCoverageAnalyses(): void {
    combineLatest([
      this.accountService.aTeamObservable,
      this.accountService.teamMembersObservable
    ]).pipe(
      filter(([team, members]) => !!team?.id && !!members?.length),
      take(1)
    ).subscribe(([team, members]) => {
      if (!team.industry) return; // Can't analyze without an industry

      const needsInspectionAnalysis = !team.coverageAnalysis || team.coverageAnalysisStale || !team.coverageAnalysis.success;
      const needsTrainingAnalysis = !team.trainingCoverageAnalysis || team.trainingCoverageAnalysisStale || !team.trainingCoverageAnalysis.success;

      if (needsInspectionAnalysis) {
        this.prefetchInspectionCoverage(team, members);
      }
      if (needsTrainingAnalysis) {
        this.prefetchTrainingCoverage(team, members);
      }
    });
  }

  private prefetchInspectionCoverage(team: any, members: any[]): void {
    const inspectionsRef = collection(this.db, `team/${team.id}/self-inspection`);
    collectionData(inspectionsRef, { idField: 'id' }).pipe(take(1)).subscribe((inspections: any[]) => {
      if (!inspections.length) return;

      const jobTitles = [...new Set(members.map(m => m.jobTitle).filter(Boolean))];
      const teamMembers = members.map(m => ({
        name: m.name || 'Team member',
        jobTitle: m.jobTitle || ''
      }));
      const existingInspections = inspections.map(i => ({
        title: i.title,
        inspectionExpiration: i.inspectionExpiration,
        baseQuestions: (i.baseQuestions || []).map(cat => ({
          subject: cat.subject,
          questions: (cat.questions || []).map(q => ({ name: q.name }))
        }))
      }));

      const analyzeFn = httpsCallable(this.functions, 'analyzeInspectionCoverage');
      analyzeFn({
        businessName: team.name || '',
        businessWebsite: team.website || '',
        industry: team.industry,
        teamId: team.id,
        teamSize: teamMembers.length,
        jobTitles,
        teamMembers,
        existingInspections
      }).catch(err => console.warn('[Prefetch] Inspection coverage analysis failed:', err));
    });
  }

  private prefetchTrainingCoverage(team: any, members: any[]): void {
    const libraryRef = query(collection(this.db, 'library'), where('teamId', '==', team.id));
    collectionData(libraryRef, { idField: 'id' }).pipe(take(1)).subscribe((library: any[]) => {
      if (!library.length) return;

      const jobTitles = [...new Set(members.map(m => m.jobTitle).filter(Boolean))];
      const allTags = [...new Set(members.flatMap(m => m.tags || []))].sort();
      const teamMembers = members.map(m => ({
        name: m.name,
        jobTitle: m.jobTitle,
        tags: m.tags || []
      }));
      const existingTrainings = library.map(t => ({
        name: t.name,
        trainingCadence: t.trainingCadence,
        assignedTags: t.assignedTags || []
      }));

      const analyzeFn = httpsCallable(this.functions, 'analyzeTrainingCoverage');
      analyzeFn({
        businessName: team.name,
        businessWebsite: team.website || '',
        industry: team.industry,
        teamId: team.id,
        teamSize: teamMembers.length,
        jobTitles,
        teamMembers,
        existingTrainings,
        allTags
      }).catch(err => console.warn('[Prefetch] Training coverage analysis failed:', err));
    });
  }

  closeHelper() {
    this.accountService.showHelper = false;
  }

  toggleChimpChat(): void {
    this.showChimpChat = !this.showChimpChat;
    this.isChatMinimized = false;
    // Clear pending message if closing
    if (!this.showChimpChat) {
      this.pendingChatMessage = null;
    }
  }

  closeChimpChat(): void {
    this.showChimpChat = false;
    this.isChatMinimized = false;
    this.pendingChatMessage = null;
  }

  // Minimize ChimpChat to floating bubble (mobile)
  onChatMinimize(): void {
    this.isChatMinimized = true;
  }

  // Open or restore ChimpChat from floating bubble (mobile)
  restoreChat(): void {
    this.showChimpChat = true;
    this.isChatMinimized = false;
  }

  // Handle mode change from ChimpChat component
  onChatModeChange(newMode: ChimpChatMode): void {
    this.chatMode = newMode;
    this.saveChatMode();
  }

  // Open ChimpChat with a pre-filled message that will be auto-submitted
  openChimpChatWithMessage(message: string): void {
    this.pendingChatMessage = message;
    this.showChimpChat = true;
  }

  submitFeedback() {
    let fbtext = JSON.parse(
      JSON.stringify(this.accountService.helperProfiles.feedback)
    );
    this.accountService.feedback.name = "Thanks for your feedback!";
    setTimeout(() => {
      this.accountService.showFeedback = false;
      addDoc(collection(this.accountService.db, "feedback"), {
        origin: "feeback helper",
        originPage: location.pathname,
        description: this.accountService.feedback.description,
        userId: this.accountService.user.id,
        userName: this.accountService.user.name,
        teamName: this.accountService.aTeam.name,
        email: this.accountService.user.email,
        isClosed: false,
        createdAt: new Date()
      }).then(() => {
        this.accountService.feedback = fbtext;
        this.accountService.feedback.description = "";
      });
    }, 2000);
  }
}
