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
      question: "What is PCI DSS compliance?",
      answer: "PCI DSS (Payment Card Industry Data Security Standard) is a set of security standards designed to ensure that all companies that accept, process, store or transmit credit card information maintain a secure environment. Compliance Chimp helps you understand and meet these requirements without the headache."
    },
    {
      question: "How does Compliance Chimp help with PCI compliance?",
      answer: "We guide you through self-assessment questionnaires, help you create and maintain required policies, collect and store evidence of compliance, track team training, and send reminders so nothing falls through the cracks. Everything is stored in one place for easy access during audits."
    },
    {
      question: "What SAQ (Self-Assessment Questionnaire) do I need?",
      answer: "The SAQ you need depends on how you process card payments. We'll help you determine which questionnaire applies to your business and guide you through completing it step by step."
    },
    {
      question: "How many users can join?",
      answer: "There's no limit to team size."
    },
    {
      question: "Do you help with policy documentation?",
      answer: "Yes. PCI compliance requires specific security policies. We provide templates and guidance to help you create, maintain, and distribute policies to your team, with tracking to show who has reviewed them."
    },
    {
      question: "How is team training handled?",
      answer: "You can assign security awareness training to your team members and track completion. When it's time for annual training refreshers, we'll remind you. All training records are stored for audit purposes."
    },
    {
      question: "How does evidence collection work?",
      answer: "PCI audits require documentation. Compliance Chimp helps you collect and organize evidence of your security controls, policy acknowledgments, training completions, and other compliance activities throughout the year."
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
