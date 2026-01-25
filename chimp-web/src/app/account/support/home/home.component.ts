import { Component, inject, signal } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupportService } from '../support.service';
import { InspectionQuestionsComponent } from '../inspection-questions/inspection-questions.component';
import { HelpComponent } from '../help/help.component';
import { ArticleComponent } from '../help/article/article.component';
import { StatisticsComponent } from '../statistics/statistics.component';
import { Functions, httpsCallable } from '@angular/fire/functions';

@Component({
  selector: 'support-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  imports: [
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    InspectionQuestionsComponent,
    HelpComponent,
    ArticleComponent,
    StatisticsComponent
  ]
})
export class HomeComponent {
  private readonly functions = inject(Functions);
  readonly supportService = inject(SupportService);

  readonly loadingPreview = signal(false);
  readonly previewResult = signal<any>(null);

  previewTemplates(): void {
    this.loadingPreview.set(true);
    this.previewResult.set(null);
    
    const preview = httpsCallable(this.functions, 'previewIndustryTemplates');
    preview({}).then((result: any) => {
      this.loadingPreview.set(false);
      this.previewResult.set(result.data);
    }).catch(error => {
      this.loadingPreview.set(false);
      this.previewResult.set({ error: error.message });
    });
  }
}
