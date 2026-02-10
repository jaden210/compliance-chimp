import { Component, Inject, ViewChild, OnDestroy, ElementRef } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { AccountService, User, InviteToTeam, TeamMember, Team } from "../account.service";
import moment from "moment";
import {
  MatDialog,
  MatDialogRef,
  MatDialogModule,
  MAT_DIALOG_DATA
} from "@angular/material/dialog";
import { MatTableModule, MatTable } from "@angular/material/table";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatMenuModule } from "@angular/material/menu";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDividerModule } from "@angular/material/divider";
import { MapDialogComponent } from "../map-dialog/map-dialog.component";
import { TagInputComponent } from "./tag-input/tag-input.component";
import { getTagColor } from "../../shared/tag-colors";
import { WelcomeService } from "../welcome.service";
import { WelcomeBannerComponent, WelcomeFeature } from "../welcome-banner/welcome-banner.component";
import { Observable, Subscription, forkJoin, combineLatest } from "rxjs";
import { TeamService } from "./team.service";
import { SelfInspection } from "../self-inspections/self-inspections.service";
import { TrainingService, MyContent } from "../training/training.service";
import { Router, ActivatedRoute } from "@angular/router";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Firestore, addDoc, collection, collectionData, deleteDoc, doc, updateDoc } from "@angular/fire/firestore";
import { ParsedCsvMember, CsvImportResult } from "./team.service";
import { Storage, ref, uploadBytes, getDownloadURL } from "@angular/fire/storage";
import { map } from "rxjs/operators";
import { MatProgressBarModule } from "@angular/material/progress-bar";
declare var gtag: Function;

@Component({
  standalone: true,
  selector: "app-team",
  templateUrl: "./team.component.html",
  styleUrls: ["./team.component.scss"],
  providers: [TrainingService],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatTableModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatMenuModule,
    MatExpansionModule,
    MatDividerModule,
    MatTooltipModule,
    TagInputComponent,
    WelcomeBannerComponent
  ]
})
export class TeamComponent implements OnDestroy {
  private subscription: Subscription;
  files: Observable<any>;
  teamMembers:TeamMember[] = [];
  managers: User[] = [];
  @ViewChild(MatTable) table: MatTable<any>;
  @ViewChild('emptyStateNameInput') emptyStateNameInput: ElementRef<HTMLInputElement>;
  @ViewChild('mainTableNameInput') mainTableNameInput: ElementRef<HTMLInputElement>;
  @ViewChild('membersSection') membersSection: ElementRef<HTMLElement>;
  displayedColumns: string[] = [
    "name",
    "compliance",
    "page",
    "invites",
  ];
  public helper: any;
  public trainingComplete: number;
  public needsTraining: string[];
  public trainingsGiven: number;

  selfInspection;
  achievements;
  completedCount: number;
  complianceLevel: number;
  showTable: boolean = false;
  
  // Inline table entry
  newMember: TeamMember = new TeamMember();
  
  // Validation state
  newMemberPhoneError: boolean = false;
  newMemberEmailError: boolean = false;
  memberValidationErrors: { [memberId: string]: { phone?: boolean; email?: boolean } } = {};
  
  // Search
  searchQuery: string = '';
  
  // CSV import
  csvUploading: boolean = false;
  csvError: string = null;
  csvImportResult: CsvImportResult = null;
  @ViewChild('csvFileInput') csvFileInput: ElementRef<HTMLInputElement>;
  
