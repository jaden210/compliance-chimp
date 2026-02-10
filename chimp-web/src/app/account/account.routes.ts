import { Routes } from "@angular/router";
import { AccountComponent } from "./account.component";
import { HomeComponent } from "./home/home.component";
import { TeamComponent } from "./team/team.component";
import { SurveyComponent } from "./survey/survey.component";
import { ProfileComponent } from "./account/account.component";
import { EventComponent } from "./event/event.component";
import { FilesComponent } from "./files/files.component";
import { AuthGuard } from "./auth.gaurd";

export const accountRoutes: Routes = [
  {
    path: "",
    component: AccountComponent,
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      { path: "dashboard", component: HomeComponent },
      { path: "team", component: TeamComponent },
      { path: "survey/:surveyId", component: SurveyComponent },
      {
        path: "training",
        loadChildren: () =>
        import("./training/training.routes").then((m) => m.trainingRoutes),
      },
      { path: "account", component: ProfileComponent },
      { path: "event", component: EventComponent },
      {
        path: "incident-reports",
        loadChildren: () =>
        import("./incident-reports/incident-reports.routes").then((m) => m.incidentReportsRoutes),
      },
      { path: "files", component: FilesComponent },
      {
        path: "support",
        loadChildren: () =>
        import("./support/support.routes").then((m) => m.supportRoutes),
        canActivate:  [AuthGuard]
      },
      {
        path: "surveys",
        loadChildren: () =>
        import("./surveys/surveys.routes").then((m) => m.surveysRoutes),
      },
      {
        path: "self-inspections",
        loadChildren: () =>
        import("./self-inspections/self-inspections.routes").then((m) => m.selfInspectionsRoutes),
      },
      {
        path: "outreach",
        redirectTo: "support/outreach",
        pathMatch: "full",
      },
      { path: "**", redirectTo: "dashboard" }
    ]
  }
];
