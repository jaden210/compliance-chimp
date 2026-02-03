import { Component, inject, DestroyRef } from "@angular/core";
import { CommonModule, DatePipe, Location } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router, ActivatedRoute, ParamMap } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SelfInspectionsService, Question, Categories, SelfInspection, Inspection } from "../self-inspections.service";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatMenuModule } from "@angular/material/menu";
import { MatListModule } from "@angular/material/list";
import { TextFieldModule } from "@angular/cdk/text-field";
import { UserService } from "../../user.service";
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
    MatProgressSpinnerModule,
    MatMenuModule,
    MatListModule,
    TextFieldModule
  ],
  providers: [DatePipe]
})
export class TakeSelfInspectionComponent {
  private readonly userService = inject(UserService);
  readonly selfInspectionsService = inject(SelfInspectionsService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly location = inject(Location);
  readonly dialog = inject(MatDialog);
  private readonly storage = inject(Storage);
  private readonly destroyRef = inject(DestroyRef);

  selfInspection: SelfInspection = new SelfInspection();
  inspection: Inspection = new Inspection();
  aCategory: Categories;
  aQuestion: Question = new Question();
  count: string;
  loading: boolean = false;
  showCategories: boolean = false;

  constructor() {
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team) {
          this.route.paramMap
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((params: ParamMap) => {
              const selfInspectionId = params.get("selfInspectionId");
              const inspectionId = params.get("inspectionId");
              this.selfInspectionsService.getSelfInspection(selfInspectionId, team.id)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(si => this.selfInspection = si);
              this.selfInspectionsService.getSelfInspectionInspection(selfInspectionId, inspectionId, team.id)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(inspection => {
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
        if (question.answer !== undefined) answeredQuestions++;
        if (question.answer === true) compliantAnswers++;
        totalQuestions++;
      });
    });
    this.count = answeredQuestions + '/' + totalQuestions;
    this.inspection.completedPercent = Math.round((answeredQuestions / totalQuestions) * 100);
    this.inspection.compliantPercent = Math.round((compliantAnswers / totalQuestions) * 100);
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

  routeBack() {
    this.router.navigate([`/user/self-inspections/${this.selfInspection.id}`]);
  }

  answerQuestion(value: boolean) {
    const question = this.aCategory.questions.find(q => q === this.aQuestion);
    if (question) question.answer = value;
    let unanswered = false;
    this.aCategory.questions.forEach(q => {
      if (q.answer === undefined) unanswered = true;
    });
    if (!unanswered) this.aCategory.finished = true;
    this.getCount();
  }

  selectQuestion(question: Question) {
    this.aQuestion = question;
    this.aCategory = this.inspection.categories.find(category =>
      category.questions.find(q => q === question) === question
    );
    this.aCategory.show = true;
  }

  toggleCategory(category: Categories) {
    if (this.aCategory?.subject === category.subject) {
      category.show = !category.show;
    } else {
      this.inspection.categories.forEach(c => c.show = false);
      category.show = true;
      this.aCategory = category;
      this.aQuestion = category.questions[0];
    }
  }

  nextQuestion() {
    const catLength = this.inspection.categories.length - 1;
    const curCatIndex = this.inspection.categories.indexOf(this.aCategory);
    const qLength = this.aCategory.questions.length - 1;
    const curQIndex = this.aCategory.questions.indexOf(this.aQuestion);

    if (curQIndex < qLength) {
      this.aQuestion = this.aCategory.questions[curQIndex + 1];
    } else if (curQIndex === qLength) {
      if (curCatIndex < catLength) {
        this.aCategory.show = false;
        this.aCategory = this.inspection.categories[curCatIndex + 1];
        this.aCategory.show = true;
        this.aQuestion = this.aCategory.questions[0];
      } else if (curCatIndex === catLength) {
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

  uploadImage(): void {
    document.getElementById('questionImage')?.click();
  }

  async uploadQuestionImage(event: Event) {
    this.loading = true;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.loading = false;
      return;
    }
    const date = new Date().getTime();
    const filePath = `team/${this.userService.aTeam.id}/self-inspections/${date}`;
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

  removeImage(image: string) {
    this.aQuestion.images.splice(this.aQuestion.images.indexOf(image), 1);
    this.selfInspectionsService.saveSelfInspection(this.inspection, this.selfInspection);
  }
}
