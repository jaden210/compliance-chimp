import { Routes } from "@angular/router";
import { GetStartedComponent } from "./get-started.component";
import { Step1Component } from "./step1/step1.component";
import { Step2Component } from "./step2/step2.component";
import { Step3Component } from "./step3/step3.component";

export const getStartedRoutes: Routes = [
  {
    path: "",
    component: GetStartedComponent,
    children: [
      { path: "", redirectTo: "step1", pathMatch: "full" },
      { path: "step1", component: Step1Component },
      { path: "step2", component: Step2Component },
      { path: "step3", component: Step3Component }
    ]
  }
];
