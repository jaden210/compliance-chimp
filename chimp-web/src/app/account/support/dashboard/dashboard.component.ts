import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface SupportSection {
  label: string;
  description: string;
  icon: string;
  route: string;
  color: string;
}

@Component({
  standalone: true,
  selector: 'support-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  imports: [RouterModule, MatIconModule]
})
export class DashboardComponent {
  readonly sections: SupportSection[] = [
    {
      label: 'Statistics',
      description: 'Team metrics, user counts, and subscription data with CSV export.',
      icon: 'bar_chart',
      route: '../statistics',
      color: 'primary'
    },
    {
      label: 'Resource Library',
      description: 'Upload and manage posters, compliance docs, and safety resources.',
      icon: 'library_books',
      route: '../resource-library',
      color: 'tertiary'
    },
    {
      label: 'Inspection Template',
      description: 'Configure self-inspection categories and questions.',
      icon: 'checklist',
      route: '../inspection-template',
      color: 'secondary'
    },
    {
      label: 'Feedback',
      description: 'Review Chimp Chat feedback, sentiment analysis, and user reports.',
      icon: 'feedback',
      route: '../feedback',
      color: 'accent'
    },
    {
      label: 'Outreach',
      description: 'Manage outreach campaigns and lead generation.',
      icon: 'campaign',
      route: '../outreach',
      color: 'warm'
    }
  ];
}
