import { Component, inject, signal, OnInit, OnDestroy, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatMenuModule } from "@angular/material/menu";
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { TextFieldModule } from "@angular/cdk/text-field";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Subject } from "rxjs";
import { debounceTime, takeUntil } from "rxjs/operators";
import { AccountService } from "../../account.service";
import { SelfInspectionsService, Categories, SelfInspectionTemplate, SelfInspection, ExperationTimeFrame, Question, DeleteInspectionDialog } from "../self-inspections.service";

// Map category subjects to unique icons
const CATEGORY_ICONS: { [key: string]: string } = {
  'fire': 'local_fire_department',
  'electrical': 'electrical_services',
  'emergency': 'campaign',
  'personal protective': 'health_and_safety',
  'ppe': 'shield',
  'hazard communication': 'warning_amber',
  'walking': 'directions_walk',
  'working surface': 'grid_on',
  'machine guard': 'precision_manufacturing',
  'lockout': 'lock',
  'tagout': 'label_off',
  'ergonomic': 'accessibility_new',
  'noise': 'volume_up',
  'hearing': 'hearing',
  'respiratory': 'masks',
  'fall protection': 'vertical_align_bottom',
  'confined space': 'sensor_door',
  'chemical': 'science',
  'housekeeping': 'cleaning_services',
  'first aid': 'medical_services',
  'vehicle': 'local_shipping',
  'forklift': 'fork_right',
  'ladder': 'stairs',
  'scaffold': 'view_column',
  'environmental': 'eco',
  'bloodborne': 'bloodtype',
  'hand': 'back_hand',
  'eye': 'visibility',
  'foot': 'do_not_step',
  'head': 'face',
  'welding': 'construction',
  'crane': 'swap_vert',
  'hoist': 'upload',
  'material handling': 'inventory_2',
  'storage': 'warehouse',
  'compressed gas': 'propane_tank',
  'flammable': 'whatshot',
  'toxic': 'coronavirus',
  'radiation': 'radio_button_checked',
  'biological': 'bug_report',
  'temperature': 'thermostat',
  'heat': 'wb_sunny',
  'cold': 'ac_unit',
  'ventilation': 'air',
  'lighting': 'lightbulb',
  'sanitation': 'sanitizer',
  'waste': 'delete',
  'spill': 'water_drop',
  'exit': 'exit_to_app',
  'signage': 'signpost',
  'training': 'school',
  'documentation': 'description',
  'inspection': 'fact_check',
  'maintenance': 'build',
  'tool': 'handyman',
  'power tool': 'hardware',
  'cutting': 'content_cut',
  'grinding': 'blur_circular',
  'pressure': 'speed',
  'hydraulic': 'opacity',
  'pneumatic': 'wind_power'
};

function getCategoryIcon(subject: string): string {
  const lower = subject.toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) {
      return icon;
    }
  }
  // Generate a consistent icon based on the subject string
  const fallbackIcons = ['checklist', 'task_alt', 'playlist_add_check', 'rule', 'assignment', 'pending_actions', 'grading', 'ballot'];
  const hash = lower.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return fallbackIcons[hash % fallbackIcons.length];
}

interface SelfInspectionRecommendation {
  name: string;
  description: string;
  frequency: string;
  reason: string;
  baseQuestions: Categories[];
  questionCount: number;
}

interface AIRecommendationResponse {
  success: boolean;
  recommendations?: SelfInspectionRecommendation[];
  summary?: string;
  error?: string;
}

@Component({
  standalone: true,
  selector: "app-self-inspection-guide",
  templateUrl: "./guide.component.html",
  styleUrl: "./guide.component.css",
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatExpansionModule,
    MatCheckboxModule,
    MatButtonToggleModule,
    MatMenuModule,
    MatDialogModule,
    TextFieldModule
  ]
})
export class GuideComponent implements OnInit, OnDestroy {
  private readonly functions = inject(Functions);
  private readonly destroy$ = new Subject<void>();
  private readonly saveSubject = new Subject<void>();
  
  readonly loading = signal(false);
  readonly recommendations = signal<AIRecommendationResponse | null>(null);
  readonly showResults = signal(false);
  
  // Check industry dynamically
  hasIndustry(): boolean {
    return !!this.accountService.aTeam?.industry;
  }
  
