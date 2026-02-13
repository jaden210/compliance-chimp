import { Routes } from "@angular/router";
import { TrainingComponent } from "./training.component";
import { ArticleComponent } from "./article/article.component";
import { MyContentComponent } from "./my-content/my-content.component";
import { CreateEditArticleComponent } from "./library/create-edit-article/create-edit-article.component";
import { PendingChangesGuard } from "./library/create-edit-article/pending-changes.guard";
import { DashboardComponent } from "./dashboard/dashboard.component";
import { CustomArticleComponent } from "./custom-article/custom-article.component";
import { SmartBuilderComponent } from "./smart-builder/smart-builder.component";
import { InPersonAttendanceComponent } from "./in-person-attendance/in-person-attendance.component";

export const trainingRoutes: Routes = [
  {
    path: "",
    component: TrainingComponent,
    children: [
      { path: "", component: DashboardComponent },
      { path: "smart-builder", component: SmartBuilderComponent },
      { path: "library/:articleId", component: CustomArticleComponent },
      { path: "my-content", component: MyContentComponent },
      { path: "my-content/:article", component: ArticleComponent },
      {
        path: "create-article",
        component: CreateEditArticleComponent,
        canDeactivate: [PendingChangesGuard]
      },
      {
        path: "edit-article",
        component: CreateEditArticleComponent,
        canDeactivate: [PendingChangesGuard]
      },
      { path: "article/:article", component: ArticleComponent },
      { path: "in-person-attendance/:surveyId", component: InPersonAttendanceComponent }
    ]
  }
];
