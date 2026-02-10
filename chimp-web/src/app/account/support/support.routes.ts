import { Routes } from "@angular/router";
import { HomeComponent } from "./home/home.component";
import { SupportService } from "./support.service";

export const supportRoutes: Routes = [
  {
    path: "",
    component: HomeComponent,
    providers: [SupportService],
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./dashboard/dashboard.component").then(
            (m) => m.DashboardComponent
          ),
      },
      {
        path: "statistics",
        loadComponent: () =>
          import("./statistics/statistics.component").then(
            (m) => m.StatisticsComponent
          ),
      },
      {
        path: "resource-library",
        loadComponent: () =>
          import("./resource-library/resource-library.component").then(
            (m) => m.ResourceLibraryComponent
          ),
      },
      {
        path: "inspection-template",
        loadComponent: () =>
          import(
            "./inspection-questions/inspection-questions.component"
          ).then((m) => m.InspectionQuestionsComponent),
      },
      {
        path: "feedback",
        loadComponent: () =>
          import("./chimp-feedback/chimp-feedback.component").then(
            (m) => m.ChimpFeedbackComponent
          ),
      },
      {
        path: "outreach",
        loadChildren: () =>
          import("../outreach/outreach.routes").then((m) => m.outreachRoutes),
      },
    ],
  },
];
