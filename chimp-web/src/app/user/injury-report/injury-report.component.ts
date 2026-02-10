import { Component, ViewChild, OnInit, AfterViewChecked, OnDestroy, ElementRef, inject, DestroyRef, signal, computed } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Storage, ref, uploadBytes, getDownloadURL } from "@angular/fire/storage";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatRadioModule } from "@angular/material/radio";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { TextFieldModule } from "@angular/cdk/text-field";
import { UserService } from "../user.service";
import {
  InjuryReportService,
  Question,
  IncidentReport,
  Type
} from "./injury-report.service";

import employeeQuestions from "./employee-questions.json";
import supervisorQuestions from "./supervisor-questions.json";

@Component({
  standalone: true,
  selector: "injury-report",
  templateUrl: "injury-report.component.html",
  styleUrls: ["injury-report.component.scss"],
  providers: [InjuryReportService, DatePipe],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatRadioModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    TextFieldModule
  ]
})
export class InjuryReport implements OnInit, AfterViewChecked, OnDestroy {
  private readonly injuryReportService = inject(InjuryReportService);
  private readonly userService = inject(UserService);
  private readonly storage = inject(Storage);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  // Signature pad elements
  @ViewChild('signatureCanvas') signatureCanvas?: ElementRef<HTMLCanvasElement>;
  private signatureCtx: CanvasRenderingContext2D | null = null;
  private signatureCleanup: (() => void) | null = null;
  private isDrawing = false;
  private lastPoint: { x: number; y: number } | null = null;
  readonly signatureComplete = signal(false);

  // Reactive signals
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly submitting = signal(false);
  readonly index = signal(0);
  readonly answerTrigger = signal(0); // Trigger to force canGoNext recomputation

  title: string;
  questions: Question[] = [];
  reportType: string = "injuryReport";

  readonly question = computed(() => this.questions[this.index()] || null);

  readonly progress = computed(() => {
    if (!this.questions.length) return 0;
    return Math.round((this.index() / (this.questions.length - 1)) * 100);
  });

  readonly canGoNext = computed(() => {
    // Read the trigger to subscribe to answer changes
    this.answerTrigger();
    
    const q = this.question();
    if (!q) return false;
    if (q.getStarted) return true;
    if (q.submit) return true;
    if (q.skip) return true;
    if (q.type === Type.photos) return true;
    // For signature type: need either existing value or a completed signature
    if (q.type === Type.signature) {
      return q.value || this.signatureComplete();
    }
    return q.value !== undefined && q.value !== null && q.value !== '';
  });

  selectOption(question: Question, value: any): void {
    question.value = value;
    this.onValueChange();
  }

  private readonly STORAGE_KEY = 'injury-report-progress';

  onValueChange(): void {
    // Trigger recomputation of canGoNext
    this.answerTrigger.update(v => v + 1);
    // Save progress to localStorage
    this.saveProgress();
  }

