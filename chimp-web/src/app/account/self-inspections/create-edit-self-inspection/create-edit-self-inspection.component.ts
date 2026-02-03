import { Component, OnInit, OnDestroy, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router, ActivatedRoute, ParamMap } from "@angular/router";
import { SelfInspectionsService, ExperationTimeFrame, SelfInspection, SelfInspectionTemplate, Categories, Question } from "../self-inspections.service";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatListModule } from "@angular/material/list";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatIconModule } from "@angular/material/icon";
import { TextFieldModule } from "@angular/cdk/text-field";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Location } from "@angular/common";
import { Subject, Subscription } from "rxjs";
import { debounceTime, takeUntil } from "rxjs/operators";
import { AccountService } from "../../account.service";

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
  const fallbackIcons = ['checklist', 'task_alt', 'playlist_add_check', 'rule', 'assignment', 'pending_actions', 'grading', 'ballot'];
  const hash = lower.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return fallbackIcons[hash % fallbackIcons.length];
}

@Component({
  standalone: true,
  selector: "app-create-edit-self-inspection",
  templateUrl: "./create-edit-self-inspection.component.html",
  styleUrls: ["./create-edit-self-inspection.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatMenuModule,
    MatExpansionModule,
    MatListModule,
    MatCheckboxModule,
    MatIconModule,
    TextFieldModule,
    MatButtonToggleModule,
    MatTooltipModule,
    MatDialogModule,
    MatProgressSpinnerModule
  ]
})
export class CreateEditSelfInspectionComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly saveSubject = new Subject<void>();
  private subscription: Subscription;

  selfInspection: SelfInspection = new SelfInspection();
  appliedTemplate: SelfInspectionTemplate | null = null;
  
  // Track if we're editing an existing inspection
  isEditing = false;
  isCreating = false;
  
  // Auto-save status
  saveStatus: 'idle' | 'saving' | 'saved' = 'idle';
  
  // New question/category inputs
  newQuestionTexts: { [categoryIndex: number]: string } = {};
  newCategoryName = '';
  oshaCategories: Categories[] = [];
  
  // Frequency options
  readonly frequencyOptions = Object.values(ExperationTimeFrame);

  constructor(
    public router: Router,
    public route: ActivatedRoute,
    private accountService: AccountService,
    public selfInspectionService: SelfInspectionsService,
    public snackbar: MatSnackBar,
    private location: Location,
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
    this.selfInspectionService.getOshaCategories().subscribe(categories => {
      this.oshaCategories = categories;
    });

    this.subscription = this.accountService.aTeamObservable.subscribe(team => {
      if (team) {
        this.route.paramMap.subscribe((params: ParamMap) => {
          const selfInspectionId = params.get("selfInspectionId");
          if (selfInspectionId) { 
            // EDIT MODE: Load the existing inspection
            this.isEditing = true;
            this.isCreating = false;
            this.selfInspectionService.getSelfInspection(selfInspectionId).subscribe(selfInspection => {
              this.selfInspection = selfInspection;
            });
          } else { 
            // CREATE MODE: Check for pending template from AI, or start with blank local object
            this.isEditing = false;
            this.isCreating = false;
            const pendingTemplate = this.selfInspectionService.consumePendingTemplate();
            if (pendingTemplate) {
              this.createFromTemplate(pendingTemplate);
            } else {
              this.initBlankInspection();
            }
          }
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscription?.unsubscribe();
  }

  /**
   * Initialize a blank self-inspection locally (not saved to database yet)
   */
  private initBlankInspection(): void {
    this.selfInspection = new SelfInspection();
    this.selfInspection.title = '';
    this.selfInspection.inspectionExpiration = ExperationTimeFrame.Manual;
    this.selfInspection.baseQuestions = [];
  }

  /**
   * Create the inspection in the database (called when user clicks Create button)
   */
  createInspection(): void {
    if (!this.selfInspection.title?.trim()) {
      this.snackbar.open('Please enter an inspection name', 'Dismiss', { duration: 3000 });
      return;
    }

    if (!this.selfInspection.baseQuestions?.length) {
      this.snackbar.open('Please add at least one category', 'Dismiss', { duration: 3000 });
      return;
    }

    this.isCreating = true;
    
    this.selfInspectionService.createFromRecommendation({
      name: this.selfInspection.title,
      frequency: this.selfInspection.inspectionExpiration || ExperationTimeFrame.Manual,
      baseQuestions: this.selfInspection.baseQuestions
    }).then(inspection => {
      this.isCreating = false;
      this.snackbar.open('Self-inspection created!', 'Got it', { duration: 3000 });
      // Navigate to the new inspection
      this.router.navigate(['/account/self-inspections', inspection.id]);
    }).catch(error => {
      this.isCreating = false;
      console.error('Failed to create inspection:', error);
      this.snackbar.open('Failed to create inspection', 'Dismiss', { duration: 3000 });
    });
  }

  /**
   * Create a self-inspection from an AI template
   */
  private createFromTemplate(template: SelfInspectionTemplate): void {
    this.appliedTemplate = template;
    
    this.selfInspectionService.createFromRecommendation({
      name: template.title,
      frequency: template.frequency,
      baseQuestions: template.baseQuestions
    }).then(inspection => {
      this.selfInspection = inspection;
      this.isCreating = false;
      
      const questionCount = template.baseQuestions.reduce(
        (sum, cat) => sum + cat.questions.length, 0
      );
      this.snackbar.open(
        `Template applied: ${questionCount} questions added`,
        'Got it',
        { duration: 4000 }
      );
    }).catch(error => {
      console.error('Failed to create inspection from template:', error);
      this.snackbar.open('Failed to create inspection', 'Dismiss', { duration: 3000 });
    });
  }

  // Trigger debounced save (only in edit mode)
  triggerSave(): void {
    // In create mode, don't save to database - just update local object
    if (!this.selfInspection?.id) return;
    this.saveStatus = 'saving';
    this.saveSubject.next();
  }

  // Perform the actual save
  private performSave(): void {
    if (!this.selfInspection?.id) return;
    
    this.selfInspectionService.updateSelfInspection(this.selfInspection)
      .then(() => {
        this.saveStatus = 'saved';
        setTimeout(() => {
          if (this.saveStatus === 'saved') {
            this.saveStatus = 'idle';
          }
        }, 2000);
      })
      .catch(error => {
        console.error('Failed to save:', error);
        this.saveStatus = 'idle';
        this.snackbar.open('Failed to save changes', 'Dismiss', { duration: 3000 });
      });
  }

  // Immediate save (for toggles and deletions) - only in edit mode
  saveImmediately(): void {
    // In create mode, don't save to database - just update local object
    if (!this.selfInspection?.id) return;
    this.saveStatus = 'saving';
    this.performSave();
  }

  // Update title
  onTitleChange(value: string): void {
    this.selfInspection.title = value;
    this.triggerSave();
  }

  // Update frequency
  onFrequencyChange(value: string): void {
    this.selfInspection.inspectionExpiration = value;
    this.saveImmediately();
  }

  // Update category name
  onCategoryNameChange(categoryIndex: number, value: string): void {
    this.selfInspection.baseQuestions[categoryIndex].subject = value;
    this.triggerSave();
  }

  // Update question text
  onQuestionChange(categoryIndex: number, questionIndex: number, value: string): void {
    this.selfInspection.baseQuestions[categoryIndex].questions[questionIndex].name = value;
    this.triggerSave();
  }

  // Toggle expected answer for a question
  toggleExpectedAnswer(categoryIndex: number, questionIndex: number): void {
    const question = this.selfInspection.baseQuestions[categoryIndex].questions[questionIndex];
    question.expectedAnswer = question.expectedAnswer === false ? true : false;
    this.saveImmediately();
  }

  // Remove a question from a category
  removeQuestion(categoryIndex: number, questionIndex: number): void {
    this.selfInspection.baseQuestions[categoryIndex].questions.splice(questionIndex, 1);
    
    // Remove category if it has no questions
    if (this.selfInspection.baseQuestions[categoryIndex].questions.length === 0) {
      this.selfInspection.baseQuestions.splice(categoryIndex, 1);
    }
    
    this.saveImmediately();
  }

  // Add a question to a category
  addQuestion(categoryIndex: number): void {
    const text = this.newQuestionTexts[categoryIndex]?.trim();
    if (!text) return;
    
    const newQuestion: Question = { name: text };
    this.selfInspection.baseQuestions[categoryIndex].questions.push(newQuestion);
    this.newQuestionTexts[categoryIndex] = '';
    this.saveImmediately();
  }

  // Add a new category
  addCategory(): void {
    const name = this.newCategoryName?.trim();
    if (!name) return;
    
    const newCategory: Categories = {
      subject: name,
      questions: []
    };
    this.selfInspection.baseQuestions.push(newCategory);
    this.newCategoryName = '';
    this.saveImmediately();
  }

  // Remove a category
  removeCategory(categoryIndex: number): void {
    this.selfInspection.baseQuestions.splice(categoryIndex, 1);
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
        // Add the category with all its questions
        const newCategory: Categories = {
          subject: selectedCategory.subject,
          questions: selectedCategory.questions.map(q => ({ name: q.name }))
        };
        this.selfInspection.baseQuestions.push(newCategory);
        this.saveImmediately();
        
        this.snackbar.open(
          `Added "${selectedCategory.subject}" with ${selectedCategory.questions.length} questions`,
          'Got it',
          { duration: 3000 }
        );
      }
    });
  }

  // Get available OSHA categories (not already in inspection)
  getAvailableOshaCategories(): Categories[] {
    if (!this.selfInspection?.baseQuestions) return this.oshaCategories;
    
    const existingSubjects = this.selfInspection.baseQuestions.map(c => c.subject.toLowerCase());
    return this.oshaCategories.filter(c => 
      !existingSubjects.includes(c.subject.toLowerCase())
    );
  }

  goBack(): void {
    this.subscription?.unsubscribe();
    if (this.isEditing && this.selfInspection?.id) {
      // Navigate back to the specific inspection page
      this.router.navigate(['/account/self-inspections', this.selfInspection.id]);
    } else {
      this.router.navigate(['/account/self-inspections']);
    }
  }
}

// OSHA Category Picker Dialog
@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <mat-dialog-content class="compact-dialog">
      <div class="category-grid">
        @for (cat of data.categories; track cat.subject) {
          <button 
            class="category-item" 
            (click)="select(cat)">
            <mat-icon>{{ getIcon(cat.subject) }}</mat-icon>
            <span class="category-label">{{ cat.subject }}</span>
            <span class="question-count">{{ cat.questions?.length || 0 }}</span>
          </button>
        }
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
    .question-count {
      font-size: 9px;
      font-weight: 600;
      color: var(--chimp-primary);
      background: rgba(5, 77, 138, 0.1);
      padding: 1px 6px;
      border-radius: 8px;
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
