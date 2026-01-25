import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { ChallengeService } from "../challenge.service";
import { TagInputComponent } from "../../account/team/tag-input/tag-input.component";
import { TagsHelpDialog } from "../../account/team/team.component";
import { getTagColor } from "../../shared/tag-colors";
import { Firestore, collection, collectionData, addDoc, deleteDoc, doc, getDoc, updateDoc } from "@angular/fire/firestore";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Subscription } from "rxjs";
import { AnalyticsService, FunnelStep } from "../../shared/analytics.service";

interface TeamMember {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  preferEmail?: boolean;
  tags?: string[];
  teamId: string;
  createdAt: Date;
}

@Component({
  standalone: true,
  selector: "challenge-step3",
  templateUrl: "./step3.component.html",
  styleUrls: ["./step3.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    TagInputComponent
  ]
})
export class Step3Component implements OnInit, OnDestroy {
  @ViewChild('nameInput') nameInput: ElementRef<HTMLInputElement>;
  
  teamMembers: TeamMember[] = [];
  private teamMembersSub: Subscription | null = null;
  
  // New member form
  newMember = {
    name: '',
    email: '',
    phone: '',
    jobTitle: '',
    preferEmail: false,
    tags: [] as string[]
  };
  
  // Get all unique tags from team members for autocomplete
  get allTags(): string[] {
    const tagsSet = new Set<string>();
    this.teamMembers.forEach(tm => {
      (tm.tags || []).forEach(tag => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }
  
  // Use shared tag color utility
  getTagColor = getTagColor;
  
  // Validation
  phoneError = false;
  emailError = false;
  
  // QuickBooks
  qbConnecting = false;
  qbSyncing = false;
  qbError: string | null = null;
  isQuickBooksConnected = false;
  
  // Loading
  isLoading = false;

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private route: ActivatedRoute,
    private db: Firestore,
    private functions: Functions,
    private dialog: MatDialog,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Track step 3 view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP3_VIEW);
    
    // Resume timer
    this.challengeService.resumeTimer();
    
    // Check for QuickBooks OAuth callback
    this.route.queryParams.subscribe(params => {
      if (params['qb'] === 'connected') {
        this.isQuickBooksConnected = true;
        this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_QUICKBOOKS_CONNECTED);
        this.syncQuickBooks();
      }
    });
    
    // Load team info and check QB status
    this.loadTeamInfo();
    
    // Subscribe to team members collection
    if (this.challengeService.teamId) {
      const membersCollection = collection(this.db, 'team-members');
      this.teamMembersSub = collectionData(membersCollection, { idField: 'id' }).subscribe(
        (members: any[]) => {
          this.teamMembers = members.filter(m => m.teamId === this.challengeService.teamId);
        }
      );
    }
  }

  ngOnDestroy(): void {
    if (this.teamMembersSub) {
      this.teamMembersSub.unsubscribe();
    }
  }

  async loadTeamInfo(): Promise<void> {
    if (!this.challengeService.teamId) return;
    
    try {
      const teamDoc = await getDoc(doc(this.db, `team/${this.challengeService.teamId}`));
      if (teamDoc.exists()) {
        const teamData = teamDoc.data();
        this.isQuickBooksConnected = !!teamData?.['quickbooks']?.['realmId'];
      }
    } catch (err) {
      console.error('Error loading team info:', err);
    }
  }

  // Form validation
  isValidPhone(phone: string): boolean {
    if (!phone) return true;
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 10 || cleaned.length === 11;
  }