  private saveProgress(): void {
    try {
      const progress = {
        reportType: this.reportType,
        index: this.index(),
        questions: this.questions.map(q => ({
          description: q.description,
          value: q.value
        }))
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.warn('Could not save progress to localStorage:', e);
    }
  }

  private loadProgress(): boolean {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) return false;

      const progress = JSON.parse(saved);
      
      // Only restore if same report type
      if (progress.reportType !== this.reportType) {
        this.clearProgress();
        return false;
      }

      // Restore values to questions
      if (progress.questions?.length) {
        progress.questions.forEach((savedQ: { description: string; value: any }) => {
          const q = this.questions.find(q => q.description === savedQ.description);
          if (q && savedQ.value !== undefined) {
            q.value = savedQ.value;
          }
        });
      }

      // Restore index
      if (typeof progress.index === 'number' && progress.index > 0) {
        this.index.set(progress.index);
      }

      return true;
    } catch (e) {
      console.warn('Could not load progress from localStorage:', e);
      return false;
    }
  }

  private clearProgress(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {
      console.warn('Could not clear localStorage:', e);
    }
  }

  ngOnInit() {
    this.loading.set(true);
    
    // Read report type from query params
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const type = params['type'];
        if (type) {
          this.reportType = type;
        }
        this.initializeQuestions();
      });
  }

  private initializeQuestions(): void {
    // Load questions based on report type
    if (this.reportType === "injuryReport") {
      this.questions = JSON.parse(JSON.stringify(employeeQuestions));
      this.title = "Report an Injury";
    } else {
      this.questions = JSON.parse(JSON.stringify(supervisorQuestions));
      this.title = "Supervisor Investigation";
    }

    // Initialize photo arrays
    this.questions.forEach(q => {
      if (q.type === Type.photos && !Array.isArray(q.value)) {
        q.value = [];
      }
    });

    // Try to load saved progress first
    const hasProgress = this.loadProgress();

    // Only pre-fill user info if no saved progress
    if (!hasProgress) {
      const member = this.userService.teamMember;
      if (member) {
        const nameQ = this.questions.find(q => q.description === "What is your name?");
        if (nameQ && !nameQ.value) nameQ.value = member.name;
        
        const titleQ = this.questions.find(q => q.description === "What is your job title?");
        if (titleQ && !titleQ.value) titleQ.value = member.jobTitle;
      }
    }

    this.loading.set(false);
  }

  private signaturePadInitPending = false;

  ngAfterViewChecked(): void {
    // Initialize signature pad when canvas becomes available
    const q = this.question();
    if (q?.type === Type.signature && !q.value && this.signatureCanvas && !this.signatureCtx && !this.signaturePadInitPending) {
      this.signaturePadInitPending = true;
      // Use requestAnimationFrame to ensure canvas has rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.initializeSignaturePad();
        });
      });
    }
  }

  private initializeSignaturePad(): void {
    if (!this.signatureCanvas || this.signatureCtx) {
      this.signaturePadInitPending = false;
      return;
    }
    
    const canvas = this.signatureCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    
    // Ensure we have valid dimensions
    if (rect.width === 0 || rect.height === 0) {
      // Try again on next frame
      requestAnimationFrame(() => this.initializeSignaturePad());
      return;
    }
    
    // Scale canvas for device pixel ratio for sharp rendering on mobile
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.signaturePadInitPending = false;
      return;
    }
    
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    this.signatureCtx = ctx;
    
    const getPoint = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.isDrawing = true;
      const point = getPoint(e);
      this.lastPoint = point;
      ctx.beginPath();
      ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    };
    
    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDrawing || !this.lastPoint) return;
      e.preventDefault();
      const point = getPoint(e);
      ctx.beginPath();
      ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      this.lastPoint = point;
    };
    
    const onPointerUp = () => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.lastPoint = null;
        this.signatureComplete.set(true);
      }
    };
    
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    
    this.signatureCleanup = () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
    
    this.signaturePadInitPending = false;
  }

  ngOnDestroy(): void {
    this.cleanupSignaturePad();
  }

  private cleanupSignaturePad(): void {
    this.signatureCleanup?.();
    this.signatureCtx = null;
    this.isDrawing = false;
    this.lastPoint = null;
    this.signatureCleanup = null;
    this.signaturePadInitPending = false;
  }

  clearSignaturePad(): void {
    if (this.signatureCtx && this.signatureCanvas) {
      const canvas = this.signatureCanvas.nativeElement;
      const dpr = window.devicePixelRatio || 1;
      // Reset transform, clear canvas, restore drawing state
      this.signatureCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.signatureCtx.clearRect(0, 0, canvas.width, canvas.height);
      this.signatureCtx.scale(dpr, dpr);
      this.signatureCtx.lineWidth = 2;
      this.signatureCtx.lineCap = 'round';
      this.signatureCtx.lineJoin = 'round';
      this.signatureCtx.strokeStyle = '#000';
      this.signatureCtx.fillStyle = '#000';
      this.signatureComplete.set(false);
    }
  }

  clearSignature(): void {
    const q = this.question();
    if (q) {
      q.value = null;
      this.signatureComplete.set(false);
      this.cleanupSignaturePad();
      this.onValueChange();
    }
  }

  goBack(): void {
    this.navigateQuestions(-1);
  }

  skip(): void {
    this.navigateQuestions(1);
  }

  next(): void {
    const q = this.question();
    if (!q) return;

    // Handle signature upload from embedded canvas
    if (q.type === Type.signature && !q.value && this.signatureCtx && this.signatureComplete()) {
      this.uploadSignatureFromPad();
    } else {
      this.navigateQuestions(1);
    }
  }

  private uploadSignatureFromPad(): void {
    const dataUrl = this.signatureCanvas?.nativeElement.toDataURL();
    if (!dataUrl) return;

    this.uploading.set(true);
    this.injuryReportService
      .uploadSignature(dataUrl, this.userService.teamMember?.id || 'anonymous')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (url) => {
          const q = this.question();
          if (q) q.value = url;
          this.uploading.set(false);
          this.signatureComplete.set(false);
          this.cleanupSignaturePad();
          this.navigateQuestions(1);
        },
        error: () => {
          this.uploading.set(false);
          this.snackbar.open("Failed to save signature", "Dismiss", { duration: 3000 });
        }
      });
  }

  private navigateQuestions(direction: number): void {
    let i = this.index() + direction;
    
    // Bounds check
    if (i < 0) {
      i = 0;
      return;
    }
    if (i >= this.questions.length) {
      i = this.questions.length - 1;
      return;
    }

    // Skip conditional questions that shouldn't be shown
    let next = true;
    while (next && i >= 0 && i < this.questions.length) {
      const nextQ = this.questions[i]?.showIf;
      if (nextQ) {
        const description = nextQ.question;
        const value = nextQ.value;
        const question = this.questions.find(q => q.description === description);
        const answer = question?.value ?? null;
        if (value === answer) {
          next = false;
        } else {
          i += direction;
        }
      } else {
        next = false;
      }
    }

    // Final bounds check
    if (i < 0) i = 0;
    if (i >= this.questions.length) i = this.questions.length - 1;

    this.index.set(i);
    this.saveProgress(); // Save progress when navigating

    // Focus text input
    setTimeout(() => {
      const q = this.question();
      if (q?.type === Type.text) {
        document.getElementById("text-input")?.focus();
      }
    }, 100);
  }

  selectImage(): void {
    document.getElementById("photo-input")?.click();
  }

  onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    // Upload all selected files
    Array.from(files).forEach(file => {
      this.uploadImage(file);
    });
    
    input.value = ''; // Reset for re-selection
  }

  private uploadCount = 0;

  private uploadImage(file: File): void {
    const q = this.question();
    if (!q || q.type !== Type.photos) return;

    // Ensure value is an array
    if (!Array.isArray(q.value)) {
      q.value = [];
    }

    this.uploadCount++;
    this.uploading.set(true);
    
    // Use unique timestamp with random suffix for multiple files
    const timestamp = new Date().getTime();
    const random = Math.random().toString(36).substring(7);
    const filePath = `team/${this.userService.aTeam?.id || 'unknown'}/injury-report/${timestamp}-${random}`;
    const storageRef = ref(this.storage, filePath);

    uploadBytes(storageRef, file)
      .then(() => getDownloadURL(storageRef))
      .then(url => {
        q.value.push({ imageUrl: url });
        this.uploadCount--;
        if (this.uploadCount === 0) {
          this.uploading.set(false);
          this.saveProgress();
        }
      })
      .catch(error => {
        console.error('Error uploading image:', error);
        this.uploadCount--;
        if (this.uploadCount === 0) {
          this.uploading.set(false);
        }
        this.snackbar.open("Failed to upload image", "Dismiss", { duration: 3000 });
      });
  }

  removeImage(index: number): void {
    const q = this.question();
    if (q && Array.isArray(q.value)) {
      q.value.splice(index, 1);
      this.saveProgress();
    }
  }

  viewImage(imageUrl: string): void {
    this.dialog.open(ImageViewerDialogComponent, {
      data: { imageUrl },
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh'
    });
  }

  submitReport(): void {
    this.submitting.set(true);

    const finishedForm = new IncidentReport();
    finishedForm.createdAt = new Date();
    finishedForm.teamId = this.userService.aTeam?.id || '';
    finishedForm.type = this.reportType === "injuryReport"
      ? "Injury Report"
      : "Supervisor Investigation";
    finishedForm.submittedBy = this.userService.teamMember?.id || 'anonymous';
    finishedForm.questions = this.questions
      .filter(q => q.value !== undefined && q.value !== null && q.value !== '')
      .filter(q => !Array.isArray(q.value) || q.value.length > 0)
      .map(q => ({ description: q.description, value: q.value, type: q.type }));

    this.injuryReportService
      .createIncidentReport(this.userService.aTeam?.id || '', finishedForm)
      .then(() => {
        this.submitting.set(false);
        this.clearProgress(); // Clear saved progress on successful submit
        this.snackbar.open("Report submitted successfully", "OK", { duration: 3000 });
        this.router.navigate(['/user'], { queryParamsHandling: "preserve" });
      })
      .catch(error => {
        console.error('Error submitting report:', error);
        this.submitting.set(false);
        this.snackbar.open("Failed to submit report. Please try again.", "Dismiss", { duration: 5000 });
      });
  }

  quit(): void {
    const dialogRef = this.dialog.open(ConfirmLeaveDialogComponent);
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.clearProgress(); // Clear saved progress when user confirms leaving
        this.router.navigate(['/user'], { queryParamsHandling: "preserve" });
      }
    });
  }

  // Type enum for template
  readonly Type = Type;
}

