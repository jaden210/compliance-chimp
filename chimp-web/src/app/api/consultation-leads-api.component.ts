import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { environment } from '../../environments/environment';
import { renderSimpleMarkdown } from '../shared/simple-markdown.util';
import { SeoService } from '../shared/seo.service';

@Component({
  standalone: true,
  selector: 'app-consultation-leads-api',
  templateUrl: './consultation-leads-api.component.html',
  styleUrls: ['./consultation-leads-api.component.css'],
  imports: [CommonModule, MatButtonModule],
})
export class ConsultationLeadsApiComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly seoService = inject(SeoService);

  loading = true;
  renderedContent = '';
  markdownSourceUrl = '/assets/docs/consultation-leads-api.md';
  endpointUrl = `https://us-central1-${environment.firebaseConfig.projectId}.cloudfunctions.net/submitConsultationLead`;

  ngOnInit(): void {
    this.seoService.setCustomSeo({
      title: 'Consultation Leads API | Compliance Chimp',
      description: 'API documentation for submitting free safety consultation leads into Compliance Chimp.',
      keywords: 'consultation leads API, free safety consultation API, Compliance Chimp API',
      url: 'https://compliancechimp.com/api/consultation-leads',
    });

    this.http
      .get(this.markdownSourceUrl, { responseType: 'text' })
      .subscribe({
        next: (markdown) => {
          const hydrated = markdown.replace(/\{\{CONSULTATION_LEAD_ENDPOINT\}\}/g, this.endpointUrl);
          this.renderedContent = renderSimpleMarkdown(hydrated);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading consultation lead API markdown:', error);
          this.renderedContent =
            '<p>Unable to load the API documentation right now. Please try again shortly.</p>';
          this.loading = false;
        },
      });
  }
}