  // Get all unique tags from team members for autocomplete
  get allTags(): string[] {
    const tagsSet = new Set<string>();
    this.teamMembers.forEach(tm => {
      (tm.tags || []).forEach(tag => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }

  // Get tag counts for overview
  get tagCounts(): { tag: string; count: number }[] {
    const counts: { [tag: string]: number } = {};
    this.teamMembers.forEach(tm => {
      (tm.tags || []).forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count); // Sort by count descending
  }

  // Use shared tag color utility
  getTagColor = getTagColor;

  // Filtered team members based on search
  get filteredTeamMembers(): TeamMember[] {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      return this.teamMembers;
    }
    const query = this.searchQuery.toLowerCase().trim();
    return this.teamMembers.filter(tm => 
      tm.name?.toLowerCase().includes(query) ||
      tm.jobTitle?.toLowerCase().includes(query) ||
      tm.email?.toLowerCase().includes(query) ||
      tm.phone?.includes(query) ||
      (tm.tags || []).some(tag => tag.toLowerCase().includes(query))
    );
  }

  // Validation helpers
  isValidEmail(email: string): boolean {
    if (!email || email.trim() === '') return true; // Empty is valid (not required until preferEmail)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  isValidPhone(phone: string): boolean {
    if (!phone || phone.trim() === '') return true; // Empty is valid (not required until SMS mode)
    // Remove all non-digits and check if we have 10 digits
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11; // 10 or 11 (with country code)
  }

  validateNewMemberPhone(): void {
    this.newMemberPhoneError = !this.isValidPhone(this.newMember.phone);
  }

  validateNewMemberEmail(): void {
    this.newMemberEmailError = !this.isValidEmail(this.newMember.email);
  }

  validateMemberPhone(member: TeamMember): void {
    if (!this.memberValidationErrors[member.id]) {
      this.memberValidationErrors[member.id] = {};
    }
    this.memberValidationErrors[member.id].phone = !this.isValidPhone(member.phone);
  }

  validateMemberEmail(member: TeamMember): void {
    if (!this.memberValidationErrors[member.id]) {
      this.memberValidationErrors[member.id] = {};
    }
    this.memberValidationErrors[member.id].email = !this.isValidEmail(member.email);
  }

  hasMemberPhoneError(member: TeamMember): boolean {
    return this.memberValidationErrors[member.id]?.phone || false;
  }

  hasMemberEmailError(member: TeamMember): boolean {
    return this.memberValidationErrors[member.id]?.email || false;
  }

  // Welcome banner features
  teamWelcomeFeatures: WelcomeFeature[] = [
    {
      icon: 'local_offer',
      title: 'Tags',
      description: 'Organize team members with tags (Warehouse, Office, Driver) to auto-assign relevant training to the right people.',
      action: 'scrollToMembers'
    },
    {
      icon: 'sms',
      title: 'Contact Preferences',
      description: 'Toggle between SMS and email for each member. SMS is faster and gets higher engagement.',
      action: 'scrollToMembers'
    },
    {
      icon: 'admin_panel_settings',
      title: 'Manager Access',
      description: 'Add managers who can run trainings, view progress, and help manage your compliance program.',
      action: 'managerAccess'
    },
    {
      icon: 'folder',
      title: 'Team Files',
      description: 'Upload safety manuals, certificates, and documents for team-wide access from their user pages.',
      action: 'teamFiles'
    },
    {
      icon: 'person',
      title: 'User Pages',
      description: 'Each team member has their own compliance dashboard showing training status, inspections, and more.',
      action: 'scrollToMembers'
    }
  ];

  constructor(
    public accountService: AccountService,
    public dialog: MatDialog,
    private teamService: TeamService,
    private router: Router,
    private route: ActivatedRoute,
    private functions: Functions,
    public welcomeService: WelcomeService
  ) {
    this.accountService.helper = this.accountService.helperProfiles.team;
    this.accountService.showLD = true;
    
    // Check for showTagsHelp query param (from tour)
    this.route.queryParams.subscribe(params => {
      if (params['showTagsHelp'] === 'true') {
        // Small delay to ensure component is ready
        setTimeout(() => this.openTagsHelpDialog(), 100);
        // Clear the query param
        this.router.navigate([], { queryParams: {}, replaceUrl: true });
      }
    });
    
    this.subscription = this.accountService.teamMembersObservable.subscribe(teamMembers => {
        if (teamMembers) {
          teamMembers.forEach(tm => {
            this.teamService.getSurveysByTeamMember(tm.id).subscribe(([surveys, surveyResponses]) => {
              tm['surveyCount'] = `${surveyResponses.length || 0} | ${surveys.length || 0}`;
              tm['surveys'] = surveys.map(s => {
                s.response = surveyResponses.find(sr => sr.surveyId == s.id);
                return s;
              });
            });
          });
          this.files = this.teamService.getFiles();
          this.teamMembers = teamMembers;
          this.showTable = true;
        }
      }
    );
    this.accountService.teamManagersObservable.subscribe(managers => this.managers = managers);
  }

  /**
   * Check if a team member is the linked owner/manager (has linkedUserId).
   */
  isLinkedManager(member: TeamMember): boolean {
    return !!(member as any).linkedUserId;
  }

  public routeToUserPage(member: TeamMember) {
    // If this member is linked to a manager, use user-id param for the manager view
    if ((member as any).linkedUserId) {
      const url = `/user?user-id=${(member as any).linkedUserId}`;
      window.open(url, '_blank');
    } else {
      const url = `/user?member-id=${member.id}`;
      window.open(url, '_blank');
    }
  }

  // Handle welcome banner feature clicks
  onWelcomeFeatureClick(action: string): void {
    switch (action) {
      case 'managerAccess':
        this.manageManagers();
        break;
      case 'teamFiles':
        this.router.navigate(['/account/files']);
        break;
      case 'scrollToMembers':
        this.scrollToMembersSection();
        break;
    }
  }

  scrollToMembersSection(): void {
    if (this.membersSection?.nativeElement) {
      this.membersSection.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  scrollToAddMember(): void {
    // Clear search to ensure the add row is visible
    this.searchQuery = '';
    
    // Scroll to the add row and focus the name input
    setTimeout(() => {
      if (this.mainTableNameInput?.nativeElement) {
        this.mainTableNameInput.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Focus after scroll animation completes
        setTimeout(() => {
          this.mainTableNameInput.nativeElement.focus();
        }, 300);
      }
    }, 0);
  }

  filterByTag(tag: string): void {
    this.searchQuery = tag;
  }

  public resendInvite(teamMember: TeamMember): void {
    teamMember['sending'] = true;
    const sendInvite = httpsCallable(this.functions, "resendTeamMemberInvite");
    sendInvite({ teamMember: teamMember, team: this.accountService.aTeam}).then(() => {
      delete teamMember['sending'];
    });
  }

  public manageManagers(): void {
    this.dialog.open(ManagersDialog);
  }

  openTeamFilesDialog() {
    this.dialog.open(TeamFilesDialog);
  }

  public openUserSurveyDialog(user: TeamMember): void {
    this.dialog.open(SurveysDialog, {
      data: user
    })
  }

  public saveTeamMember(teamMember: TeamMember) {
    // Validate before saving
    this.validateMemberPhone(teamMember);
    this.validateMemberEmail(teamMember);
    
    // Don't save if there are validation errors
    if (this.hasMemberPhoneError(teamMember) || this.hasMemberEmailError(teamMember)) {
      return;
    }
    
    // Format phone number if provided
    if (teamMember.phone) {
      const cleaned = ('' + teamMember.phone).replace(/\D/g, '');
      const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
      if (match) {
        teamMember.phone = '(' + match[1] + ') ' + match[2] + '-' + match[3];
      }
    }
    
    const cleanedMember = Object.fromEntries(
      Object.entries(teamMember).filter(([_, v]) => v !== undefined)
    );
    updateDoc(doc(this.accountService.db, `team-members/${teamMember.id}`), cleanedMember);
  }
  
  editTeamMember(teamMember: TeamMember) {
    let dialog = this.dialog.open(EditUserDialog, {
      data: teamMember,
      disableClose: true
    });
    dialog.afterClosed().subscribe((data: TeamMember) => {
      if (data) {
        if (data['removeFromTeam']) {
          this.teamService.removeUser(data);
        } else {
          const cleanedData = Object.fromEntries(
            Object.entries(data).filter(([_, v]) => v !== undefined)
          );
          updateDoc(doc(this.accountService.db, `team-members/${data.id}`), cleanedData);
        }
      }
    });
  }

  // Inline table methods
  trackByMemberId(index: number, member: TeamMember): string {
    return member.id;
  }

  onTagsChange(member: TeamMember, tags: string[]): void {
    member.tags = tags;
    // Force change detection by creating new array reference so allTags updates across all tag-inputs
    this.teamMembers = [...this.teamMembers];
    this.saveTeamMember(member);
    
    // Keep the owner's linked member in sync with all team tags
    this.syncOwnerTags();
  }

  /**
   * Ensure the owner's linked team-member record has all unique tags from the team,
   * so they receive every training assigned to any tag.
   */
  private syncOwnerTags(): void {
    const ownerMember = this.teamMembers.find(m => this.isLinkedManager(m));
    if (!ownerMember?.id) return;

    // Collect all unique tags from non-owner members
    const allTags = new Set<string>();
    this.teamMembers.forEach(m => {
      if (m.id !== ownerMember.id) {
        (m.tags || []).forEach(tag => allTags.add(tag));
      }
    });

    const newTags = Array.from(allTags).sort();
    const currentTags = (ownerMember.tags || []).slice().sort();

    // Only update if tags actually changed
    if (JSON.stringify(newTags) !== JSON.stringify(currentTags)) {
      ownerMember.tags = newTags;
      updateDoc(doc(this.accountService.db, `team-members/${ownerMember.id}`), { tags: newTags });
    }
  }

  addNewMember(): void {
    // Validate based on contact preference
    if (!this.newMember.name) {
      return;
    }
    if (this.newMember.preferEmail && !this.newMember.email) {
      return;
    }
    if (!this.newMember.preferEmail && !this.newMember.phone) {
      return;
    }
    
    // Validate phone format if provided
    if (this.newMember.phone && !this.isValidPhone(this.newMember.phone)) {
      this.newMemberPhoneError = true;
      return;
    }
    
    // Validate email format if using email
    if (this.newMember.preferEmail && !this.isValidEmail(this.newMember.email)) {
      this.newMemberEmailError = true;
      return;
    }
    
    // Format phone number if provided
    if (this.newMember.phone) {
      const cleaned = ('' + this.newMember.phone).replace(/\D/g, '');
      const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
      if (match) {
        this.newMember.phone = '(' + match[1] + ') ' + match[2] + '-' + match[3];
      }
    }
    
    const newMember: any = {
      name: this.newMember.name,
      phone: this.newMember.phone || null,
      email: this.newMember.email ? this.newMember.email.toLowerCase() : null,
      preferEmail: this.newMember.preferEmail || false,
      jobTitle: this.newMember.jobTitle || null,
      tags: this.newMember.tags || [],
      teamId: this.accountService.aTeam.id,
      createdAt: new Date()
    };
    
    // Remove undefined/null fields
    const cleanedMember = Object.fromEntries(
      Object.entries(newMember).filter(([_, v]) => v !== undefined && v !== null)
    );
    
    addDoc(collection(this.accountService.db, "team-members"), cleanedMember);
    
    // Reset the new member form and validation state
    this.newMember = new TeamMember();
    this.newMemberPhoneError = false;
    this.newMemberEmailError = false;
    
    // Focus on the name input for the next entry
    // Use setTimeout to allow the DOM to update after the form reset
    setTimeout(() => {
      // After adding the first member, the main table will be shown
      // So we try the main table input first, then fall back to empty state
      if (this.mainTableNameInput?.nativeElement) {
        this.mainTableNameInput.nativeElement.focus();
      } else if (this.emptyStateNameInput?.nativeElement) {
        this.emptyStateNameInput.nativeElement.focus();
      }
    }, 0);
  }

  confirmDeleteMember(member: TeamMember): void {
    // Prevent deleting the linked owner/manager record
    if (this.isLinkedManager(member)) return;
    
    if (confirm(`Are you sure you want to remove ${member.name} from the team?`)) {
      this.teamService.removeUser(member).then(() => {
        // Re-sync owner tags after member removal
        this.syncOwnerTags();
      });
    }
  }

  // ============ CSV Import Methods ============

  /**
   * Download the CSV template
   */
  downloadCsvTemplate(): void {
    this.teamService.downloadCsvTemplate();
  }

  /**
   * Trigger file input click
   */
  triggerCsvUpload(): void {
    this.csvFileInput?.nativeElement?.click();
  }

  /**
   * Handle CSV file selection
   */
  async onCsvFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    // Reset state
    this.csvUploading = true;
    this.csvError = null;
    this.csvImportResult = null;
    
    try {
      // Parse the CSV file
      const parsedMembers = await this.teamService.parseCsvFile(file);
      
      // Check for parsing errors
      const errors = parsedMembers.flatMap(m => m.errors);
      if (errors.length > 0 && parsedMembers.every(m => m.errors.length > 0)) {
        this.csvError = errors[0];
        this.csvUploading = false;
        return;
      }
      
      // Import valid members
      const result = await this.teamService.importCsvMembers(parsedMembers);
      this.csvImportResult = result;
      
      if (!result.success) {
        this.csvError = result.errors[0] || "Failed to import members";
      }
    } catch (err: any) {
      this.csvError = err.message || "Failed to process CSV file";
    } finally {
      this.csvUploading = false;
      // Reset file input
      input.value = '';
    }
  }

  /**
   * Clear CSV import result/error
   */
  clearCsvResult(): void {
    this.csvImportResult = null;
    this.csvError = null;
  }

  openTagsHelpDialog(): void {
    this.dialog.open(TagsHelpDialog, {
      width: "520px"
    });
  }

  openTeamCoverageDialog(): void {
    this.dialog.open(TeamCoverageDialog, {
      width: "520px"
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}

@Component({
  standalone: true,
  selector: "tags-help-dialog",
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">local_offer</mat-icon>
      Understanding Tags
    </h2>
    <mat-dialog-content>
      <div class="help-section">
        <h3>What are tags?</h3>
        <p>
          Tags are labels you assign to team members to group them by department, job title, 
          or any other category that makes sense for your organization.
        </p>
      </div>

      <div class="help-section">
        <h3>Why use tags?</h3>
        <p>
          Tags help you organize your team and automate how safety content is distributed. 
          Instead of manually assigning trainings to each person, you can assign trainings 
          to a tag—and everyone with that tag automatically receives it.
        </p>
      </div>

      <div class="help-section">
        <h3>How tags work with training</h3>
        <p>
          In the Training Library, you can assign training articles to specific tags. 
          When you do this, all team members with those tags will automatically have 
          that training added to their requirements.
        </p>
        <div class="example-box">
          <mat-icon>lightbulb</mat-icon>
          <span>
            <strong>Example:</strong> Assign "Forklift Safety" training to the "Warehouse" tag, 
            and every team member tagged "Warehouse" will receive it.
          </span>
        </div>
      </div>

      <div class="help-section">
        <h3>Best practices</h3>
        <p>
          Create tags based on departments or categories within your company. Common examples include:
        </p>
        <div class="tag-examples">
          <span class="tag-chip">Warehouse</span>
          <span class="tag-chip">Office</span>
          <span class="tag-chip">Driver</span>
          <span class="tag-chip">Manager</span>
          <span class="tag-chip">New Hire</span>
          <span class="tag-chip">Forklift Operator</span>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" mat-dialog-close>Got it</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      padding: 16px 24px;
      font-size: 20px;
      font-weight: 500;
    }
    .title-icon {
      color: #7c4dff;
    }
    mat-dialog-content {
      padding: 0 24px 16px;
    }
    .help-section {
      margin-bottom: 20px;
    }
    .help-section:last-child {
      margin-bottom: 0;
    }
    .help-section h3 {
      font-size: 15px;
      font-weight: 600;
      color: #333;
      margin: 0 0 8px 0;
    }
    .help-section p {
      font-size: 14px;
      color: #555;
      margin: 0;
      line-height: 1.5;
    }
    .example-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: #f5f5f5;
      border-radius: 8px;
      padding: 12px;
      margin-top: 10px;
    }
    .example-box mat-icon {
      color: #ff9800;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .example-box span {
      font-size: 13px;
      color: #555;
      line-height: 1.5;
    }
    .tag-examples {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .tag-chip {
      display: inline-block;
      background: #e8eaf6;
      color: #3f51b5;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
    }
  `],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class TagsHelpDialog {
  constructor(public dialogRef: MatDialogRef<TagsHelpDialog>) {}
}

@Component({
  standalone: true,
  selector: "team-coverage-dialog",
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">groups</mat-icon>
      Keep Your Team Up-to-Date
    </h2>
    <mat-dialog-content>
      <div class="intro-text">
        Different job titles have different safety requirements. By adding your full team with their job titles and tags, 
        you ensure the right inspections, trainings, and surveys reach the right people—so nothing gets missed.
      </div>

      <div class="benefits-section">
        <h3>Complete coverage means:</h3>
        <div class="benefit-item">
          <mat-icon>check_circle</mat-icon>
          <div>
            <strong>Tailored safety checklists</strong>
            <p>Inspections based on actual job titles and responsibilities</p>
          </div>
        </div>
        <div class="benefit-item">
          <mat-icon>check_circle</mat-icon>
          <div>
            <strong>Targeted training assignments</strong>
            <p>The right training content reaches the right people automatically</p>
          </div>
        </div>
        <div class="benefit-item">
          <mat-icon>check_circle</mat-icon>
          <div>
            <strong>Complete audit trail</strong>
            <p>Documentation for every team member's compliance status</p>
          </div>
        </div>
      </div>

      <div class="tip-box">
        <mat-icon>lightbulb</mat-icon>
        <span>
          <strong>Tip:</strong> Use tags to group team members by department, job title, or any category, 
          then assign trainings to entire tags at once.
        </span>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" mat-dialog-close>Got it</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      padding: 16px 24px;
      font-size: 20px;
      font-weight: 500;
    }
    .title-icon {
      color: #ff9800;
    }
    mat-dialog-content {
      padding: 0 24px 16px;
    }
    .intro-text {
      font-size: 14px;
      color: #555;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .benefits-section h3 {
      font-size: 15px;
      font-weight: 600;
      color: #333;
      margin: 0 0 12px 0;
    }
    .benefit-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
    }
    .benefit-item mat-icon {
      color: #4caf50;
      font-size: 22px;
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .benefit-item div {
      flex: 1;
    }
    .benefit-item strong {
      display: block;
      font-size: 14px;
      color: #333;
      margin-bottom: 2px;
    }
    .benefit-item p {
      margin: 0;
      font-size: 13px;
      color: #666;
      line-height: 1.4;
    }
    .tip-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: #fff3e0;
      border-radius: 8px;
      padding: 12px;
      margin-top: 8px;
    }
    .tip-box mat-icon {
      color: #ff9800;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .tip-box span {
      font-size: 13px;
      color: #555;
      line-height: 1.5;
    }
  `],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class TeamCoverageDialog {
  constructor(public dialogRef: MatDialogRef<TeamCoverageDialog>) {}
}

@Component({
  standalone: true,
  selector: "invite-dialog",
  templateUrl: "invite-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule
  ]
})
export class InviteDialog {
  public phoneError: boolean = false;
  constructor(
    public dialogRef: MatDialogRef<InviteDialog>,
    private teamService: TeamService,
    @Inject(MAT_DIALOG_DATA) public invite: any
  ) {}

  public formatPhone(): void {
    let numbers = this.invite.phone;
    const cleaned = ('' + numbers).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      this.invite.phone = '(' + match[1] + ') ' + match[2] + '-' + match[3],
      this.phoneError = false;
    } else {
      this.phoneError = true;
    }
    return null;
  }


  close(): void {
    this.dialogRef.close();
  }
}

@Component({
  standalone: true,
  selector: "surveys-dialog",
  templateUrl: "surveys-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ]
})
export class SurveysDialog {
  constructor(
    public dialogRef: MatDialogRef<SurveysDialog>,
    public accountService: AccountService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    console.log(this.data);
    
  }

  close(): void {
    this.dialogRef.close();
  }
}

@Component({
  standalone: true,
  selector: "edit-user-dialog",
  templateUrl: "user-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatCheckboxModule
  ]
})
export class EditUserDialog {
  constructor(
    public dialogRef: MatDialogRef<EditUserDialog>,
    public accountService: AccountService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.data.removeFromTeam = false;
  }

  close(): void {
    this.dialogRef.close();
  }
}


@Component({
  standalone: true,
  selector: "managers-dialog",
  templateUrl: "managers-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule
  ]
})
export class ManagersDialog {
  public newManager: User = null;
  public phoneError: boolean = false;
  public sendingAccessLink: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<EditUserDialog>,
    public accountService: AccountService,
    private functions: Functions,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {

  }

  public get Managers(): User[] {
    return this.accountService.teamManagers;
  }

  public isYou(id): boolean {
    return this.accountService.user.id == id;
  }

  public isOwner(id): boolean {
    return this.accountService.aTeam.ownerId == id;
  }

  public startManager(): void {
    this.newManager = new User();
  }

  public createManager(): void {
    this.accountService.createUser(this.newManager).then(() => {
      this.newManager = null;
    });
  }

  public removeManager(user: User): void {
    user.disabledBy = this.accountService.user.id;
    this.accountService.updateUser(user).then(() => {
      
    });
  }

  public formatPhone(): void {
    let numbers = this.newManager.phone;
    if (!numbers || numbers.trim() === '') {
      this.phoneError = false;
      return;
    }
    const cleaned = ('' + numbers).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      this.newManager.phone = '(' + match[1] + ') ' + match[2] + '-' + match[3],
      this.phoneError = false;
    } else {
      this.phoneError = true;
    }
  }

  /**
   * Open the user page for the logged-in manager.
   * Uses user-id parameter since managers are in the 'user' collection.
   */
  public viewYourUserPage(): void {
    const userId = this.accountService.user?.id;
    if (userId) {
      const url = `/user?user-id=${userId}`;
      window.open(url, '_blank');
    }
  }

  /**
   * Send an access link via email to the logged-in manager.
   * Uses a dedicated cloud function for manager access links.
   */
  public sendAccessLink(): void {
    const user = this.accountService.user;
    if (!user?.email) {
      alert('No email address found for your account.');
      return;
    }
    
    this.sendingAccessLink = true;
    const sendInvite = httpsCallable(this.functions, 'sendManagerAccessLink');
    sendInvite({ 
      user: {
        id: user.id,
        name: user.name || 'Manager',
        email: user.email
      },
      team: this.accountService.aTeam 
    }).then(() => {
      this.sendingAccessLink = false;
    }).catch(() => {
      this.sendingAccessLink = false;
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}

@Component({
  standalone: true,
  selector: "team-files-dialog",
  templateUrl: "team-files-dialog.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule
  ]
})
export class TeamFilesDialog {
  files: File[];
  aFile: File = new File();
  loading: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<TeamFilesDialog>,
    public accountService: AccountService,
    private storage: Storage,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    collectionData(collection(this.accountService.db, `team/${this.accountService.aTeam.id}/file`), { idField: "id" })
      .pipe(
        map((actions: any[]) =>
          actions.map((data) => ({
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
          }))
        )
      )
      .subscribe(files => {
        this.files = files as File[];
        if (files.length) this.aFile = files[0];
      });
  }

  upload(): void {
    document.getElementById("upFile").click();
  }

  uploadFile(event) {
    this.loading = true;
    const uFile = event.target.files[0];
    if (!uFile) {
      this.loading = false;
      return;
    }
    const filePath = `${this.accountService.aTeam.id}/files/${new Date()}`;
    const storageRef = ref(this.storage, filePath);
    uploadBytes(storageRef, uFile)
      .then(() => getDownloadURL(storageRef))
      .then((url) => {
        let file = new File();
        file.createdAt = new Date();
        file.uploadedBy = this.accountService.user.id;
        file.fileUrl = url;
        file.name = uFile.name;
        file.type = uFile.type;
        const cleanedFile = Object.fromEntries(
          Object.entries(file).filter(([_, v]) => v !== undefined)
        );
        return addDoc(collection(this.accountService.db, `team/${this.accountService.aTeam.id}/file`), cleanedFile)
          .then(snapshot => {
            this.loading = false;
            file.id = snapshot.id;
            this.aFile = file;
          });
      })
      .catch(() => {
        this.loading = false;
      });
  }

  save() {
    const cleanedFile = Object.fromEntries(
      Object.entries(this.aFile).filter(([_, v]) => v !== undefined)
    );
    updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}/file/${this.aFile.id}`), cleanedFile);
  }

  delete() {
    const index = this.files.indexOf(this.aFile);
    deleteDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}/file/${this.aFile.id}`))
      .then(() => (this.aFile = this.files[index - 1 < 0 ? 0 : index - 1]));
  }

  download() {
    const xhr = new XMLHttpRequest();
    xhr.responseType = "blob";
    xhr.onload = event => {
      const blob = new Blob([xhr.response], { type: this.aFile.type });
      const a: any = document.createElement("a");
      a.style = "display: none";
      document.body.appendChild(a);
      const url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = this.aFile.name;
      a.click();
      window.URL.revokeObjectURL(url);
    };
    xhr.open("GET", this.aFile.fileUrl);
    xhr.send();
  }

  close(): void {
    this.dialogRef.close();
  }
}

export class File {
  id?: string;
  fileUrl: string;
  name: string;
  createdAt: any;
  uploadedBy: string;
  isPublic: boolean = false;
  type?: string;
}
