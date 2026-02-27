import { Component, OnInit, OnDestroy, NgZone, inject, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDialog, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
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
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { NgxEditorModule, Editor, Toolbar } from "ngx-editor";
import { Subscription } from "rxjs";
import { take } from "rxjs/operators";
import { AccountService } from "../../account.service";
import { TrainingService, TrainingCadence, LibraryItem, TrainingRecommendation } from "../training.service";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Storage, ref, uploadBytesResumable, getDownloadURL } from "@angular/fire/storage";
import { TagInputComponent } from "../../team/tag-input/tag-input.component";

// Confirmation dialog for leaving without saving
@Component({
  selector: 'confirm-leave-dialog',
  template: `
    <h2 mat-dialog-title>Leave without saving?</h2>
    <mat-dialog-content>
      <p>You haven't added this training to your library yet. If you leave now, your work will be lost.</p>
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
export class ConfirmLeaveDialog {
  private readonly dialogRef = inject(MatDialogRef<ConfirmLeaveDialog>);

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
    TagInputComponent,
    MatDialogModule,
    MatSlideToggleModule,
    MatProgressBarModule
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
  isInPerson: boolean = false;
  
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
    { value: TrainingCadence.UponHire, label: 'Upon Hire (new employees)' },
    { value: TrainingCadence.Monthly, label: 'Monthly' },
    { value: TrainingCadence.Quarterly, label: 'Quarterly' },
    { value: TrainingCadence.SemiAnnually, label: 'Semi-Annually' },
    { value: TrainingCadence.Annually, label: 'Annually' }
  ];

  // Get all unique tags from team members for autocomplete
  get allTags(): string[] {
    return this.trainingService.getAllTags(this.accountService.teamMembers || []);
  }

  // Media upload state
  @ViewChild('imageFileInput') imageFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('videoFileInput') videoFileInput!: ElementRef<HTMLInputElement>;
  mediaUploadProgress: number | null = null;
  mediaUploadType: 'image' | 'video' | null = null;

  // Videos stored separately from rich text (ProseMirror can't handle <video> nodes)
  videoUrls: string[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    public accountService: AccountService,
    private trainingService: TrainingService,
    private snackbar: MatSnackBar,
    private functions: Functions,
    private ngZone: NgZone,
    private dialog: MatDialog,
    private storage: Storage
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
            'Upon Hire': TrainingCadence.UponHire,
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
    this.isInPerson = article.isInPerson || false;
    this.videoUrls = article.videoUrls ? [...article.videoUrls] : [];
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
            'Upon Hire': TrainingCadence.UponHire,
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
          assignedTags: this.assignedTags,
          isInPerson: this.isInPerson,
          videoUrls: this.videoUrls.length > 0 ? this.videoUrls : []
        };

        await this.trainingService.updateLibraryItem(this.editingArticle.id, updates);
        
        this.snackbar.open('Training article updated!', 'View', { duration: 5000 }).onAction().subscribe(() => {
          this.router.navigate(['/account/training/library', this.editingArticle!.id]);
        });
        
        // Navigate back to the article view, replacing this page in history
        // so clicking back from the article goes to training home, not back to edit
        this.router.navigate(['/account/training/library', this.editingArticle.id], { replaceUrl: true });
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
        newItem.isInPerson = this.isInPerson;
        newItem.videoUrls = this.videoUrls.length > 0 ? this.videoUrls : [];
        newItem.scheduledDueDate = this.trainingService.calculateOptimalScheduledDate(
          this.selectedCadence,
          this.libraryItems
        );

        // Save to library
        const id = await this.trainingService.addToLibrary(newItem);
        
        this.snackbar.open('Training article created!', 'View', { duration: 5000 }).onAction().subscribe(() => {
          this.router.navigate(['/account/training/library', id]);
        });
        
        // Navigate back to training schedule
        this.router.navigate(['/account/training']);
      }
    } catch (err: any) {
      console.error('Error saving training:', err);
      this.error = err.message || 'Failed to save training article.';
    } finally {
      this.isCreating = false;
    }
  }

  triggerImageUpload(): void {
    this.imageFileInput.nativeElement.click();
  }

  triggerVideoUpload(): void {
    this.videoFileInput.nativeElement.click();
  }

  onImageFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.snackbar.open('Please select an image file.', 'OK', { duration: 3000 });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.snackbar.open('Image must be under 10 MB.', 'OK', { duration: 3000 });
      return;
    }
    this.uploadMediaFile(file, 'image');
    // Reset input so the same file can be re-selected
    (event.target as HTMLInputElement).value = '';
  }

  onVideoFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      this.snackbar.open('Please select a video file.', 'OK', { duration: 3000 });
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      this.snackbar.open('Video must be under 200 MB.', 'OK', { duration: 3000 });
      return;
    }
    this.uploadMediaFile(file, 'video');
    (event.target as HTMLInputElement).value = '';
  }

  private uploadMediaFile(file: File, type: 'image' | 'video'): void {
    const teamId = this.accountService.aTeam?.id || 'general';
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `training-media/${teamId}/${timestamp}-${safeName}`;
    const storageRef = ref(this.storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    this.mediaUploadType = type;
    this.mediaUploadProgress = 0;

    uploadTask.on('state_changed',
      (snapshot) => {
        this.mediaUploadProgress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      },
      (error) => {
        console.error('Media upload error:', error);
        this.mediaUploadProgress = null;
        this.mediaUploadType = null;
        this.snackbar.open('Upload failed. Please try again.', 'OK', { duration: 3000 });
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        this.insertMediaIntoContent(url, type, file.type);
        this.mediaUploadProgress = null;
        this.mediaUploadType = null;
        this.snackbar.open(`${type === 'image' ? 'Image' : 'Video'} inserted into article.`, 'OK', { duration: 2500 });
      }
    );
  }

  private insertMediaIntoContent(url: string, type: 'image' | 'video', _mimeType: string): void {
    if (type === 'image') {
      // Use ProseMirror's schema to insert an image node at the current cursor position
      const view = this.editor.view;
      const { state } = view;
      const schema = state.schema;
      if (schema.nodes['image']) {
        const imgNode = schema.nodes['image'].create({ src: url, alt: '', title: '' });
        const tr = state.tr.replaceSelectionWith(imgNode);
        view.dispatch(tr);
        view.focus();
        return;
      }
      // Fallback: append img HTML to content
      this.generatedContent = (this.generatedContent || '') +
        `<p><img src="${url}" alt="" style="max-width:100%;height:auto;border-radius:8px;"></p>`;
      return;
    }

    // Videos are stored separately — ProseMirror strips <video> elements from its schema
    this.videoUrls = [...this.videoUrls, url];
  }

  removeVideo(index: number): void {
    this.videoUrls = this.videoUrls.filter((_, i) => i !== index);
  }

  goBack(): void {
    // Check if user has unsaved content (not in edit mode)
    const hasUnsavedContent = this.mode !== 'edit' && (
      this.generatedContent?.trim() || 
      this.title?.trim() || 
      this.description?.trim()
    );

    if (hasUnsavedContent) {
      const dialogRef = this.dialog.open(ConfirmLeaveDialog);
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
    this.generatedContent = '';
    this.generatedTitle = '';
    this.generatedTopic = '';
    this.title = '';
    this.assignedTags = [];
    this.selectedCadence = TrainingCadence.Annually;
    this.videoUrls = [];
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
