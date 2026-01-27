import { Component, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatDialog, MatDialogRef, MatDialogModule } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { UserService } from "../user.service";
import { ShortAnswer, Survey, SurveyResponse, User } from "src/app/app.service";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import { LibraryItem } from "src/app/account/training/training.service";
import { Subject, switchMap, filter, tap } from "rxjs";
import { takeUntil } from "rxjs/operators";
import SignaturePad from "signature_pad";

@Component({
  standalone: true,
  selector: "survey",
  templateUrl: "survey.component.html",
  styleUrls: ["survey.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatBottomSheetModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  providers: [DatePipe]
})
export class SurveyComponent implements OnInit, OnDestroy {
  @ViewChild("myInput") myInput: ElementRef;

  private readonly userService = inject(UserService);
  private readonly datePipe = inject(DatePipe);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  survey: Survey;
  title: string;
  sender: User;
  authorColor: string;
  shortAnswer: boolean | null = null;
  longAnswer: string | null = null;
  responseText: string;
  sending: boolean;
  errorIcon: boolean;
  loading: boolean = true;
  public article: LibraryItem;

  ngOnInit() {
    // Load survey when route params are available
    this.route.paramMap
      .pipe(
        takeUntil(this.destroy$),
        filter((params: ParamMap) => !!params.get("surveyId")),
        switchMap((params: ParamMap) => {
          this.loading = true;
          const surveyId = params.get("surveyId");
          return this.userService.getSurvey(surveyId);
        })
      )
      .subscribe(survey => {
        if (survey) {
          this.title = survey.title;
          survey.createdAt = survey.createdAt?.toDate ? survey.createdAt.toDate() : survey.createdAt;
          this.survey = survey;
          this.loading = false;

          // Load article content
          if (survey.libraryId) {
            this.userService.getLibraryItem(survey.libraryId)
              .pipe(takeUntil(this.destroy$))
              .subscribe(li => {
                this.article = li;
                this.cdr.detectChanges();
              });
          }

          // Get sender from already-loaded team managers
          if (this.userService.teamManagers?.length) {
            this.sender = this.userService.teamManagers.find(u => u.id === survey.userId);
          }
        } else {
          this.survey = null;
          this.loading = false;
        }
      });

    // Also listen for team managers if they load later
    this.userService.teamManagersObservable
      .pipe(
        takeUntil(this.destroy$),
        filter(managers => managers != null && managers.length > 0)
      )
      .subscribe(managers => {
        if (this.survey && !this.sender) {
          this.sender = managers.find(u => u.id === this.survey.userId);
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public yes(): void {
    this.shortAnswer = this.shortAnswer ? null : true;
  }

  public no(): void {
    this.shortAnswer = this.shortAnswer === false ? null : false;
  }

  public createResponse(signature: any = null): void {
    if (!signature) {
      this.captureSignature();
      return;
    }
    this.errorIcon = false;
    this.sending = true;
    const response = new SurveyResponse();
    response.teamId = this.userService.aTeam.id;
    response.surveyId = this.survey.id;
    response.createdAt = new Date();
    response.longAnswer = this.longAnswer;
    response.shortAnswer = this.shortAnswer ? ShortAnswer.Yes : ShortAnswer.No;
    response.teamMemberId = this.userService.teamMember.id;
    this.responseText = this.longAnswer;
    response.signatureUrl = signature;
    this.longAnswer = null;
    this.userService
      .createResponse(response)
      .then(() => this.close())
      .catch(() => (this.errorIcon = true));
  }

  private captureSignature(): void {
    this.dialog.open(SignatureDialog).afterClosed().subscribe(data => {
      if (data) {
        this.createResponse(data);
      }
    });
  }

  close() {
    this.router.navigate(['/user'], { queryParamsHandling: 'preserve' });
  }
}


@Component({
  standalone: true,
  selector: "signature-dialog",
  templateUrl: "signature-dialog.html",
  styleUrls: ["./survey.component.scss"],
  imports: [CommonModule, MatDialogModule, MatButtonModule]
})
export class SignatureDialog implements AfterViewChecked, OnDestroy {
  @ViewChild("signatureCanvas") signatureCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly dialogRef = inject(MatDialogRef<SignatureDialog>);

  private signaturePad?: SignaturePad;
  private canvas: HTMLCanvasElement | null = null;
  finished: boolean = false;

  ngAfterViewChecked() {
    if (this.signatureCanvas && !this.signaturePad) {
      this.canvas = this.signatureCanvas.nativeElement;
      this.canvas.width = this.canvas.offsetWidth || 320;
      this.canvas.height = 160;
      this.signaturePad = new SignaturePad(this.canvas, {
        minWidth: 1,
        dotSize: 1
      });
      // Use SignaturePad's built-in addEventListener for reliable stroke detection
      this.signaturePad.addEventListener('endStroke', () => {
        this.finished = true;
      });
    }
  }

  ngOnDestroy(): void {
    if (this.signaturePad) {
      this.signaturePad.off();
    }
  }

  close(): void {
    const dataUrl = this.signaturePad ? this.signaturePad.toDataURL() : null;
    this.dialogRef.close(dataUrl);
  }
}
