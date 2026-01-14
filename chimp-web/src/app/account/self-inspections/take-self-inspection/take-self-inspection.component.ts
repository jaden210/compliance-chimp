import { Component, HostListener } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { SelfInspectionsService, Question, Categories, DeleteInspectionDialog, SelfInspection, Inspection } from "../self-inspections.service";
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { Inject } from "@angular/core";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { TextFieldModule } from "@angular/cdk/text-field";
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { Location } from "@angular/common";
import { Subscription } from "rxjs";
import { AccountService } from "../../account.service";
import { Storage, ref, uploadBytes, getDownloadURL } from "@angular/fire/storage";

@Component({
  standalone: true,
  selector: "app-take-self-inspection",
  templateUrl: "./take-self-inspection.component.html",
  styleUrls: ["./take-self-inspection.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    TextFieldModule
  ],
  providers: [DatePipe]
})
export class TakeSelfInspectionComponent {

  subscription: Subscription;
  selfInspection: SelfInspection = new SelfInspection();
  inspection: Inspection = new Inspection();
  aCategory: Categories;
  aQuestion: Question = new Question();
  count: string;
  loading: boolean = false;
  compliantPercent: number = 0;
  nonCompliantPercent: number = 0;

  @HostListener('document:keydown.enter', ['$event'])
  handleEnterKey(event: Event) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return;
    }
    this.nextQuestion();
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  handleLeftArrow(event: Event) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return;
    }
    event.preventDefault();
    this.answerQuestion(true); // Yes
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  handleRightArrow(event: Event) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return;
    }
    event.preventDefault();
    this.answerQuestion(false); // No
  }

  @HostListener('document:keydown.arrowdown', ['$event'])
  handleDownArrow(event: Event) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return;
    }
    event.preventDefault();
    // Focus the comment field
    const commentField = document.querySelector('.comment-field textarea') as HTMLTextAreaElement;
    if (commentField) {
      commentField.focus();
    }
  }

  @HostListener('document:keydown.arrowup', ['$event'])
  handleUpArrow(event: Event) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return;
    }
    event.preventDefault();
    // Clear the answer
    this.clearAnswer();
  }

  constructor(
    private accountService: AccountService,
    public selfInspectionsService: SelfInspectionsService,
    private snackbar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router,
    public location: Location,
    public dialog: MatDialog,
    private storage: Storage
  ) {
    this.subscription = this.accountService.aTeamObservable.subscribe(team => {
      if (team) {
        this.route.paramMap.subscribe((params: ParamMap) => {
          let selfInspectionId = params.get("selfInspectionId");
          let inspectionId = params.get("inspectionId");
          this.selfInspectionsService.getSelfInspection(selfInspectionId, team.id).subscribe(si => this.selfInspection = si);
          this.selfInspectionsService.getSelfInspectionInspection(selfInspectionId, inspectionId, team.id).subscribe(inspection => {
            if (!this.inspection.id) {
              this.inspection = inspection;
              this.aCategory = inspection.categories[0];
              this.aCategory.show = true;
              this.aQuestion = this.aCategory.questions[0];
              this.getCount();
            }
          });
        });
      }
    });
  }

  getCount() {
    let answeredQuestions = 0;
    let compliantAnswers = 0;
    let totalQuestions = 0;
    this.inspection.categories.forEach(category => {
      category.questions.forEach(question => {
        if (question.answer !== undefined) {
          answeredQuestions++;
          // Check if answer matches expected answer
          // expectedAnswer: false means "No" is compliant, undefined/true means "Yes" is compliant
          const expectedAnswer = question.expectedAnswer === false ? false : true;
          if (question.answer === expectedAnswer) compliantAnswers++;
        }
        totalQuestions++;
      });
    });
    this.count = answeredQuestions + '/' + totalQuestions;
    this.inspection.completedPercent = Math.round((answeredQuestions/totalQuestions)*100);
    // Calculate compliance only from answered questions
    this.inspection.compliantPercent = answeredQuestions > 0 
      ? Math.round((compliantAnswers/answeredQuestions)*100) 
      : 0;
    // Calculate percentages of total for progress bar segments
    const nonCompliantAnswers = answeredQuestions - compliantAnswers;
    this.compliantPercent = totalQuestions > 0 ? Math.round((compliantAnswers / totalQuestions) * 100) : 0;
    this.nonCompliantPercent = totalQuestions > 0 ? Math.round((nonCompliantAnswers / totalQuestions) * 100) : 0;
  }

  finishAndLeave() {
    this.selfInspectionsService.finishSelfInspection(this.inspection, this.selfInspection).then(() => {
      this.routeBack();
    });
  }

  saveAndLeave() {
    this.selfInspectionsService.saveSelfInspection(this.inspection, this.selfInspection).then(() => {
      this.routeBack();
    });
  }

  deleteSelfInspectionInspection() {
    let dialog = this.dialog.open(DeleteInspectionDialog);
    dialog.afterClosed().subscribe(bDelete => {
      if (bDelete) {
        this.selfInspectionsService.deleteSelfInspectionInspection(this.inspection, this.selfInspection).then(() => {
          this.routeBack();
        })
        .catch(error => {
          let snackbar = this.snackbar.open("error deleting Self Inspection...", null, {
            duration: 3000
          });
          console.log(error);
        });
      }
    })
  }

  routeBack() {
    this.subscription.unsubscribe();
    this.router.navigate([`/account/self-inspections/${this.selfInspection.id}`]);
  }

  answerQuestion(value) {
    this.aCategory.questions.find(question => question == this.aQuestion).answer = value;
    let unanswered: boolean = false;
    this.aCategory.questions.forEach(aquestion => {
      if (aquestion.answer == undefined) unanswered = true;
    });
    if (!unanswered) this.aCategory.finished = true; 
    this.getCount();
  }

  clearAnswer() {
    if (this.aQuestion) {
      this.aQuestion.answer = undefined;
      this.aCategory.finished = false;
      this.getCount();
    }
  }

  isCompliant(question: Question): boolean {
    if (question.answer === undefined) return false;
    const expectedAnswer = question.expectedAnswer === false ? false : true;
    return question.answer === expectedAnswer;
  }

  isNonCompliant(question: Question): boolean {
    if (question.answer === undefined) return false;
    const expectedAnswer = question.expectedAnswer === false ? false : true;
    return question.answer !== expectedAnswer;
  }

  selectQuestion(question) {
    this.aQuestion = question;
    this.aCategory = this.inspection.categories.find(category =>  category.questions.find(aquestion => aquestion == question) == question)
    this.aCategory.show = true;
  }

  nextQuestion() {
    let catLength = this.inspection.categories.length - 1;
    let curCatIndex = this.inspection.categories.indexOf(this.aCategory);
    let qLength = this.aCategory.questions.length - 1;
    let curQIndex = this.aCategory.questions.indexOf(this.aQuestion);
    if (curQIndex < qLength) { // go next question
      this.aQuestion = this.aCategory.questions[curQIndex + 1];
    } else if (curQIndex == qLength) { // next sub
      if (curCatIndex < catLength) { // next sub
        this.aCategory.show = false;
        this.aCategory = this.inspection.categories[curCatIndex + 1];
        this.aCategory.show = true;
        this.aQuestion = this.aCategory.questions[0];
      } else if (curCatIndex == catLength) { 
        this.aCategory.show = false;
        this.aCategory = this.inspection.categories[0];
        this.aCategory.show = true;
        this.aQuestion = this.aCategory.questions[0];
      } else {
        return;
      }
    } else {
      return;
    }
    this.selfInspectionsService.saveSelfInspection(this.inspection, this.selfInspection);
  }

  uploadImage(): void { // this will call the file input from our custom button
    document.getElementById('questionImage').click();
  }

  async uploadQuestionImage(event) {
    this.loading = true;
    const file = event.target.files[0];
    if (!file) {
      this.loading = false;
      return;
    }
    const date = new Date().getTime();
    const filePath = `team/${this.accountService.aTeam.id}/self-inspections/${date}`;
    const storageRef = ref(this.storage, filePath);
    try {
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      if (!this.aQuestion.images) this.aQuestion.images = [];
      this.aQuestion.images.push(url);
      this.selfInspectionsService.saveSelfInspection(this.inspection, this.selfInspection);
    } finally {
      this.loading = false;
    }
  }

  removeImage(image) {
    this.aQuestion.images.splice(this.aQuestion.images.indexOf(image),1);
    this.selfInspectionsService.saveSelfInspection(this.inspection, this.selfInspection);
    // remove from storage too
  }

  viewImage(imageUrl: string) {
    this.dialog.open(ImageViewerDialog, {
      data: { imageUrl },
      maxWidth: '90vw',
      maxHeight: '90vh',
      panelClass: 'image-viewer-dialog'
    });
  }
}

@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="image-viewer">
      <button mat-icon-button class="close-btn" (click)="close()">
        <mat-icon>close</mat-icon>
      </button>
      <img [src]="data.imageUrl" alt="Full size image">
    </div>
  `,
  styles: [`
    .image-viewer {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      padding: 0;
    }
    .image-viewer img {
      max-width: 85vw;
      max-height: 85vh;
      object-fit: contain;
    }
    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      color: white;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10;
    }
    .close-btn:hover {
      background: rgba(0, 0, 0, 0.8);
    }
  `]
})
export class ImageViewerDialog {
  constructor(
    public dialogRef: MatDialogRef<ImageViewerDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { imageUrl: string }
  ) {}

  close() {
    this.dialogRef.close();
  }
}