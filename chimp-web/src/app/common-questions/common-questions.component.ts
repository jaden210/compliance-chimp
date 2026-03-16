import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'common-questions',
  templateUrl: './common-questions.component.html',
  styleUrls: ['./common-questions.component.css'],
  imports: [RouterModule, MatButtonModule, MatIconModule]
})
export class CommonQuestionsComponent implements OnInit, OnDestroy {
  
  // FAQ data for structured data
  private faqs = [
    {
      question: "Is there an annual contract?",
      answer: "No, no contracts, but feel free to use it forever."
    },
    {
      question: "How much does Compliance Chimp cost?",
      answer: "Just $99/month after a 14-day free trial. That includes unlimited team members, all features, and no hidden fees. No credit card required to start."
    },
    {
      question: "How does the free trial work?",
      answer: "Your first 14 days are completely free with no credit card required. You'll have full access to all features during your trial to see how we can help simplify your compliance journey. After your trial ends, you'll be billed $99/month."
    },
    {
      question: "What is OSHA compliance?",
      answer: "OSHA (Occupational Safety and Health Administration) sets and enforces workplace safety standards for most private-sector employers. Compliance Chimp helps you meet OSHA requirements through safety training, self-inspections, incident documentation, and recordkeeping—all in one platform."
    },
    {
      question: "How does Compliance Chimp help with OSHA compliance?",
      answer: "We provide OSHA-aligned safety training, guided self-inspection checklists, incident reporting, and permanent documentation. Trainings go out automatically, inspections get scheduled with reminders, and everything is stored for when OSHA asks for records."
    },
    {
      question: "What OSHA standards apply to my industry?",
      answer: "OSHA standards vary by industry. General industry follows 29 CFR 1910; construction follows 29 CFR 1926. When you sign up, tell us your industry and we'll build a compliance program tailored to the OSHA requirements that apply to your business."
    },
    {
      question: "How many users can join?",
      answer: "There's no limit to team size."
    },
    {
      question: "Do you help with safety policy documentation?",
      answer: "Yes. We provide OSHA-aligned safety training articles and self-inspection checklists. You can assign trainings to your team and track completion. All training records, inspection reports, and incident documentation are stored permanently for OSHA audits."
    },
    {
      question: "How is team training handled?",
      answer: "You assign OSHA safety trainings to your team members. Trainings go out automatically via text and email. We track completion and send reminders until everyone finishes. All training records are stored for audit purposes."
    },
    {
      question: "How does documentation work for OSHA audits?",
      answer: "Every training completion, self-inspection, and incident report is documented with timestamps. When OSHA asks for records, you can pull up your complete compliance history in seconds. Everything is stored in one place."
    },
    {
      question: "What languages is Compliance Chimp offered in?",
      answer: "English today, but Spanish will be available soon."
    },
    {
      question: "Can I cancel at any time?",
      answer: "Yes. There are no contracts."
    },
    {
      question: "Can I see a demo or try this for free?",
      answer: "Yes! You get 14 days free with no credit card required. Just create an account and start using Compliance Chimp immediately. Zero pressure. Zero hassle. Experience all the features and see why teams love us."
    },
    {
      question: "What if I have questions?",
      answer: "Ask away! We watch our support channel with zeal. Email us directly at support@compliancechimp.com."
    }
  ];

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.addFaqStructuredData();
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      const script = this.document.querySelector('script[data-faq-schema]');
      if (script) {
        script.remove();
      }
    }
  }

  private addFaqStructuredData(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Remove any existing FAQ structured data
    const existingScript = this.document.querySelector('script[data-faq-schema]');
    if (existingScript) {
      existingScript.remove();
    }

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": this.faqs.map(faq => ({
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.answer
        }
      }))
    };

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-faq-schema', 'true');
    script.textContent = JSON.stringify(structuredData);
    this.document.head.appendChild(script);
  }
}
