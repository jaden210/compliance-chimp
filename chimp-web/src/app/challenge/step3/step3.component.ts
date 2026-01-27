import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { trigger, transition, style, animate, query, stagger } from "@angular/animations";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
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
import { Firestore, collection, collectionData, addDoc, deleteDoc, doc, updateDoc } from "@angular/fire/firestore";
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
  
  // Processing state for Continue button
  isProcessing = false;
  processingMessage = '';
  membersBeingTagged: Set<string> = new Set();

  constructor(
    private challengeService: ChallengeService,
    private router: Router,
    private db: Firestore,
    private functions: Functions,
    private dialog: MatDialog,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // Track step 3 view
    this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP3_VIEW);
    
    // Subscribe to team members collection
    if (this.challengeService.teamId) {
      const membersCollection = collection(this.db, 'team-members');
      this.teamMembersSub = collectionData(membersCollection, { idField: 'id' }).subscribe(
        (members: any[]) => {
          this.teamMembers = members
            .filter(m => m.teamId === this.challengeService.teamId)
            .sort((a, b) => {
              // Sort by createdAt so newest members appear at bottom
              const aTime = a.createdAt?.toMillis?.() || a.createdAt?.getTime?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || b.createdAt?.getTime?.() || 0;
              return aTime - bTime;
            });
        }
      );
    }
  }

  ngOnDestroy(): void {
    if (this.teamMembersSub) {
      this.teamMembersSub.unsubscribe();
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
    const jobTitle = this.newMember.jobTitle?.trim() || null;
    const hasTags = this.newMember.tags.length > 0;
    
    const memberData: any = {
      name: this.newMember.name.trim(),
      phone: phone,
      email: this.newMember.email ? this.newMember.email.trim().toLowerCase() : null,
      preferEmail: this.newMember.preferEmail,
      jobTitle: jobTitle,
      tags: this.newMember.tags || [],
      teamId: this.challengeService.teamId,
      createdAt: new Date(),
      welcomeSent: false  // Don't send welcome during onboarding - will be sent when completing Step 3
    };
    
    // Remove null fields (but keep empty arrays)
    Object.keys(memberData).forEach(key => {
      if (memberData[key] === null) delete memberData[key];
    });
    
    try {
      const docRef = await addDoc(collection(this.db, 'team-members'), memberData);
      
      // Track team member added
      this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_TEAM_MEMBER_ADDED, {
        member_count: this.teamMembers.length + 1,
        has_email: !!memberData.email,
        has_tags: hasTags
      });
      
      // If job title provided but no tags, auto-generate tags
      if (jobTitle && !hasTags) {
        this.autoTagMember(docRef.id, jobTitle);
      }
      
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

  // Toggle contact preference directly from view mode
  async toggleMemberPreference(member: TeamMember, preferEmail: boolean): Promise<void> {
    if (!member.id) return;
    
    try {
      await updateDoc(doc(this.db, `team-members/${member.id}`), {
        preferEmail: preferEmail
      });
    } catch (err) {
      console.error('Error updating member preference:', err);
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
            
            // Must have at least phone or email
            if (!phone && !email) {
              errors.push(`Row ${i + 1}: Phone or email is required`);
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

    // First pass: add all members to Firestore
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

        const docRef = await addDoc(collection(this.db, 'team-members'), memberData);
        added++;
        
        // Queue for tagging if member has a job title
        if (member.jobTitle?.trim()) {
          membersToTag.push({ id: docRef.id, jobTitle: member.jobTitle.trim() });
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
    // All team members must have a job title AND contact info (phone or email)
    return this.teamMembers.every(m => 
      m.jobTitle?.trim() && 
      (m.phone?.trim() || m.email?.trim())
    );
  }

  // Check if user has begun entering a new member but hasn't added them yet
  hasUnsavedNewMember(): boolean {
    return !!(
      this.newMember.name.trim() ||
      this.newMember.email.trim() ||
      this.newMember.phone.trim() ||
      this.newMember.jobTitle.trim() ||
      this.newMember.tags.length > 0
    );
  }

  // Get team members missing required info
  get membersMissingJobTitle(): TeamMember[] {
    return this.teamMembers.filter(m => !m.jobTitle?.trim());
  }

  get membersMissingContact(): TeamMember[] {
    return this.teamMembers.filter(m => !m.phone?.trim() && !m.email?.trim());
  }

  get membersWithIssues(): TeamMember[] {
    return this.teamMembers.filter(m => 
      !m.jobTitle?.trim() || (!m.phone?.trim() && !m.email?.trim())
    );
  }

  async next(): Promise<void> {
    if (!this.canProceed() || this.isProcessing) return;
    
    // Proceed directly to next step (tags are auto-generated on add/import)
    await this.proceedToNextStep();
  }
  
  // Proceed to next step
  async proceedToNextStep(): Promise<void> {
    this.isProcessing = true;
    this.processingMessage = 'Sending welcome messages...';
    
    try {
      // Track step 3 completion
      this.analytics.trackSignupFunnel(FunnelStep.CHALLENGE_STEP3_COMPLETE, {
        team_member_count: this.teamMembers.length
      });
      
      // Send pending welcome messages to all team members
      if (this.challengeService.teamId) {
        try {
          const sendWelcomes = httpsCallable(this.functions, 'sendPendingWelcomeMessages');
          await sendWelcomes({ teamId: this.challengeService.teamId });
          console.log('Welcome messages sent');
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

  // Auto-suggest tags based on job title using AI
  async suggestTagsForNewMember(): Promise<void> {
    const jobTitle = this.newMember.jobTitle?.trim();
    if (!jobTitle || this.isTagging) return;
    
    // Only suggest if no tags already set
    if (this.newMember.tags.length > 0) return;
    
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
      
      if (result.data?.tags?.length > 0) {
        this.newMember.tags = result.data.tags;
      }
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
    
    // Get or create pending changes for this member
    let changes = this.pendingChanges.get(member.id);
    if (!changes) {
      changes = {};
      this.pendingChanges.set(member.id, changes);
    }
    
    // Store the new value
    (changes as any)[field] = value;
  }

  // Save pending changes on blur
  async onMemberFieldBlur(member: TeamMember, field: keyof TeamMember): Promise<void> {
    if (!member.id) return;
    
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
      } else if (field === 'jobTitle') {
        const jobTitle = value?.trim() || null;
        const oldJobTitle = originalMember?.jobTitle?.trim() || null;
        updates.jobTitle = jobTitle;
        
        // If job title changed, regenerate tags
        if (jobTitle && jobTitle !== oldJobTitle) {
          await updateDoc(doc(this.db, `team-members/${member.id}`), updates);
          this.autoTagMember(member.id, jobTitle);
          delete (changes as any)[field];
          return;
        }
      } else if (field === 'phone') {
        updates.phone = value?.trim() ? this.formatPhone(value.trim()) : null;
      } else if (field === 'email') {
        updates.email = value?.trim()?.toLowerCase() || null;
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(this.db, `team-members/${member.id}`), updates);
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
      await updateDoc(doc(this.db, `team-members/${member.id}`), { tags });
    } catch (err) {
      console.error('Error saving tags:', err);
    }
  }

  // Auto-tag an existing member by ID
  // additionalTags: extra tags to consider for consistency (used during bulk import)
  async autoTagMember(memberId: string, jobTitle: string, additionalTags: string[] = []): Promise<string[]> {
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
        await updateDoc(doc(this.db, `team-members/${memberId}`), {
          tags: result.data.tags
        });
        return result.data.tags;
      }
      return [];
    } catch (err) {
      console.error('Error auto-tagging member:', err);
      return [];
    }
  }
}
