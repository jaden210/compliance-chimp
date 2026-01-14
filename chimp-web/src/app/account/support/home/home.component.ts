import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { SupportService } from '../support.service';
import { WebSupportComponent } from '../web-support/web-support.component';
import { FeedbackComponent } from '../feedback/feedback.component';
import { InspectionQuestionsComponent } from '../inspection-questions/inspection-questions.component';
import { BlogsComponent } from '../blogs/view-blogs.component';
import { BlogComponent } from '../blogs/blog/make-blog.component';
import { HelpComponent } from '../help/help.component';
import { ArticleComponent } from '../help/article/article.component';
import { StatisticsComponent } from '../statistics/statistics.component';

@Component({
  standalone: true,
  selector: 'support-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  imports: [
    CommonModule,
    RouterModule,
    MatTabsModule,
    WebSupportComponent,
    FeedbackComponent,
    InspectionQuestionsComponent,
    BlogsComponent,
    BlogComponent,
    HelpComponent,
    ArticleComponent,
    StatisticsComponent
  ]
})
export class HomeComponent {

  constructor(public supportService: SupportService) { }

}
