import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { SelfInspectionsService, ExperationTimeFrame, SelfInspection } from "../self-inspections.service";
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
import { Router, ActivatedRoute, ParamMap } from "@angular/router";
import { Location } from "@angular/common";
import { Subscription } from "rxjs";
import { AccountService } from "../../account.service";

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
    MatTooltipModule
  ]
})
export class CreateEditSelfInspectionComponent {

  subscription: Subscription;
  selfInspection: SelfInspection = new SelfInspection();
  newQuestionText: string; // template variable

  constructor(
    public router: Router,
    public route: ActivatedRoute,
    private accountService: AccountService,
    public selfInspectionService: SelfInspectionsService,
    public snackbar: MatSnackBar,
    private location: Location
  ) {
    this.subscription = this.accountService.aTeamObservable.subscribe(team => {
      if (team) {
        this.route.paramMap.subscribe((params: ParamMap) => {
          let selfInspectionId = params.get("selfInspectionId");
          if (selfInspectionId) { //edit
            this.selfInspectionService.getSelfInspection(selfInspectionId).subscribe(selfInspection => {
              this.selfInspection = selfInspection;
              this.selfInspectionService.setSelfInspectionWithTemplate(selfInspection);
            });
          } else { //create
            this.selfInspectionService.setSelfInspectionWithTemplate(this.selfInspection);
          }
        });
      }
    })
  }

  leave(snapshot) {
    this.subscription.unsubscribe();
    this.router.navigate([`/account/self-inspections/${this.selfInspection.id || snapshot.id}`]);
  }
  
  cancel() {
    this.subscription.unsubscribe();
    this.router.navigate([`/account/self-inspections`]);
  }

  saveOrCreate() {
    this.selfInspectionService.saveOrCreateNewSelfInspection(this.selfInspection).then(snapshot => {
      this.leave(snapshot);
    })
    .catch(error => {
      let snackbar = this.snackbar.open("error creating Inspection...", null, {
        duration: 3000
      });
      console.log(error);
    });
  }

  getLength(q): number { // could be better
    if (q) {
      let i = 0;
      q.forEach(q => {
        q.selected ? i ++ : null;
      });
      return i;
    }
    return 0;
  }

  addQuestion(index): void {
    this.selfInspection.baseQuestions[index].questions.push({
      name: this.newQuestionText,
      selected: true
    });
    this.newQuestionText = '';
  }

  public toggleExpectedAnswer(question): void {
    // Toggle between true (Yes is compliant) and false (No is compliant)
    // Default is true (undefined treated as true)
    question.expectedAnswer = question.expectedAnswer === false ? true : false;
  }

  public get timeFrame(): string[] {
    return Object.keys(ExperationTimeFrame).map(key => ExperationTimeFrame[key]);
  }
}