  // Inline editor state
  readonly expandedInspection = signal<SelfInspection | null>(null);
  readonly expandedIndex = signal<number | null>(null);
  readonly saving = signal(false);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  
  // Track which recommendations have already been created (by index)
  readonly createdInspections = signal<Map<number, SelfInspection>>(new Map());
  
  customPrompt = '';
  newCategoryName = '';
  newQuestionTexts: { [categoryIndex: number]: string } = {};
  oshaCategories: Categories[] = [];
  
  // Frequency options
  readonly frequencyOptions = Object.values(ExperationTimeFrame);

  constructor(
    public accountService: AccountService,
    private selfInspectionsService: SelfInspectionsService,
    private router: Router,
    private dialog: MatDialog
  ) {
    // Setup debounced save
    this.saveSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.performSave();
    });
  }

  ngOnInit(): void {
    // Load OSHA categories for the picker
    this.selfInspectionsService.getOshaCategories().subscribe(categories => {
      this.oshaCategories = categories;
    });
    
    // Check if we have a pending template from coverage analysis
    if (this.selfInspectionsService.hasPendingTemplate()) {
      this.handlePendingTemplate();
    }
    // Don't auto-generate - wait for user to click Generate Inspections
  }

  /**
   * Handle a pending template from coverage analysis
   * Creates the inspection immediately and opens it for editing
   */
  private handlePendingTemplate(): void {
    const template = this.selfInspectionsService.consumePendingTemplate();
    if (!template) return;
    
    this.loading.set(true);
    this.showResults.set(true);
    
    // Create a recommendation-like object from the template
    const recommendation: SelfInspectionRecommendation = {
      name: template.title,
      description: template.description || 'Custom inspection from coverage analysis',
      frequency: template.frequency,
      reason: template.reason || 'Recommended to improve your inspection coverage',
      baseQuestions: template.baseQuestions,
      questionCount: template.baseQuestions.reduce((sum, cat) => sum + (cat.questions?.length || 0), 0)
    };
    
    // Create a synthetic recommendations response with just this one
    this.recommendations.set({
      success: true,
      recommendations: [recommendation],
      summary: `Creating "${template.title}" based on your coverage analysis recommendations.`
    });
    
    this.loading.set(false);
    
    // Automatically start creating this inspection
    setTimeout(() => {
      this.useRecommendation(recommendation, 0);
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getRecommendations(): void {
    if (this.loading() || !this.accountService.aTeam?.industry) return;
    
    this.loading.set(true);
    this.showResults.set(true);
    this.recommendations.set(null);

    // Prepare team member info (names and job titles)
    const teamMemberInfo = this.accountService.teamMembers?.map(tm => ({
      name: tm.name || 'Team member',
      jobTitle: tm.jobTitle || 'General worker'
    })) || [];

    const getSuggestions = httpsCallable(this.functions, 'getSelfInspectionRecommendations');
    getSuggestions({
      industry: this.accountService.aTeam.industry,
      teamMembers: teamMemberInfo,
      customPrompt: this.customPrompt.trim() || undefined
    })
      .then((result: any) => {
        this.loading.set(false);
        this.recommendations.set(result.data);
      })
      .catch(error => {
        this.loading.set(false);
        this.recommendations.set({
          success: false,
          error: error.message || 'Failed to get recommendations. Please try again.'
        });
      });
  }

  generateWithPrompt(): void {
    this.getRecommendations();
  }

  useRecommendation(recommendation: SelfInspectionRecommendation, index: number): void {
    // Prevent clicking on another card while one is loading or expanded
    if (this.saving() || this.expandedInspection()) return;
    
    // Check if this recommendation was already created
    const existingInspection = this.createdInspections().get(index);
    if (existingInspection) {
      // Just re-open the existing inspection for editing
      this.expandedInspection.set(existingInspection);
      this.expandedIndex.set(index);
      return;
    }
    
    this.saving.set(true);
    this.saveStatus.set('saving');
    
    // Create the self-inspection immediately in the database
    this.selfInspectionsService.createFromRecommendation(recommendation)
      .then(inspection => {
        this.saving.set(false);
        this.saveStatus.set('saved');
        // Store in the created map so we don't create duplicates
        const updated = new Map(this.createdInspections());
        updated.set(index, inspection);
        this.createdInspections.set(updated);
        // Expand the card to show the inline editor
        this.expandedInspection.set(inspection);
        this.expandedIndex.set(index);
      })
      .catch(error => {
        this.saving.set(false);
        this.saveStatus.set('idle');
        console.error('Failed to create inspection:', error);
      });
  }

  // Trigger debounced save
  triggerSave(): void {
    this.saveStatus.set('saving');
    this.saveSubject.next();
  }

  // Perform the actual save
  private performSave(): void {
    const inspection = this.expandedInspection();
    if (!inspection) return;
    
    this.selfInspectionsService.updateSelfInspection(inspection)
      .then(() => {
        this.saveStatus.set('saved');
        // Reset to idle after showing "saved" briefly
        setTimeout(() => {
          if (this.saveStatus() === 'saved') {
            this.saveStatus.set('idle');
          }
        }, 2000);
      })
      .catch(error => {
        console.error('Failed to save:', error);
        this.saveStatus.set('idle');
      });
  }

  // Immediate save (for toggles)
  saveImmediately(): void {
    this.saveStatus.set('saving');
    this.performSave();
  }

  // Update title
  onTitleChange(value: string): void {
    const inspection = this.expandedInspection();
    if (inspection) {
      inspection.title = value;
      this.triggerSave();
    }
  }

  // Update frequency
  onFrequencyChange(value: string): void {
    const inspection = this.expandedInspection();
    if (inspection) {
      inspection.inspectionExpiration = value;
      this.saveImmediately();
    }
  }

  // Remove a question from a category
  removeQuestion(categoryIndex: number, questionIndex: number): void {
    const inspection = this.expandedInspection();
    if (!inspection) return;
    
    inspection.baseQuestions[categoryIndex].questions.splice(questionIndex, 1);
    
    // Remove category if it has no questions
    if (inspection.baseQuestions[categoryIndex].questions.length === 0) {
      inspection.baseQuestions.splice(categoryIndex, 1);
    }
    
    this.saveImmediately();
  }

  // Add a question to a category
  addQuestion(categoryIndex: number): void {
    const text = this.newQuestionTexts[categoryIndex]?.trim();
    if (!text) return;
    
    const inspection = this.expandedInspection();
    if (!inspection) return;
    
    const newQuestion: Question = { name: text };
    inspection.baseQuestions[categoryIndex].questions.push(newQuestion);
    this.newQuestionTexts[categoryIndex] = '';
    this.saveImmediately();
  }

  // Toggle expected answer for a question
  toggleExpectedAnswer(categoryIndex: number, questionIndex: number): void {
    const inspection = this.expandedInspection();
    if (!inspection) return;
    
    const question = inspection.baseQuestions[categoryIndex].questions[questionIndex];
    question.expectedAnswer = question.expectedAnswer === false ? true : false;
    this.saveImmediately();
  }

  // Update category name
  onCategoryNameChange(categoryIndex: number, value: string): void {
    const inspection = this.expandedInspection();
    if (!inspection) return;
    
    inspection.baseQuestions[categoryIndex].subject = value;
    this.triggerSave();
  }

  // Update question text
  onQuestionChange(categoryIndex: number, questionIndex: number, value: string): void {
    const inspection = this.expandedInspection();
    if (!inspection) return;
    
    inspection.baseQuestions[categoryIndex].questions[questionIndex].name = value;
    this.triggerSave();
  }

  // Add a new category
  addCategory(): void {
    const name = this.newCategoryName?.trim();
    if (!name) return;
    
    const inspection = this.expandedInspection();
    if (!inspection) return;
    
    const newCategory: Categories = {
      subject: name,
      questions: []
    };
    inspection.baseQuestions.push(newCategory);
    this.newCategoryName = '';
    this.saveImmediately();
  }

  // Open OSHA category picker dialog
  openOshaCategoryPicker(): void {
    const availableCategories = this.getAvailableOshaCategories()
      .slice()
      .sort((a, b) => a.subject.localeCompare(b.subject));
    if (availableCategories.length === 0) return;
    
    const dialogRef = this.dialog.open(OshaCategoryPickerDialog, {
      width: '340px',
      maxWidth: '90vw',
      maxHeight: '70vh',
      data: { categories: availableCategories }
    });

    dialogRef.afterClosed().subscribe((selectedCategory: Categories | undefined) => {
      if (selectedCategory) {
        this.newCategoryName = selectedCategory.subject;
      }
    });
  }

  // Get available OSHA categories (not already in inspection)
  getAvailableOshaCategories(): Categories[] {
    const inspection = this.expandedInspection();
    if (!inspection) return this.oshaCategories;
    
    const existingSubjects = inspection.baseQuestions.map(c => c.subject.toLowerCase());
    return this.oshaCategories.filter(c => 
      !existingSubjects.includes(c.subject.toLowerCase())
    );
  }

  // Remove a category
  removeCategory(categoryIndex: number): void {
    const inspection = this.expandedInspection();
    if (!inspection) return;
    
    inspection.baseQuestions.splice(categoryIndex, 1);
    this.saveImmediately();
  }

  // Collapse the editor (stay on page)
  collapseEditor(): void {
    this.expandedInspection.set(null);
    this.expandedIndex.set(null);
    this.newCategoryName = '';
    this.newQuestionTexts = {};
    this.saveStatus.set('idle');
  }

  // Delete the currently expanded inspection
  deleteExpandedInspection(): void {
    const inspection = this.expandedInspection();
    const index = this.expandedIndex();
    if (!inspection || index === null) return;
    
    // Show confirmation dialog
    const dialogRef = this.dialog.open(DeleteInspectionDialog);
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        // Pass empty array since newly created inspections won't have any completed inspections yet
        this.selfInspectionsService.deleteSelfInspection(inspection, [])
          .then(() => {
            // Remove from created inspections map
            const updated = new Map(this.createdInspections());
            updated.delete(index);
            this.createdInspections.set(updated);
            
            // Collapse the editor
            this.collapseEditor();
            
            // If this was a single recommendation from pending template, go back
            const recs = this.recommendations();
            if (recs?.recommendations?.length === 1) {
              this.router.navigate(['/account/self-inspections']);
            }
          })
          .catch(error => {
            console.error('Failed to delete inspection:', error);
          });
      }
    });
  }

  // Collapse and navigate to the self-inspections list
  doneEditing(): void {
    this.collapseEditor();
    this.router.navigate(['/account/self-inspections']);
  }

  goBack(): void {
    if (this.expandedInspection()) {
      // If editing, just collapse and stay on page
      this.collapseEditor();
    } else {
      this.router.navigate(['/account/self-inspections']);
    }
  }

  goToTemplates(): void {
    this.router.navigate(['/account/self-inspections/new']);
  }

  goToSettings(): void {
    this.router.navigate(['/account/account']);
  }
}

