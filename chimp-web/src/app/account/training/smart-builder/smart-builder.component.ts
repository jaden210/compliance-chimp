import { Component, OnInit, OnDestroy, NgZone } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { MatIconModule } from "@angular/material/icon";
import { TextFieldModule } from "@angular/cdk/text-field";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatChipsModule } from "@angular/material/chips";
import { NgxEditorModule, Editor, Toolbar } from "ngx-editor";
import { Subscription } from "rxjs";
import { take } from "rxjs/operators";
import { AccountService } from "../../account.service";
import { TrainingService, TrainingCadence, LibraryItem, TrainingRecommendation } from "../training.service";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { TagInputComponent } from "../../team/tag-input/tag-input.component";

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

@Component({
  standalone: true,
  selector: "app-smart-builder",
  templateUrl: "./smart-builder.component.html",
  styleUrls: ["./smart-builder.component.css"],
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
    MatIconModule,
    TextFieldModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatChipsModule,
    NgxEditorModule,
    TagInputComponent
  ]
})
export class SmartBuilderComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  private recognition: SpeechRecognition | null = null;
  private interimTranscript: string = '';
  private libraryItems: LibraryItem[] = [];

  // Mode: 'generate' for AI-assisted, 'scratch' for manual creation, 'edit' for editing existing
  mode: 'generate' | 'scratch' | 'edit' = 'generate';
  
  // Editing state
  editingArticle: LibraryItem | null = null;
  editingArticleId: string | null = null;
  
  // Form state
  description: string = '';
  title: string = '';
  selectedCadence: TrainingCadence = TrainingCadence.Annually;
  assignedTags: string[] = [];
  
  // UI state
  isRecording: boolean = false;
  isGenerating: boolean = false;
  isCreating: boolean = false;
  recordingSupported: boolean = false;
  error: string = '';
  
  // Generated/edited content
  generatedContent: string = '';
  generatedTitle: string = '';
  generatedTopic: string = '';
  
  // Rich text editor
  editor: Editor;
  toolbar: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code'],
    ['ordered_list', 'bullet_list'],
    [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
    ['link'],
    ['align_left', 'align_center', 'align_right'],
    ['undo', 'redo']
  ];
  
  // Pre-filled recommendation (from coverage analysis)
  prefilledRecommendation: TrainingRecommendation | null = null;

  // Cadence options
  cadenceOptions = [
    { value: TrainingCadence.Once, label: 'Once (one-time training)' },
    { value: TrainingCadence.Monthly, label: 'Monthly' },
    { value: TrainingCadence.Quarterly, label: 'Quarterly' },
    { value: TrainingCadence.SemiAnnually, label: 'Semi-Annually' },
    { value: TrainingCadence.Annually, label: 'Annually' }
  ];

  // Get all unique tags from team members for autocomplete
  get allTags(): string[] {
    return this.trainingService.getAllTags(this.accountService.teamMembers || []);
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    public accountService: AccountService,
    private trainingService: TrainingService,
    private snackbar: MatSnackBar,
    private functions: Functions,
    private ngZone: NgZone
  ) {
    this.initSpeechRecognition();
  }

  ngOnInit(): void {
    this.accountService.helper = this.accountService.helperProfiles.training;
    
    // Initialize the rich text editor
    this.editor = new Editor();
    
    // Check for mode and edit query parameters
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      if (params['mode'] === 'scratch') {
        this.mode = 'scratch';
        // In scratch mode, go directly to editing (skip description step)
        this.generatedContent = '';
      } else if (params['edit']) {
        this.mode = 'edit';
        this.editingArticleId = params['edit'];
      }
    });
    
    // Check for pending recommendation from coverage analysis
    const pendingRec = sessionStorage.getItem('pendingTrainingRecommendation');
    if (pendingRec) {
      try {
        this.prefilledRecommendation = JSON.parse(pendingRec);
        sessionStorage.removeItem('pendingTrainingRecommendation');
        
        if (this.prefilledRecommendation) {
          this.title = this.prefilledRecommendation.name || '';
          this.description = this.prefilledRecommendation.description || '';
          this.assignedTags = this.prefilledRecommendation.assignedTags || [];
          
          // Map cadence string to enum
          const cadenceMap: { [key: string]: TrainingCadence } = {
            'Once': TrainingCadence.Once,
            'Monthly': TrainingCadence.Monthly,
            'Quarterly': TrainingCadence.Quarterly,
            'Semi-Annually': TrainingCadence.SemiAnnually,
            'Annually': TrainingCadence.Annually
          };
          this.selectedCadence = cadenceMap[this.prefilledRecommendation.cadence] || TrainingCadence.Annually;
        }
      } catch (e) {
        console.error('Failed to parse pending recommendation:', e);
      }
    }
    
    // Load existing library items for scheduling
    this.subscription = this.accountService.aTeamObservable.subscribe(team => {
      if (team) {
        // Load library items
        this.trainingService.getLibrary(team.id).subscribe(items => {
          this.libraryItems = items;
          
          // If editing, find and load the article
          if (this.editingArticleId) {
            const article = items.find(item => item.id === this.editingArticleId);
            if (article) {
              this.loadArticleForEditing(article);
            }
          }
        });
      }
    });
  }

  // Load an existing article for editing
  private loadArticleForEditing(article: LibraryItem): void {
    this.editingArticle = article;
    this.title = article.name || '';
    this.generatedContent = article.content || '';
    this.generatedTopic = article.topic || '';
    this.selectedCadence = article.trainingCadence || TrainingCadence.Annually;
    this.assignedTags = article.assignedTags || [];
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
    }
    if (this.editor) {
      this.editor.destroy();
    }
  }

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

  async generateArticle(): Promise<void> {
    if (!this.description.trim()) {
      this.error = 'Please describe the training article you want to create.';
      return;
    }

    this.isGenerating = true;
    this.error = '';

    try {
      const generateArticle = httpsCallable(this.functions, 'generateArticleFromDescription');
      const result: any = await generateArticle({
        description: this.description.trim(),
        industry: this.accountService.aTeam?.industry || null,
        teamTags: this.allTags // Pass team tags for AI to assign
      });

      if (result.data?.success) {
        this.generatedTitle = result.data.title;
        this.generatedContent = result.data.content;
        this.generatedTopic = result.data.topic || 'General Safety';
        
        // Use generated title if user hasn't set one
        if (!this.title.trim()) {
          this.title = this.generatedTitle;
        }
        
        // Use AI-suggested cadence
        if (result.data.cadence) {
          const cadenceMap: { [key: string]: TrainingCadence } = {
            'Once': TrainingCadence.Once,
            'Monthly': TrainingCadence.Monthly,
            'Quarterly': TrainingCadence.Quarterly,
            'Semi-Annually': TrainingCadence.SemiAnnually,
            'Annually': TrainingCadence.Annually
          };
          this.selectedCadence = cadenceMap[result.data.cadence] || TrainingCadence.Annually;
        }
        
        // Use AI-suggested tags (only if they're in the valid team tags)
        if (result.data.assignedTags && Array.isArray(result.data.assignedTags)) {
          // Filter to only include tags that exist in the team
          this.assignedTags = result.data.assignedTags.filter(
            (tag: string) => this.allTags.includes(tag)
          );
        }
        
        this.snackbar.open('Article generated! Review and save below.', 'Got it', { duration: 3000 });
      } else {
        this.error = 'Failed to generate article. Please try again.';
      }
    } catch (err: any) {
      console.error('Error generating article:', err);
      this.error = err.message || 'An error occurred while generating the article.';
    } finally {
      this.isGenerating = false;
    }
  }

  async saveTraining(): Promise<void> {
    if (!this.generatedContent?.trim()) {
      this.error = 'Please add content to the training article.';
      return;
    }

    if (!this.title.trim()) {
      this.error = 'Please enter a title for the training.';
      return;
    }

    this.isCreating = true;
    this.error = '';

    try {
      if (this.mode === 'edit' && this.editingArticle?.id) {
        // Update existing article
        const updates: Partial<LibraryItem> = {
          name: this.title.trim(),
          content: this.generatedContent,
          topic: this.generatedTopic || this.editingArticle.topic || 'General Safety',
          trainingCadence: this.selectedCadence,
          assignedTags: this.assignedTags
        };

        await this.trainingService.updateLibraryItem(this.editingArticle.id, updates);
        
        this.snackbar.open('Training article updated!', 'View', { duration: 5000 }).onAction().subscribe(() => {
          this.router.navigate(['/account/training/library', this.editingArticle!.id]);
        });
        
        // Navigate back to the article view
        this.router.navigate(['/account/training/library', this.editingArticle.id]);
      } else {
        // Create a new library item
        const newItem = new LibraryItem();
        newItem.name = this.title.trim();
        newItem.content = this.generatedContent;
        newItem.industry = this.accountService.aTeam?.industry || 'General';
        newItem.topic = this.generatedTopic || 'General Safety';
        newItem.teamId = this.accountService.aTeam.id;
        newItem.addedBy = this.accountService.user?.id || '';
        newItem.trainingCadence = this.selectedCadence;
        newItem.assignedTags = this.assignedTags;
        newItem.scheduledDueDate = this.trainingService.calculateOptimalScheduledDate(
          this.selectedCadence,
          this.libraryItems
        );

        // Save to library
        const id = await this.trainingService.addToLibrary(newItem);
        
        this.snackbar.open('Training article created!', 'View', { duration: 5000 }).onAction().subscribe(() => {
          this.router.navigate(['/account/training/library', id]);
        });
        
        // Navigate back to training with library view
        this.router.navigate(['/account/training'], { queryParams: { view: 'library' } });
      }
    } catch (err: any) {
      console.error('Error saving training:', err);
      this.error = err.message || 'Failed to save training article.';
    } finally {
      this.isCreating = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/account/training']);
  }

  clearGenerated(): void {
    this.generatedContent = '';
    this.generatedTitle = '';
    this.generatedTopic = '';
    this.title = '';
    this.assignedTags = [];
    this.selectedCadence = TrainingCadence.Annually;
  }

  // Check if we should show the editor (scratch mode or content generated)
  get showEditor(): boolean {
    return this.mode === 'scratch' || !!this.generatedContent;
  }

  // Switch to scratch mode (skip AI generation)
  switchToScratch(): void {
    this.mode = 'scratch';
  }

  getCadenceLabel(value: TrainingCadence): string {
    const option = this.cadenceOptions.find(o => o.value === value);
    return option?.label || value;
  }
}
