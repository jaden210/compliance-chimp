import { Routes } from "@angular/router";
import { ChallengeComponent } from "./challenge.component";
import { Step1Component } from "./step1/step1.component";
import { Step2Component } from "./step2/step2.component";
import { Step3Component } from "./step3/step3.component";
import { Step4Component } from "./step4/step4.component";
import { CompleteComponent } from "./complete/complete.component";

export const challengeRoutes: Routes = [
  {
    path: "",
    component: ChallengeComponent,
    children: [
      { path: "", redirectTo: "step1", pathMatch: "full" },
      { path: "step1", component: Step1Component },
      { path: "step2", component: Step2Component },
      { path: "step3", component: Step3Component },
      { path: "step4", component: Step4Component },
      { path: "complete", component: CompleteComponent }
    ]
  }
];
