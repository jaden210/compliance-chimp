import { Routes } from "@angular/router";
import { TrainingComponent } from "./training.component";
import { IndustriesComponent } from "./industries/industries.component";
import { TopicsComponent } from "./topics/topics.component";
import { ArticlesComponent } from "./articles/articles.component";
import { ArticleComponent } from "./article/article.component";
import { MyContentComponent } from "./my-content/my-content.component";
import { TrainingService } from "./training.service";
import { CreateEditArticleComponent } from "./library/create-edit-article/create-edit-article.component";
import { PendingChangesGuard } from "./library/create-edit-article/pending-changes.guard";
import { DashboardComponent } from "./dashboard/dashboard.component";
import { LibraryComponent } from "./library/library.component";
import { CustomArticleComponent } from "./custom-article/custom-article.component";

export const trainingRoutes: Routes = [
  {
    path: "",
    component: TrainingComponent,
    children: [
      { path: "", component: DashboardComponent },
      { path: "library", component: LibraryComponent },
      { path: "library/:articleId", component: CustomArticleComponent },
      { path: "my-content", component: MyContentComponent },
      { path: "my-content/:article", component: ArticleComponent },
      { path: "industries", component: IndustriesComponent },
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
      { path: ":industry", component: TopicsComponent },
      { path: ":industry/:topic", component: ArticlesComponent },
      { path: ":industry/:topic/:article", component: ArticleComponent }
    ]
  }
];
