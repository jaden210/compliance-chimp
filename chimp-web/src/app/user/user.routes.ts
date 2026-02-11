import { Routes } from "@angular/router";
import { UserComponent } from "./user.component";
import { UserPageComponent } from "./user-page/user-page.component";
import { NoUserComponent } from "./no-user/no-user.component";
import { ArticlesComponent } from "./articles/articles.component";
import { ArticleComponent } from "./article/article.component";
import { InjuryReport } from "./injury-report/injury-report.component";
import { SurveyComponent } from "./survey/survey.component";
import { FilesComponent } from "./files/files.component";
import { SurveyHistoryComponent } from "./survey-history/survey-history.component";
import { SurveyReviewComponent } from "./survey-history/survey-review.component";

export const userRoutes: Routes = [
  {
    path: "",
    component: UserComponent,
    children: [
      { path: "", component: UserPageComponent },
      { path: "survey/:surveyId", component: SurveyComponent },
      { path: "survey-history", component: SurveyHistoryComponent },
      { path: "survey-history/:surveyId", component: SurveyReviewComponent },
      { path: "no-user", component: NoUserComponent },
      { path: "no-team", component: NoUserComponent },
      { path: "injury-report", component: InjuryReport },
      { path: "files", component: FilesComponent },
      {
        path: "self-inspections",
        loadChildren: () =>
        import("./self-inspections/self-inspections.routes").then((m) => m.selfInspectionsRoutes),
      },
      { path: "articles", component: ArticlesComponent },
      { path: ":topicId", component: ArticlesComponent },
      { path: "article/:articleId", component: ArticleComponent },
    ]
  }
];
