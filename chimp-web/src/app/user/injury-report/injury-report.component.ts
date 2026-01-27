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
import { MatDialog, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { TextFieldModule } from "@angular/cdk/text-field";
import SignaturePad from "signature_pad";
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
export class InjuryReport implements OnInit {
  private readonly injuryReportService = inject(InjuryReportService);
  private readonly userService = inject(UserService);
  private readonly storage = inject(Storage);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  // Reactive signals
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly submitting = signal(false);
  readonly index = signal(0);

  title: string;
  questions: Question[] = [];
  reportType: string = "injuryReport";

  readonly question = computed(() => this.questions[this.index()] || null);

  readonly progress = computed(() => {
    if (!this.questions.length) return 0;
    return Math.round((this.index() / (this.questions.length - 1)) * 100);
  });

  readonly canGoNext = computed(() => {
    const q = this.question();
    if (!q) return false;
    if (q.getStarted) return true;
    if (q.submit) return true;
    if (q.skip) return true;
    if (q.type === Type.photos) return true;
    return q.value !== undefined && q.value !== null && q.value !== '';
  });

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

    // Pre-fill user info if team member is already available
    const member = this.userService.teamMember;
    if (member) {
      const nameQ = this.questions.find(q => q.description === "What is your name?");
      if (nameQ && !nameQ.value) nameQ.value = member.name;
      
      const titleQ = this.questions.find(q => q.description === "What is your job title?");
      if (titleQ && !titleQ.value) titleQ.value = member.jobTitle;
    }

    this.loading.set(false);
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

    if (q.type === Type.signature) {
      this.captureSignature();
    } else {
      this.navigateQuestions(1);
    }
  }

  private captureSignature(): void {
    this.dialog.open(SignatureDialogComponent).afterClosed().subscribe(dataUrl => {
      if (dataUrl) {
        this.uploading.set(true);
        this.injuryReportService
          .uploadSignature(dataUrl, this.userService.teamMember?.id || 'anonymous')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (url) => {
              const q = this.question();
              if (q) q.value = url;
              this.uploading.set(false);
              this.navigateQuestions(1);
            },
            error: () => {
              this.uploading.set(false);
              this.snackbar.open("Failed to save signature", "Dismiss", { duration: 3000 });
            }
          });
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

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadImage(file);
    input.value = ''; // Reset for re-selection
  }

  private uploadImage(file: File): void {
    const q = this.question();
    if (!q || q.type !== Type.photos) return;

    // Ensure value is an array
    if (!Array.isArray(q.value)) {
      q.value = [];
    }

    this.uploading.set(true);
    const date = new Date().getTime();
    const filePath = `team/${this.userService.aTeam?.id || 'unknown'}/injury-report/${date}`;
    const storageRef = ref(this.storage, filePath);

    uploadBytes(storageRef, file)
      .then(() => getDownloadURL(storageRef))
      .then(url => {
        q.value.push({ imageUrl: url });
        this.uploading.set(false);
      })
      .catch(error => {
        console.error('Error uploading image:', error);
        this.uploading.set(false);
        this.snackbar.open("Failed to upload image", "Dismiss", { duration: 3000 });
      });
  }

  removeImage(index: number): void {
    const q = this.question();
    if (q && Array.isArray(q.value)) {
      q.value.splice(index, 1);
    }
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
    this.snackbar.open("Are you sure you want to leave? Your progress will be lost.", "Leave", { duration: 5000 })
      .onAction()
      .subscribe(() => {
        this.router.navigate(['/user'], { queryParamsHandling: "preserve" });
      });
  }

  // Type enum for template
  readonly Type = Type;
}

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
  private signaturePad?: SignaturePad;
  private handleEnd: (() => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;
  finished = false;

  ngAfterViewChecked() {
    if (this.signatureCanvas && !this.signaturePad) {
      this.canvas = this.signatureCanvas.nativeElement;
      this.canvas.width = this.canvas.offsetWidth || 320;
      this.canvas.height = 180;
      this.signaturePad = new SignaturePad(this.canvas, { minWidth: 1, dotSize: 1 });
      
      this.handleEnd = () => {
        this.finished = true;
      };
      this.canvas.addEventListener("mouseup", this.handleEnd);
      this.canvas.addEventListener("touchend", this.handleEnd);
    }
  }

  ngOnDestroy(): void {
    if (this.canvas && this.handleEnd) {
      this.canvas.removeEventListener("mouseup", this.handleEnd);
      this.canvas.removeEventListener("touchend", this.handleEnd);
    }
  }

  submit(): void {
    const dataUrl = this.signaturePad?.toDataURL() || null;
    this.dialogRef.close(dataUrl);
  }
}
