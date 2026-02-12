import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from "@angular/core";
import { trigger, transition, style, animate } from "@angular/animations";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
// MatSlideToggleModule removed - contact fields no longer shown in onboarding
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { ChallengeService } from "../challenge.service";
import { ChimpFactCardComponent } from "../chimp-fact-card/chimp-fact-card.component";
import { TagInputComponent } from "../../account/team/tag-input/tag-input.component";
import { TagsHelpDialog } from "../../account/team/team.component";
import { getTagColor } from "../../shared/tag-colors";
import { Auth } from "@angular/fire/auth";
import { Firestore, collection, collectionData, addDoc, deleteDoc, doc, updateDoc, getDocs, query, where, limit } from "@angular/fire/firestore";
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
  welcomeSent?: boolean;
}

interface ParsedCsvMember {
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  preferEmail: boolean;
  errors: string[];
}

interface CsvImportResult {
  success: boolean;
  added: number;
  errors: string[];
}

@Component({
  standalone: true,
  selector: "challenge-step3",
  templateUrl: "./step3.component.html",
  styleUrls: ["./step3.component.scss"],
  animations: [
    trigger('tagsAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.8)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ],
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    TagInputComponent,
    ChimpFactCardComponent
  ]
})
export class Step3Component implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('nameInput') nameInput: ElementRef<HTMLInputElement>;
  
  teamMembers: TeamMember[] = [];
  private teamMembersSub: Subscription | null = null;
  
  // New member form (contact info is added later from Team page)
  newMember = {
    name: '',
    jobTitle: '',
    tags: [] as string[]
  };
  
  // Get all job titles for chimp fact context
  get currentJobTitles(): string[] {
    return this.teamMembers
      .filter(m => m.jobTitle?.trim())
      .map(m => m.jobTitle!.trim());
  }

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
  
  // CSV Import
  csvUploading = false;
  csvError: string | null = null;
  csvImportResult: CsvImportResult | null = null;
  @ViewChild('csvFileInput') csvFileInput: ElementRef<HTMLInputElement>;
  
  // Loading
  isLoading = false;
  
  // Auto-tagging
  isTagging = false;
  
  // Track pending changes for each member (to save on blur)
  private pendingChanges: Map<string, Partial<TeamMember>> = new Map();

  // Debounce timers for job-title → tag generation (avoids network call on every keystroke)
  private static readonly JOB_TITLE_DEBOUNCE_MS = 1100;
  private jobTitleDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private newMemberJobTitleDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Job title that was last used to generate tags for the new-member form, so we re-fetch when it changes. */
  private newMemberLastTaggedJobTitle: string = '';
  /** Last saved job title per member, so we can detect real changes when display value is kept in sync */
  private lastSavedJobTitle: Map<string, string> = new Map();
  
  // Processing state for Continue button
  isProcessing = false;
  processingMessage = '';
  membersBeingTagged: Set<string> = new Set();

  // Mobile: toggle all cards between job title and tags view
  mobileShowAllTags = false;

  toggleAllMobileTags(): void {
    this.mobileShowAllTags = !this.mobileShowAllTags;
  }

  // Dry run: counter for generating local IDs
  private dryRunIdCounter = 0;

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private db: Firestore,
    private auth: Auth,
    private functions: Functions,
    private dialog: MatDialog,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Track step 3 view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP3_VIEW);
    
    // Dry run: skip Firestore, seed the owner as the first team member
    if (this.challengeService.isDryRun) {
      this.teamMembers = [{
        id: 'dry-run-owner',
        name: this.challengeService.name,
        email: this.challengeService.email,
        jobTitle: 'Owner',
        teamId: this.challengeService.teamId!,
        createdAt: new Date(),
        tags: ['owner'],
        welcomeSent: true,
        linkedUserId: 'dry-run-owner-user'
      } as any];
      this.lastSavedJobTitle.set('dry-run-owner', 'Owner');
      return;
    }
    
    // Subscribe to team members collection
    if (this.challengeService.teamId) {
      const membersCollection = collection(this.db, 'team-members');
      this.teamMembersSub = collectionData(membersCollection, { idField: 'id' }).subscribe(
        (members: any[]) => {
          this.teamMembers = members
            .filter(m => m.teamId === this.challengeService.teamId && !m.deleted)
            .sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || a.createdAt?.getTime?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || b.createdAt?.getTime?.() || 0;
              return aTime - bTime;
            });
          // Seed lastSavedJobTitle so flush can detect real changes (for two-way bound inputs)
          this.teamMembers.forEach(m => {
            if (m.id && !this.lastSavedJobTitle.has(m.id)) {
              this.lastSavedJobTitle.set(m.id, m.jobTitle?.trim() ?? '');
            }
          });
        }
      );
    }
  }

  ngAfterViewInit(): void {
    // Auto-focus the name input on desktop so the user can start typing immediately
    setTimeout(() => {
      if (this.nameInput) {
        this.nameInput.nativeElement.focus();
      }
    }, 0);
  }

  ngOnDestroy(): void {
    if (this.teamMembersSub) {
      this.teamMembersSub.unsubscribe();
    }
    this.jobTitleDebounceTimers.forEach(t => clearTimeout(t));
    this.jobTitleDebounceTimers.clear();
    if (this.newMemberJobTitleDebounceTimer) {
      clearTimeout(this.newMemberJobTitleDebounceTimer);
      this.newMemberJobTitleDebounceTimer = null;
    }
  }

  canAddMember(): boolean {
    return !!this.newMember.name.trim() && !!this.newMember.jobTitle.trim();
  }

  async addMember(): Promise<void> {
    if (!this.canAddMember() || !this.challengeService.teamId) return;
    
    // Cancel any pending debounce so it doesn't fire after the form resets
    if (this.newMemberJobTitleDebounceTimer) {
      clearTimeout(this.newMemberJobTitleDebounceTimer);
      this.newMemberJobTitleDebounceTimer = null;
    }
    
    const jobTitle = this.newMember.jobTitle?.trim() || null;
    const hasTags = this.newMember.tags.length > 0;
    
    // Contact info is not collected during onboarding - added later from Team page
    const memberData: any = {
      name: this.newMember.name.trim(),
      jobTitle: jobTitle,
      tags: this.newMember.tags || [],
      teamId: this.challengeService.teamId,
      createdAt: new Date(),
      welcomeSent: false  // Welcome message sent when contact info is added later
    };
    
    // Remove null fields (but keep empty arrays)
    Object.keys(memberData).forEach(key => {
      if (memberData[key] === null) delete memberData[key];
    });
    
    try {
      let docId: string;
      
      if (this.challengeService.isDryRun) {
        docId = 'dry-run-member-' + (++this.dryRunIdCounter);
        this.teamMembers.push({ ...memberData, id: docId });
        this.lastSavedJobTitle.set(docId, memberData.jobTitle?.trim() ?? '');
        console.log('[DRY RUN] Added member locally:', docId, memberData.name);
      } else {
        const docRef = await addDoc(collection(this.db, 'team-members'), memberData);
        docId = docRef.id;
      }
      
      // Track team member added
      this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_TEAM_MEMBER_ADDED, {
        member_count: this.teamMembers.length,
        has_tags: hasTags
      });
      
      // If job title provided but no tags, auto-generate tags (also refreshes owner)
      if (jobTitle && !hasTags) {
        this.autoTagMember(docId, jobTitle);
      } else if (hasTags) {
        // Tags were pre-suggested — sync them to the owner so they stay cross-trained
        this.refreshOwnerTags();
      }
      
      // Reset form
      this.newMember = {
        name: '',
        jobTitle: '',
        tags: []
      };
      this.newMemberLastTaggedJobTitle = '';
      
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
    
    // Dry run: remove from local array
    if (this.challengeService.isDryRun) {
      this.teamMembers = this.teamMembers.filter(m => m.id !== member.id);
      if (member.id) this.lastSavedJobTitle.delete(member.id);
      this.refreshOwnerTags();
      console.log('[DRY RUN] Removed member:', member.id);
      return;
    }
    
    try {
      // Smart delete: check for related data before deciding
      const responsesQuery = query(
        collection(this.db, "survey-response"),
        where("teamMemberId", "==", member.id),
        limit(1)
      );
      const incidentsQuery = query(
        collection(this.db, "incident-report"),
        where("submittedBy", "==", member.id),
        limit(1)
      );
      const [responses, incidents] = await Promise.all([
        getDocs(responsesQuery),
        getDocs(incidentsQuery)
      ]);

      if (!responses.empty || !incidents.empty) {
        // Soft delete – preserve for historical references
        await updateDoc(doc(this.db, `team-members/${member.id}`), {
          deleted: true,
          deletedAt: new Date()
        });
      } else {
        // Hard delete – no related data
        await deleteDoc(doc(this.db, `team-members/${member.id}`));
      }
      
      // Refresh owner tags in case removed member had unique tags
      this.refreshOwnerTags();
    } catch (err) {
      console.error('Error removing team member:', err);
    }
  }

  // CSV Import
  downloadCsvTemplate(): void {
    const headers = ['Name', 'Job Title', 'Phone Number', 'Email'];
    const exampleRows = [
      ['John Doe', 'Manager', '555-123-4567', 'john@example.com'],
      ['Jane Smith', 'Warehouse Associate', '555-987-6543', ''],
      ['Bob Wilson', 'Driver', '', 'bob@example.com']
    ];
    
    const csvContent = [
      headers.join(','),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'team_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  triggerCsvUpload(): void {
    this.csvFileInput?.nativeElement?.click();
  }

  async onCsvFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file || !this.challengeService.teamId) return;
    
    // Reset state
    this.csvUploading = true;
    this.csvError = null;
    this.csvImportResult = null;
    
    try {
      const parsedMembers = await this.parseCsvFile(file);
      
      // Check for parsing errors
      const errors = parsedMembers.flatMap(m => m.errors);
      if (errors.length > 0 && parsedMembers.every(m => m.errors.length > 0)) {
        this.csvError = errors[0];
        this.csvUploading = false;
        return;
      }
      
      // Import valid members
      const result = await this.importCsvMembers(parsedMembers);
      this.csvImportResult = result;
      
      if (result.success) {
        this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_TEAM_MEMBER_ADDED, {
          member_count: this.teamMembers.length + result.added,
          import_method: 'csv'
        });
      } else {
        this.csvError = result.errors[0] || 'Failed to import members';
      }
    } catch (err: any) {
      this.csvError = err.message || 'Failed to process CSV file';
    } finally {
      this.csvUploading = false;
      input.value = '';
    }
  }

  private async parseCsvFile(file: File): Promise<ParsedCsvMember[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split(/\r?\n/).filter(line => line.trim());
          
          if (lines.length < 2) {
            reject(new Error('CSV file must have a header row and at least one data row'));
            return;
          }
          
          const headers = this.parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
          const nameIdx = headers.findIndex(h => h.includes('name'));
          const jobIdx = headers.findIndex(h => h.includes('job') || h.includes('title'));
          const phoneIdx = headers.findIndex(h => h.includes('phone'));
          const emailIdx = headers.findIndex(h => h.includes('email'));
          
          if (nameIdx === -1) {
            reject(new Error('CSV must have a "Name" column'));
            return;
          }
          
          const parsedMembers: ParsedCsvMember[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            const values = this.parseCsvLine(lines[i]);
            const errors: string[] = [];
            
            const name = values[nameIdx]?.trim() || '';
            const jobTitle = jobIdx >= 0 ? values[jobIdx]?.trim() || '' : '';
            const phone = phoneIdx >= 0 ? this.formatCsvPhone(values[phoneIdx]?.trim() || '') : '';
            const email = emailIdx >= 0 ? values[emailIdx]?.trim().toLowerCase() || '' : '';
            
            // Auto-determine contact preference: use SMS if phone exists, otherwise use email
            const preferEmail = !phone && !!email;
            
            if (!name) {
              errors.push(`Row ${i + 1}: Name is required`);
            }
            
            parsedMembers.push({ name, jobTitle, phone, email, preferEmail, errors });
          }
          
          resolve(parsedMembers);
        } catch (error) {
          reject(new Error('Failed to parse CSV file'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  private formatCsvPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone;
  }

  private async importCsvMembers(members: ParsedCsvMember[]): Promise<CsvImportResult> {
    const validMembers = members.filter(m => m.errors.length === 0 && m.name);
    const allErrors = members.flatMap(m => m.errors);
    
    if (validMembers.length === 0) {
      return { success: false, added: 0, errors: allErrors.length ? allErrors : ['No valid members to import'] };
    }

    let added = 0;
    const importErrors: string[] = [];
    const membersToTag: { id: string; jobTitle: string }[] = [];

    // First pass: add all members
    for (const member of validMembers) {
      try {
        const memberData: any = {
          name: member.name,
          jobTitle: member.jobTitle || '',
          phone: member.phone || '',
          email: member.email || '',
          preferEmail: member.preferEmail,
          teamId: this.challengeService.teamId,
          createdAt: new Date(),
          tags: [],
          welcomeSent: false
        };

        // Remove empty fields
        Object.keys(memberData).forEach(key => {
          if (memberData[key] === '') delete memberData[key];
        });

        let docId: string;
        if (this.challengeService.isDryRun) {
          docId = 'dry-run-member-' + (++this.dryRunIdCounter);
          this.teamMembers.push({ ...memberData, id: docId });
        } else {
          const docRef = await addDoc(collection(this.db, 'team-members'), memberData);
          docId = docRef.id;
        }
        added++;
        
        // Queue for tagging if member has a job title
        if (member.jobTitle?.trim()) {
          membersToTag.push({ id: docId, jobTitle: member.jobTitle.trim() });
        }
      } catch (error) {
        importErrors.push(`Failed to add ${member.name}`);
      }
    }

    // Second pass: generate tags sequentially, accumulating tags for consistency
    // Each member's tags are passed to subsequent calls to ensure the AI reuses tags
    const accumulatedTags: string[] = [];
    for (const { id, jobTitle } of membersToTag) {
      const newTags = await this.autoTagMember(id, jobTitle, accumulatedTags);
      accumulatedTags.push(...newTags);
    }

    return {
      success: added > 0,
      added,
      errors: [...allErrors, ...importErrors]
    };
  }

  clearCsvResult(): void {
    this.csvImportResult = null;
    this.csvError = null;
  }

  canProceed(): boolean {
    if (this.teamMembers.length < 1) return false;
    // Block if user has started adding a new member but hasn't clicked Add
    if (this.hasUnsavedNewMember()) return false;
    // All team members must have a job title (contact info can be added later)
    return this.teamMembers.every(m => m.jobTitle?.trim());
  }

  // Check if user has begun entering a new member but hasn't added them yet
  hasUnsavedNewMember(): boolean {
    return !!(
      this.newMember.name.trim() ||
      this.newMember.jobTitle.trim() ||
      this.newMember.tags.length > 0
    );
  }

  // Get team members missing required info (only job title is required during onboarding)
  get membersMissingJobTitle(): TeamMember[] {
    return this.teamMembers.filter(m => !m.jobTitle?.trim());
  }

  get membersWithIssues(): TeamMember[] {
    return this.teamMembers.filter(m => !m.jobTitle?.trim());
  }

  async next(): Promise<void> {
    if (!this.canProceed() || this.isProcessing) return;
    
    // Proceed directly to next step (tags are auto-generated on add/import)
    await this.proceedToNextStep();
  }
  
  // Proceed to next step
  async proceedToNextStep(): Promise<void> {
    this.isProcessing = true;
    this.processingMessage = 'Setting up your team...';
    
    try {
      // Track step 3 completion
      this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP3_COMPLETE, {
        team_member_count: this.teamMembers.length
      });
      
      // Final sync of owner tags before moving on
      await this.refreshOwnerTags();
      
      // Send welcome messages to any members who already have contact info
      // (e.g. imported via CSV with phone/email). Members without contact info
      // will receive their welcome automatically when it's added later via the
      // teamMemberContactUpdated Firestore trigger.
      const membersWithContact = this.teamMembers.filter(
        m => (m.phone?.trim() || m.email?.trim()) && !m.welcomeSent
      );
      if (membersWithContact.length > 0 && this.challengeService.teamId) {
        this.processingMessage = 'Sending welcome messages...';
        try {
          const sendWelcomes = httpsCallable(this.functions, 'sendPendingWelcomeMessages');
          await sendWelcomes({ teamId: this.challengeService.teamId });
        } catch (err) {
          console.error('Error sending welcome messages:', err);
          // Don't block navigation if welcome messages fail
        }
      }
      
      // Navigate to next step
      this.router.navigate(['/get-started/step4']);
    } catch (err) {
      console.error('Error proceeding to next step:', err);
      this.analytics.trackError('step3_proceed', String(err));
    } finally {
      this.isProcessing = false;
      this.processingMessage = '';
    }
  }

  /**
   * Keep the owner's tags in sync: always includes 'owner' plus every unique
   * tag from all other team members, so the owner is cross-trained on everything.
   * Works in both normal and dry-run modes.
   */
  private async refreshOwnerTags(): Promise<void> {
    try {
      // Find the owner's linked team member (has linkedUserId set)
      const ownerMember = this.teamMembers.find(m => (m as any).linkedUserId);
      if (!ownerMember?.id) return;

      // Always start with the 'owner' tag
      const mergedTags = new Set<string>(['owner']);

      // Inherit every tag from all other team members
      this.teamMembers.forEach(m => {
        if (m.id !== ownerMember.id) {
          (m.tags || []).forEach(tag => mergedTags.add(tag));
        }
      });

      const newTags = Array.from(mergedTags);

      // Skip update if tags haven't actually changed
      const currentTags = new Set(ownerMember.tags || []);
      if (newTags.length === currentTags.size && newTags.every(t => currentTags.has(t))) {
        return;
      }

      if (this.challengeService.isDryRun) {
        ownerMember.tags = newTags;
      } else {
        await updateDoc(doc(this.db, `team-members/${ownerMember.id}`), { tags: newTags });
      }
    } catch (err) {
      console.error('Error refreshing owner tags:', err);
      // Non-blocking — don't prevent other operations
    }
  }

  /** Check if a member is the owner (has linkedUserId) */
  isOwnerMember(member: TeamMember): boolean {
    return !!(member as any).linkedUserId;
  }
  
  // Check if a member is currently being tagged
  isMemberBeingTagged(memberId: string): boolean {
    return this.membersBeingTagged.has(memberId);
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

  /** Debounced handler for new member job title — fetches tags after user stops typing. */
  onNewMemberJobTitleChange(): void {
    if (this.newMemberJobTitleDebounceTimer) {
      clearTimeout(this.newMemberJobTitleDebounceTimer);
    }
    this.newMemberJobTitleDebounceTimer = setTimeout(
      () => {
        this.newMemberJobTitleDebounceTimer = null;
        this.suggestTagsForNewMember();
      },
      Step3Component.JOB_TITLE_DEBOUNCE_MS
    );
  }

  /** On blur: cancel debounce and fetch tags immediately. */
  onNewMemberJobTitleBlur(): void {
    if (this.newMemberJobTitleDebounceTimer) {
      clearTimeout(this.newMemberJobTitleDebounceTimer);
      this.newMemberJobTitleDebounceTimer = null;
    }
    this.suggestTagsForNewMember();
  }

  // Auto-suggest tags based on job title using AI
  async suggestTagsForNewMember(): Promise<void> {
    const jobTitle = this.newMember.jobTitle?.trim();
    if (!jobTitle || this.isTagging) return;
    
    // Skip if the job title hasn't changed since we last generated tags
    if (jobTitle === this.newMemberLastTaggedJobTitle) return;
    
    // Skip if user is not authenticated - suggestTagsForJobTitle requires auth
    if (!this.auth.currentUser) return;
    
    this.isTagging = true;
    try {
      // Build team context - other members' job titles and their tags
      const teamMembers = this.teamMembers
        .filter(m => m.jobTitle?.trim())
        .map(m => ({
          jobTitle: m.jobTitle,
          tags: m.tags || []
        }));
      
      const suggestTags = httpsCallable(this.functions, 'suggestTagsForJobTitle');
      const result: any = await suggestTags({ 
        jobTitle,
        existingTags: this.allTags,
        industry: this.challengeService.industry,
        teamMembers
      });
      
      // Guard: if the form was reset or the job title changed while the network
      // call was in flight, discard the stale response.
      const currentJobTitle = this.newMember.jobTitle?.trim();
      if (currentJobTitle !== jobTitle) return;

      if (result.data?.tags?.length > 0) {
        this.newMember.tags = result.data.tags;
      }
      this.newMemberLastTaggedJobTitle = jobTitle;
    } catch (err) {
      console.error('Error suggesting tags:', err);
    } finally {
      this.isTagging = false;
    }
  }

  // Track member by ID for ngFor performance
  trackByMemberId(index: number, member: TeamMember): string {
    return member.id || index.toString();
  }

  // Update a field value in pending changes (called on every keystroke)
  updateMemberField(member: TeamMember, field: keyof TeamMember, value: any): void {
    if (!member.id) return;
    
    // With [(ngModel)], the model stays in sync automatically. We only track pending
    // changes and debounce here.
    // Get or create pending changes for this member
    let changes = this.pendingChanges.get(member.id);
    if (!changes) {
      changes = {};
      this.pendingChanges.set(member.id, changes);
    }
    
    // Store the new value
    (changes as any)[field] = value;

    // Debounce job-title changes: after user stops typing, save and auto-generate tags.
    // Each keystroke resets the timer so it only fires when they've truly stopped.
    if (field === 'jobTitle') {
      const existing = this.jobTitleDebounceTimers.get(member.id);
      if (existing) clearTimeout(existing);
      this.jobTitleDebounceTimers.set(
        member.id,
        setTimeout(() => this.flushJobTitleAndAutoTag(member), Step3Component.JOB_TITLE_DEBOUNCE_MS)
      );
    }
  }

  /**
   * Flush pending job title change, save to Firestore, and trigger auto-tag.
   * Called by debounce timer or on blur (blur cancels debounce and runs immediately).
   */
  private async flushJobTitleAndAutoTag(member: TeamMember): Promise<void> {
    if (!member.id) return;
    this.jobTitleDebounceTimers.delete(member.id);
    const changes = this.pendingChanges.get(member.id);
    if (!changes || !('jobTitle' in changes)) return;
    const value = (changes as any).jobTitle;
    const jobTitle = value?.trim() || null;
    const lastSaved = this.lastSavedJobTitle.get(member.id) ?? '';
    if (!jobTitle || jobTitle === lastSaved) {
      delete (changes as any).jobTitle;
      return;
    }
    try {
      const originalMember = this.teamMembers.find(m => m.id === member.id);
      if (this.challengeService.isDryRun) {
        if (originalMember) originalMember.jobTitle = jobTitle;
      } else {
        await updateDoc(doc(this.db, `team-members/${member.id}`), { jobTitle });
      }
      this.lastSavedJobTitle.set(member.id, jobTitle);
      delete (changes as any).jobTitle;
      this.autoTagMember(member.id, jobTitle);
    } catch (err) {
      console.error('Error updating job title:', err);
    }
  }

  // Save pending changes on blur
  async onMemberFieldBlur(member: TeamMember, field: keyof TeamMember): Promise<void> {
    if (!member.id) return;
    // Cancel debounce for job title so we don't double-run; handle immediately
    if (field === 'jobTitle') {
      const t = this.jobTitleDebounceTimers.get(member.id);
      if (t) {
        clearTimeout(t);
        this.jobTitleDebounceTimers.delete(member.id);
      }
      await this.flushJobTitleAndAutoTag(member);
      return;
    }
    const changes = this.pendingChanges.get(member.id);
    if (!changes || !(field in changes)) return;
    
    const value = (changes as any)[field];
    const originalMember = this.teamMembers.find(m => m.id === member.id);
    
    try {
      const updates: any = {};
      
      if (field === 'name') {
        const name = value?.trim() || null;
        if (name) {
          updates.name = name;
        }
      }
      // jobTitle handled by flushJobTitleAndAutoTag (debounced or on blur)
      
      if (Object.keys(updates).length > 0) {
        if (this.challengeService.isDryRun) {
          // Dry run: update local member
          if (originalMember) Object.assign(originalMember, updates);
        } else {
          await updateDoc(doc(this.db, `team-members/${member.id}`), updates);
        }
      }
      
      // Clear the pending change for this field
      delete (changes as any)[field];
    } catch (err) {
      console.error('Error updating team member:', err);
    }
  }

  // Save tags immediately when changed
  async saveMemberTags(member: TeamMember, tags: string[]): Promise<void> {
    if (!member.id) return;
    
    try {
      if (this.challengeService.isDryRun) {
        // Dry run: update local member
        member.tags = tags;
      } else {
        await updateDoc(doc(this.db, `team-members/${member.id}`), { tags });
      }
      
      // Refresh owner tags when a non-owner's tags change
      if (!this.isOwnerMember(member)) this.refreshOwnerTags();
    } catch (err) {
      console.error('Error saving tags:', err);
    }
  }

  // Auto-tag an existing member by ID
  // additionalTags: extra tags to consider for consistency (used during bulk import)
  async autoTagMember(memberId: string, jobTitle: string, additionalTags: string[] = []): Promise<string[]> {
    if (!this.auth.currentUser) return [];
    try {
      // Combine existing tags from Firestore subscription with any additional tags passed in
      const existingTags = [...new Set([...this.allTags, ...additionalTags])];
      
      // Build team context - other members' job titles and their tags
      // This helps the AI understand the team structure and make consistent tag decisions
      const teamMembers = this.teamMembers
        .filter(m => m.id !== memberId && m.jobTitle?.trim()) // Exclude the member being tagged
        .map(m => ({
          jobTitle: m.jobTitle,
          tags: m.tags || []
        }));
      
      const suggestTags = httpsCallable(this.functions, 'suggestTagsForJobTitle');
      const result: any = await suggestTags({ 
        jobTitle,
        existingTags,
        industry: this.challengeService.industry,
        teamMembers
      });
      
      if (result.data?.tags?.length > 0) {
        const newTags = result.data.tags;
        
        // Write to Firestore only in real mode
        if (!this.challengeService.isDryRun) {
          await updateDoc(doc(this.db, `team-members/${memberId}`), { tags: newTags });
        }
        
        // Update local member and refresh owner tags
        const member = this.teamMembers.find(m => m.id === memberId);
        if (member) {
          member.tags = newTags;
          if (!this.isOwnerMember(member)) this.refreshOwnerTags();
        }
        return newTags;
      }
      return [];
    } catch (err) {
      console.error('Error auto-tagging member:', err);
      return [];
    }
  }
}