// OSHA Category Picker Dialog
@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <mat-dialog-content class="compact-dialog">
      <div class="category-grid">
        <button 
          class="category-item" 
          *ngFor="let cat of data.categories"
          (click)="select(cat)">
          <mat-icon>{{ getIcon(cat.subject) }}</mat-icon>
          <span class="category-label">{{ cat.subject }}</span>
        </button>
      </div>
    </mat-dialog-content>
  `,
  styles: [`
    :host {
      display: block;
    }
    .compact-dialog {
      padding: 12px !important;
      margin: 0 !important;
      overflow-x: hidden;
    }
    .category-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      width: 100%;
      box-sizing: border-box;
    }
    .category-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 3px;
      padding: 8px 2px 6px;
      border: 1px solid var(--chimp-border-light, #e0e0e0);
      border-radius: 8px;
      background: var(--chimp-bg-primary, #fff);
      cursor: pointer;
      transition: all 150ms ease;
      min-width: 0;
    }
    .category-item:hover {
      border-color: var(--chimp-primary);
      background: rgba(5, 77, 138, 0.05);
    }
    .category-item mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--chimp-primary);
      flex-shrink: 0;
    }
    .category-label {
      font-size: 8px;
      font-weight: 500;
      color: var(--chimp-text-secondary);
      text-align: center;
      line-height: 1.15;
      text-transform: capitalize;
      width: 100%;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-break: break-word;
    }
    @media (max-width: 360px) {
      .category-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `]
})
export class OshaCategoryPickerDialog {
  constructor(
    public dialogRef: MatDialogRef<OshaCategoryPickerDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { categories: Categories[] }
  ) {}

  getIcon(subject: string): string {
    return getCategoryIcon(subject);
  }

  select(category: Categories): void {
    this.dialogRef.close(category);
  }
}
