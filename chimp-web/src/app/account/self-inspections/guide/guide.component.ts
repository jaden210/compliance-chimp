import { Component, inject, signal, OnInit, OnDestroy, NgZone, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { TextFieldModule } from "@angular/cdk/text-field";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Subject } from "rxjs";
import { take, takeUntil } from "rxjs/operators";
import { AccountService } from "../../account.service";
import { SelfInspectionsService, Categories, SelfInspection, ExperationTimeFrame, Question } from "../self-inspections.service";

// Confirmation dialog for leaving without saving
@Component({
  standalone: true,
  selector: 'confirm-leave-inspection-dialog',
  template: `
    <h2 mat-dialog-title>Leave without saving?</h2>
    <mat-dialog-content>
      <p>You haven't saved this inspection to your library yet. If you leave now, your work will be lost.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-flat-button color="warn" (click)="onConfirm()">Leave</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 300px;
    }
    p {
      color: var(--chimp-text-secondary);
      line-height: 1.5;
    }
  `],
  imports: [MatDialogModule, MatButtonModule]
})
export class ConfirmLeaveInspectionDialog {
  private readonly dialogRef = inject(MatDialogRef<ConfirmLeaveInspectionDialog>);

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
  onstart: () => void;
  start(): void;
  stop(): void;
  abort(): void;
}

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
    MatMenuModule,
    MatSnackBarModule,
    MatDialogModule,
    TextFieldModule
  ]
})
export class GuideComponent implements OnInit, OnDestroy {
  private readonly functions = inject(Functions);
  private readonly destroy$ = new Subject<void>();
  private recognition: SpeechRecognition | null = null;
  private interimTranscript: string = '';

  // Mode: 'generate' for AI-assisted, 'scratch' for manual creation, 'edit' for editing existing
  mode: 'generate' | 'scratch' | 'edit' = 'generate';

  // Editing state
  editingInspection: SelfInspection | null = null;
  editingInspectionId: string | null = null;

  // Form state
  description: string = '';
  title: string = '';
  selectedFrequency: string = ExperationTimeFrame.Quarterly;
  baseQuestions: Categories[] = [];

  // UI state
  isRecording: boolean = false;
  isGenerating: boolean = false;
  isSaving: boolean = false;
  recordingSupported: boolean = false;
  error: string = '';

  // Prefilled recommendation reason
  prefilledReason: string = '';

  // Frequency options
  readonly frequencyOptions = [
    { value: ExperationTimeFrame.Manual, label: 'Manual' },
    { value: ExperationTimeFrame.Montly, label: 'Monthly' },
    { value: ExperationTimeFrame.Quarterly, label: 'Quarterly' },
    { value: ExperationTimeFrame.SemiAnually, label: 'Semi-Annually' },
    { value: ExperationTimeFrame.Anually, label: 'Annually' }
  ];

  // Category editing helpers
  newCategoryName = '';
  newQuestionTexts: { [categoryIndex: number]: string } = {};
  oshaCategories: Categories[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    public accountService: AccountService,
    private selfInspectionsService: SelfInspectionsService,
    private snackbar: MatSnackBar,
    private ngZone: NgZone,
    private dialog: MatDialog
  ) {
    this.initSpeechRecognition();
  }

