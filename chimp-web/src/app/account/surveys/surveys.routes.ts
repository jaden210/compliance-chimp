import { Routes } from "@angular/router";
import { SurveysComponent } from "./surveys.component";
import { SurveysListComponent } from "./surveys-list/surveys-list.component";
import { SurveysService } from "./surveys.service";

export const surveysRoutes: Routes = [
  {
    path: "",
    component: SurveysComponent,
    children: [
      { path: "", component: SurveysListComponent }
    ]
  }
];
