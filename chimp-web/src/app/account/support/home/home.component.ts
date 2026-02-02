import { Component, inject } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { SupportService } from '../support.service';
import { InspectionQuestionsComponent } from '../inspection-questions/inspection-questions.component';
import { StatisticsComponent } from '../statistics/statistics.component';
import { ResourceLibraryComponent } from '../resource-library/resource-library.component';

@Component({
  standalone: true,
  selector: 'support-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  imports: [
    MatTabsModule,
    InspectionQuestionsComponent,
    StatisticsComponent,
    ResourceLibraryComponent
  ]
})
export class HomeComponent {
  readonly supportService = inject(SupportService);
}
