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
  readonly featured: { label: string; description: string; route: string } = {
    label: 'Peel & Deal',
    description: 'Full sales pipeline. Research leads, manage deals, call, and close.',
    route: 'sales-leads'
  };

  readonly sections: SupportSection[] = [
    {
      label: 'Statistics',
      description: 'Team metrics, user counts, and subscription data with CSV export.',
      icon: 'bar_chart',
      route: 'statistics',
      color: 'blue'
    },
    {
      label: 'Resource Library',
      description: 'Upload and manage posters, compliance docs, and safety resources.',
      icon: 'library_books',
      route: 'resource-library',
      color: 'green'
    },
    {
      label: 'Inspection Template',
      description: 'Configure self-inspection categories and questions.',
      icon: 'checklist',
      route: 'inspection-template',
      color: 'purple'
    },
    {
      label: 'Feedback',
      description: 'Review Chimp Chat feedback, sentiment analysis, and user reports.',
      icon: 'feedback',
      route: 'feedback',
      color: 'amber'
    },
    {
      label: 'Outreach',
      description: 'Manage outreach campaigns and lead generation.',
      icon: 'campaign',
      route: 'outreach',
      color: 'red'
    },
    {
      label: 'Consultation Leads',
      description: 'Ingest leads, monitor generated consultations, and resend delivery emails.',
      icon: 'mark_email_read',
      route: 'consultation-leads',
      color: 'teal'
    }
  ];
}