  isValidEmail(email: string): boolean {
    if (!email) return true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  validatePhone(): void {
    if (this.newMember.phone && !this.isValidPhone(this.newMember.phone)) {
      this.phoneError = true;
    } else {
      this.phoneError = false;
    }
  }

  validateEmail(): void {
    if (this.newMember.email && !this.isValidEmail(this.newMember.email)) {
      this.emailError = true;
    } else {
      this.emailError = false;
    }
  }

  formatPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return '(' + match[1] + ') ' + match[2] + '-' + match[3];
    }
    return phone;
  }

  canAddMember(): boolean {
    if (!this.newMember.name.trim()) return false;
    if (this.phoneError || this.emailError) return false;
    
    // Must have either phone or email
    if (this.newMember.preferEmail) {
      return !!this.newMember.email.trim();
    } else {
      return !!this.newMember.phone.trim();
    }
  }

  async addMember(): Promise<void> {
    if (!this.canAddMember() || !this.challengeService.teamId) return;
    
    // Format phone if provided
    const phone = this.newMember.phone ? this.formatPhone(this.newMember.phone) : null;
    
    const memberData: any = {
      name: this.newMember.name.trim(),
      phone: phone,
      email: this.newMember.email ? this.newMember.email.trim().toLowerCase() : null,
      preferEmail: this.newMember.preferEmail,
      jobTitle: this.newMember.jobTitle?.trim() || null,
      tags: this.newMember.tags || [],
      teamId: this.challengeService.teamId,
      createdAt: new Date()
    };
    
    // Remove null fields (but keep empty arrays)
    Object.keys(memberData).forEach(key => {
      if (memberData[key] === null) delete memberData[key];
    });
    
    try {
      await addDoc(collection(this.db, 'team-members'), memberData);
      
      // Track team member added
      this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_TEAM_MEMBER_ADDED, {
        member_count: this.teamMembers.length + 1,
        has_email: !!memberData.email,
        has_tags: (memberData.tags?.length || 0) > 0
      });
      
      // Reset form
      this.newMember = {
        name: '',
        email: '',
        phone: '',
        jobTitle: '',
        preferEmail: false,
        tags: []
      };
      this.phoneError = false;
      this.emailError = false;
      
      // Focus back on name input for next entry
      setTimeout(() => {
        if (this.nameInput) {
          this.nameInput.nativeElement.focus();
        }
      }, 0);
    } catch (err) {
      console.error('Error adding team member:', err);
      this.analytics.trackError('add_team_member', String(err));
    }
  }

  async removeMember(member: TeamMember): Promise<void> {
    if (!member.id) return;
    
    try {
      await deleteDoc(doc(this.db, `team-members/${member.id}`));
    } catch (err) {
      console.error('Error removing team member:', err);
    }
  }

  // QuickBooks integration
  async connectQuickBooks(): Promise<void> {
    if (!this.challengeService.teamId || this.qbConnecting) return;
    
    this.qbConnecting = true;
    this.qbError = null;
    
    // Pause timer during QuickBooks OAuth
    this.challengeService.pauseTimer();
    
    try {
      const returnUrl = window.location.origin;
      const getAuthUrl = httpsCallable(this.functions, 'quickbooks-getQuickBooksAuthUrl');
      const result: any = await getAuthUrl({ 
        teamId: this.challengeService.teamId,
        returnUrl: `${returnUrl}/get-started/step3?qb=connected`
      });
      
      // Redirect to QuickBooks OAuth
      window.location.href = result.data.authUrl;
    } catch (err: any) {
      console.error('Error connecting QuickBooks:', err);
      this.qbError = err.message || 'Failed to connect to QuickBooks';
      this.qbConnecting = false;
      this.challengeService.resumeTimer();
    }
  }

  async syncQuickBooks(): Promise<void> {
    if (!this.challengeService.teamId || this.qbSyncing) return;
    
    this.qbSyncing = true;
    this.qbError = null;
    
    // Pause timer during sync
    this.challengeService.pauseTimer();
    
    try {
      const syncEmployees = httpsCallable(this.functions, 'quickbooks-syncQuickBooksEmployees');
      const result: any = await syncEmployees({ teamId: this.challengeService.teamId });
      
      this.analytics.trackEvent('quickbooks_sync', {
        event_category: 'integration',
        employees_synced: result.data.added
      });
      
    } catch (err: any) {
      console.error('Error syncing QuickBooks:', err);
      this.qbError = err.message || 'Failed to sync employees';
      this.analytics.trackError('quickbooks_sync', err.message || 'Unknown error');
    } finally {
      this.qbSyncing = false;
      this.challengeService.resumeTimer();
    }
  }

  canProceed(): boolean {
    return this.teamMembers.length >= 1;
  }

  next(): void {
    if (!this.canProceed()) return;
    
    // Track step 3 completion
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP3_COMPLETE, {
      team_member_count: this.teamMembers.length,
      used_quickbooks: this.isQuickBooksConnected
    });
    
    this.router.navigate(['/get-started/step4']);
  }

  goBack(): void {
    this.router.navigate(['/get-started/step2']);
  }

  openTagsHelpDialog(): void {
    this.dialog.open(TagsHelpDialog, {
      width: '480px',
      maxWidth: '95vw'
    });
  }

  // Pause timer when inputs are focused
  onInputFocus(): void {
    this.challengeService.pauseTimer();
  }

  onInputBlur(): void {
    this.challengeService.resumeTimer();
  }
}
