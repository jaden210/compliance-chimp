import { Component, ViewChild, OnInit, AfterViewChecked, ElementRef, inject } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router } from "@angular/router";
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
import { MatListModule } from "@angular/material/list";
import SignaturePad from "signature_pad";
import { switchMap, catchError } from "rxjs/operators";
import { from } from "rxjs";
import { UserService } from "../user.service";
import {
  InjuryReportService,
  Question,
  IncidentReport,
  Type
} from "./injury-report.service";

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
    MatListModule,
    MatSnackBarModule
  ]
})
export class InjuryReport implements OnInit, AfterViewChecked {
  @ViewChild("signatureCanvas") signatureCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly injuryReportService = inject(InjuryReportService);
  private readonly userService = inject(UserService);
  private readonly storage = inject(Storage);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  private signaturePad?: SignaturePad;

  title: string;
  index: number = 0;
  question: Question;
  questions: Question[];
  reportType: string;
  signatureOptions = { minWidth: 1, dotSize: 1 };

  ngOnInit() {
    this.questions = [];
    this.reportType = "injuryReport";
    if (this.reportType === "injuryReport") {
      this.questions = require("./employee-questions.json");
      this.title = "Employee Report of Injury";
    } else {
      this.questions = require("./supervisor-questions.json");
      this.title = "Supervisor Investigation";
    }
    this.question = this.questions[this.index];
  }

  ngAfterViewChecked() {
    if (this.signatureCanvas && !this.signaturePad) {
      const canvas = this.signatureCanvas.nativeElement;
      canvas.width = canvas.offsetWidth || 320;
      canvas.height = 160;
      this.signaturePad = new SignaturePad(canvas, this.signatureOptions);
      const handleEnd = () => {
        if (this.question) {
          this.question.value = true;
        }
      };
      canvas.addEventListener("mouseup", handleEnd);
      canvas.addEventListener("touchend", handleEnd);
    }
  }

  public goBack(): void {
    this.navigateQuestions(-1);
  }

  public skip(): void {
    this.navigateQuestions(1);
  }

  public next(): void {
    if (this.question.type === Type.signature) {
      const dataUrl = this.signaturePad ? this.signaturePad.toDataURL() : null;
      if (!dataUrl) return;
      this.injuryReportService
        .uploadSignature(dataUrl, this.userService.teamMember.id)
        .subscribe(url => {
          this.question.value = url;
          this.navigateQuestions(1);
        });
    } else {
      this.navigateQuestions(1);
    }
  }

  private navigateQuestions(direction: number): void {
    let i = this.index + direction;
    let next = true;
    while (next) {
      const nextQ = this.questions[i].showIf;
      if (nextQ) {
        const description = nextQ.question;
        const value = nextQ.value;
        const question = this.questions.find(q => q.description === description);
        const answer = question ? question.value : null;
        if (value === answer) {
          next = false;
        } else {
          i += direction;
        }
      } else {
        next = false;
      }
    }
    this.question = this.questions[i];
    setTimeout(() => {
      if (this.question.type === "text") {
        document.getElementById("text-box")?.focus();
      }
    }, 10);
    this.index = i;
    if (this.question.description === "What is your name?" && !this.question.value) {
      this.question.value = this.userService.teamMember.name;
    }
    if (this.question.description === "What is your job title?" && !this.question.value) {
      this.question.value = this.userService.teamMember.jobTitle;
    }
  }

  public getImage(): void {
    document.getElementById("image-input")?.click();
  }

  public setImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        // Image loaded
      };
      reader.readAsDataURL(input.files[0]);
      this.uploadImage(input.files[0]);
    }
  }

  public uploadImage(image: File): void {
    const date = new Date().getTime();
    const filePath = `team/${this.userService.aTeam.id}/injuryReport/${date}`;
    const storageRef = ref(this.storage, filePath);
    from(uploadBytes(storageRef, image)).pipe(
      switchMap(() => getDownloadURL(storageRef)),
      catchError(error => {
        console.error(`Error saving image for topic`, error);
        throw error;
      })
    ).subscribe(imageUrl => {
      this.question.value.push({ imageUrl });
    });
  }

  public submitReport(): void {
    const finishedForm = new IncidentReport();
    finishedForm.createdAt = new Date();
    finishedForm.teamId = this.userService.aTeam.id;
    finishedForm.type = this.reportType === "injuryReport"
      ? "Injury Report"
      : "Supervisor Investigation";
    finishedForm.submittedBy = this.userService.teamMember.id;
    finishedForm.questions = this.questions
      .filter(q => q.value && q.value.length)
      .map(q => ({ description: q.description, value: q.value, type: q.type }));
    this.injuryReportService
      .createIncidentReport(this.userService.aTeam.id, finishedForm)
      .then(() => {
        this.router.navigate(['/user'], { queryParamsHandling: "preserve" });
      });
  }

  public quit(): void {
    this.snackbar.open("Are you sure?", "Leave", { duration: 5000 }).onAction().subscribe(() => {
      this.router.navigate(['/user'], { queryParamsHandling: "preserve" });
    });
  }
}