@Component({
  standalone: true,
  selector: "confirm-leave-dialog",
  template: `
    <h2 mat-dialog-title>
      <mat-icon>warning</mat-icon>
      Leave Report?
    </h2>
    <mat-dialog-content>
      Your progress will be lost. Are you sure you want to leave?
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="warn" [mat-dialog-close]="true">Leave</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h2[mat-dialog-title] mat-icon {
      color: #F59E0B;
    }
  `],
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule]
})
export class ConfirmLeaveDialogComponent {}

@Component({
  standalone: true,
  selector: "signature-dialog",
  template: `
    <h2 mat-dialog-title>Sign Below</h2>
    <mat-dialog-content>
      <p class="signature-hint">Please sign in the box below to confirm your report</p>
      <div class="signature-container">
        <canvas #signatureCanvas class="signature-canvas"></canvas>
      </div>
      @if (!finished) {
        <p class="signature-prompt">Sign above to continue</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!finished" (click)="submit()">
        Confirm Signature
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .signature-hint {
      margin: 0 0 16px;
      font-size: 14px;
      color: rgba(0,0,0,0.6);
    }
    .signature-container {
      border: 2px solid #e0e0e0;
      border-radius: 12px;
      overflow: hidden;
      background: #fafafa;
    }
    .signature-canvas {
      width: 100%;
      height: 180px;
      display: block;
      touch-action: none;
    }
    .signature-prompt {
      margin: 12px 0 0;
      font-size: 13px;
      color: rgba(0,0,0,0.4);
      text-align: center;
      font-style: italic;
    }
  `],
  imports: [CommonModule, MatDialogModule, MatButtonModule]
})
export class SignatureDialogComponent implements AfterViewChecked, OnDestroy {
  @ViewChild("signatureCanvas") signatureCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly dialogRef = inject(MatDialogRef<SignatureDialogComponent>);
  private signatureCtx: CanvasRenderingContext2D | null = null;
  private cleanup: (() => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private isDrawing = false;
  private lastPoint: { x: number; y: number } | null = null;
  finished = false;

  ngAfterViewChecked() {
    if (this.signatureCanvas && !this.signatureCtx) {
      this.canvas = this.signatureCanvas.nativeElement;
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = (rect.width || 320) * dpr;
      this.canvas.height = 180 * dpr;

      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
      this.signatureCtx = ctx;

      const canvas = this.canvas;
      const getPoint = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        this.isDrawing = true;
        this.lastPoint = getPoint(e);
        ctx.beginPath();
        ctx.arc(this.lastPoint.x, this.lastPoint.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      };

      const onMove = (e: PointerEvent) => {
        if (!this.isDrawing || !this.lastPoint) return;
        e.preventDefault();
        const point = getPoint(e);
        ctx.beginPath();
        ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        this.lastPoint = point;
      };

      const onUp = () => {
        if (this.isDrawing) {
          this.isDrawing = false;
          this.lastPoint = null;
          this.finished = true;
        }
      };

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);

      this.cleanup = () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
      };
    }
  }

  ngOnDestroy(): void {
    this.cleanup?.();
  }

  submit(): void {
    const dataUrl = this.canvas?.toDataURL() || null;
    this.dialogRef.close(dataUrl);
  }
}

@Component({
  standalone: true,
  selector: "image-viewer-dialog",
  template: `
    <div class="image-viewer" (click)="close()">
      <button mat-icon-button class="close-btn">
        <mat-icon>close</mat-icon>
      </button>
      <img [src]="data.imageUrl" alt="Full size image" (click)="$event.stopPropagation()">
    </div>
  `,
  styles: [`
    .image-viewer {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      padding: 16px;
      box-sizing: border-box;
    }
    .close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      z-index: 10;
    }
    .close-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 8px;
    }
  `],
  imports: [CommonModule, MatButtonModule, MatIconModule, MatDialogModule]
})
export class ImageViewerDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ImageViewerDialogComponent>);
  readonly data = inject<{ imageUrl: string }>(MAT_DIALOG_DATA);

  close(): void {
    this.dialogRef.close();
  }
}