  ngOnInit(): void {
    // Load OSHA categories for the picker
    this.selfInspectionsService.getOshaCategories().subscribe(categories => {
      this.oshaCategories = categories;
    });

    // Check for mode from route data (set in routes config)
    const routeData = this.route.snapshot.data;
    if (routeData['mode'] === 'scratch') {
      this.mode = 'scratch';
    } else if (routeData['mode'] === 'edit') {
      // Get the inspection ID from route params
      const inspectionId = this.route.snapshot.params['selfInspectionId'];
      if (inspectionId) {
        this.mode = 'edit';
        this.editingInspectionId = inspectionId;
        this.loadInspectionForEditing(inspectionId);
      }
    }

    // Also check query parameters (for direct navigation)
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      if (params['mode'] === 'scratch' && this.mode !== 'edit') {
        this.mode = 'scratch';
      } else if (params['edit']) {
        this.mode = 'edit';
        this.editingInspectionId = params['edit'];
        this.loadInspectionForEditing(params['edit']);
      }
    });

    // Check for pending recommendation from coverage analysis
    const pendingRec = sessionStorage.getItem('pendingInspectionRecommendation');
    if (pendingRec) {
      try {
        const recommendation = JSON.parse(pendingRec);
        sessionStorage.removeItem('pendingInspectionRecommendation');

        if (recommendation) {
          this.title = recommendation.name || recommendation.title || '';
          this.description = recommendation.description || '';
          this.prefilledReason = recommendation.reason || '';

          // Map frequency
          if (recommendation.frequency) {
            this.selectedFrequency = recommendation.frequency;
          }

          // If it comes with baseQuestions already, pre-fill them
          if (recommendation.baseQuestions && recommendation.baseQuestions.length > 0) {
            this.baseQuestions = recommendation.baseQuestions.map((cat: any) => ({
              subject: cat.subject,
              questions: (cat.questions || []).map((q: any) => ({
                name: typeof q === 'string' ? q : q.name
              }))
            }));
          }
        }
      } catch (e) {
        console.error('Failed to parse pending recommendation:', e);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
    }
  }

  // Check if we should show the editor
  get showEditor(): boolean {
    return this.mode === 'scratch' || this.mode === 'edit' || this.baseQuestions.length > 0;
  }

  // Check industry dynamically
  hasIndustry(): boolean {
    return !!this.accountService.aTeam?.industry;
  }

  // Load an existing inspection for editing
  private loadInspectionForEditing(inspectionId: string): void {
    this.selfInspectionsService.getSelfInspection(inspectionId).pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(inspection => {
      if (inspection) {
        this.editingInspection = inspection;
        this.title = inspection.title || '';
        this.selectedFrequency = inspection.inspectionExpiration || ExperationTimeFrame.Quarterly;
        this.baseQuestions = (inspection.baseQuestions || []).map(cat => ({
          subject: cat.subject,
          questions: (cat.questions || []).map(q => ({ name: q.name, expectedAnswer: q.expectedAnswer }))
        }));
      }
    });
  }

  // Speech recognition
  private initSpeechRecognition(): void {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      this.recordingSupported = true;
      this.recognition = new SpeechRecognitionAPI();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.ngZone.run(() => {
          this.isRecording = true;
          this.error = '';
        });
      };

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        this.ngZone.run(() => {
          let finalTranscript = '';
          this.interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript;
            } else {
              this.interimTranscript += result[0].transcript;
            }
          }

          if (finalTranscript) {
            this.description += (this.description ? ' ' : '') + finalTranscript.trim();
          }
        });
      };

      this.recognition.onerror = (event: any) => {
        this.ngZone.run(() => {
          this.isRecording = false;
          if (event.error === 'no-speech') {
            this.error = 'No speech detected. Please try again.';
          } else if (event.error === 'not-allowed') {
            this.error = 'Microphone access denied. Please allow microphone access in your browser settings.';
          } else {
            this.error = `Error: ${event.error}`;
          }
        });
      };

      this.recognition.onend = () => {
        this.ngZone.run(() => {
          this.isRecording = false;
        });
      };
    }
  }

  toggleRecording(): void {
    if (!this.recognition) return;

    if (this.isRecording) {
      this.recognition.stop();
    } else {
      this.error = '';
      this.recognition.start();
    }
  }

  // Generate inspection from description
  async generateInspection(): Promise<void> {
    if (!this.description.trim()) {
      this.error = 'Please describe the inspection you want to create.';
      return;
    }

    this.isGenerating = true;
    this.error = '';

    try {
      const teamMemberInfo = this.accountService.teamMembers?.map(tm => ({
        name: tm.name || 'Team member',
        jobTitle: tm.jobTitle || 'General worker'
      })) || [];

      const generateFn = httpsCallable(this.functions, 'generateInspectionFromDescription');
      const result: any = await generateFn({
        description: this.description.trim(),
        industry: this.accountService.aTeam?.industry || null,
        teamMembers: teamMemberInfo
      });

      if (result.data?.success) {
        // Use generated title if user hasn't set one
        if (!this.title.trim()) {
          this.title = result.data.title || '';
        }

        // Use AI-suggested frequency
        if (result.data.frequency) {
          this.selectedFrequency = result.data.frequency;
        }

        // Set generated categories/questions
        this.baseQuestions = (result.data.baseQuestions || []).map((cat: any) => ({
          subject: cat.subject,
          questions: (cat.questions || []).map((q: any) => ({
            name: typeof q === 'string' ? q : q.name
          }))
        }));

        this.snackbar.open('Inspection generated! Review and save below.', 'Got it', { duration: 3000 });
      } else {
        this.error = 'Failed to generate inspection. Please try again.';
      }
    } catch (err: any) {
      console.error('Error generating inspection:', err);
      this.error = err.message || 'An error occurred while generating the inspection.';
    } finally {
      this.isGenerating = false;
    }
  }

  // Save the inspection to the library
  async saveInspection(): Promise<void> {
    if (!this.title.trim()) {
      this.error = 'Please enter a title for the inspection.';
      return;
    }

    if (this.baseQuestions.length === 0) {
      this.error = 'Please add at least one category with questions.';
      return;
    }

    this.isSaving = true;
    this.error = '';

    try {
      if (this.mode === 'edit' && this.editingInspection?.id) {
        // Update existing inspection
        const updated: SelfInspection = {
          ...this.editingInspection,
          title: this.title.trim(),
          inspectionExpiration: this.selectedFrequency,
          baseQuestions: this.baseQuestions.map(cat => ({
            subject: cat.subject,
            questions: cat.questions.map(q => {
              const question: Question = { name: q.name };
              if (q.expectedAnswer === false) {
                question.expectedAnswer = false;
              }
              return question;
            })
          }))
        };

        await this.selfInspectionsService.updateSelfInspection(updated);

        this.snackbar.open('Inspection updated!', 'View', { duration: 5000 }).onAction().subscribe(() => {
          this.router.navigate(['/account/self-inspections', this.editingInspection!.id]);
        });

        this.router.navigate(['/account/self-inspections', this.editingInspection.id], { replaceUrl: true });
      } else {
        // Create new inspection
        const newInspection: Partial<SelfInspection> = {
          title: this.title.trim(),
          inspectionExpiration: this.selectedFrequency,
          baseQuestions: this.baseQuestions.map(cat => ({
            subject: cat.subject,
            questions: cat.questions.map(q => {
              const question: Question = { name: q.name };
              if (q.expectedAnswer === false) {
                question.expectedAnswer = false;
              }
              return question;
            })
          })),
          teamId: this.accountService.aTeam.id,
          createdAt: new Date()
        };

        await this.selfInspectionsService.createSelfInspection(newInspection);

        this.snackbar.open('Inspection added to your library!', 'OK', { duration: 5000 });

        // Navigate back to self-inspections list
        this.router.navigate(['/account/self-inspections']);
      }
    } catch (err: any) {
      console.error('Error saving inspection:', err);
      this.error = err.message || 'Failed to save inspection.';
    } finally {
      this.isSaving = false;
    }
  }

  // Category & question editing methods
  onTitleChange(value: string): void {
    this.title = value;
  }

  onFrequencyChange(value: string): void {
    this.selectedFrequency = value;
  }

  onCategoryNameChange(categoryIndex: number, value: string): void {
    this.baseQuestions[categoryIndex].subject = value;
  }

  onQuestionChange(categoryIndex: number, questionIndex: number, value: string): void {
    this.baseQuestions[categoryIndex].questions[questionIndex].name = value;
  }

  removeQuestion(categoryIndex: number, questionIndex: number): void {
    this.baseQuestions[categoryIndex].questions.splice(questionIndex, 1);

    // Remove category if it has no questions
    if (this.baseQuestions[categoryIndex].questions.length === 0) {
      this.baseQuestions.splice(categoryIndex, 1);
    }
  }

  addQuestion(categoryIndex: number): void {
    const text = this.newQuestionTexts[categoryIndex]?.trim();
    if (!text) return;

    const newQuestion: Question = { name: text };
    this.baseQuestions[categoryIndex].questions.push(newQuestion);
    this.newQuestionTexts[categoryIndex] = '';
  }

  toggleExpectedAnswer(categoryIndex: number, questionIndex: number): void {
    const question = this.baseQuestions[categoryIndex].questions[questionIndex];
    question.expectedAnswer = question.expectedAnswer === false ? true : false;
  }

  addCategory(): void {
    const name = this.newCategoryName?.trim();
    if (!name) return;

    const newCategory: Categories = {
      subject: name,
      questions: []
    };
    this.baseQuestions.push(newCategory);
    this.newCategoryName = '';
  }

  removeCategory(categoryIndex: number): void {
    this.baseQuestions.splice(categoryIndex, 1);
  }

  // OSHA category picker
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

  getAvailableOshaCategories(): Categories[] {
    const existingSubjects = this.baseQuestions.map(c => c.subject.toLowerCase());
    return this.oshaCategories.filter(c =>
      !existingSubjects.includes(c.subject.toLowerCase())
    );
  }

  getCategoryIcon(subject: string): string {
    return getCategoryIcon(subject);
  }

  // Navigation
  goBack(): void {
    // Check if user has unsaved content (not in edit mode)
    const hasUnsavedContent = this.mode !== 'edit' && (
      this.baseQuestions.length > 0 ||
      this.title?.trim() ||
      this.description?.trim()
    );

    if (hasUnsavedContent) {
      const dialogRef = this.dialog.open(ConfirmLeaveInspectionDialog);
      dialogRef.afterClosed().subscribe(confirmed => {
        if (confirmed) {
          window.history.back();
        }
      });
    } else {
      window.history.back();
    }
  }

  clearGenerated(): void {
    this.baseQuestions = [];
    this.title = '';
    this.selectedFrequency = ExperationTimeFrame.Quarterly;
    this.newCategoryName = '';
    this.newQuestionTexts = {};
  }

  switchToScratch(): void {
    this.mode = 'scratch';
  }

  goToSettings(): void {
    this.router.navigate(['/account/account']);
  }

  // Get the total question count
  get totalQuestionCount(): number {
    return this.baseQuestions.reduce((sum, cat) => sum + (cat.questions?.length || 0), 0);
  }
}

// OSHA Category Picker Dialog
@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <mat-dialog-content class="compact-dialog">
      <div class="category-grid">
        @for (cat of data.categories; track $index) {
          <button 
            class="category-item" 
            (click)="select(cat)">
            <mat-icon>{{ getIcon(cat.subject) }}</mat-icon>
            <span class="category-label">{{ cat.subject }}</span>
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
