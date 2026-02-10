import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { CommonModule, DOCUMENT } from "@angular/common";
import { RouterModule, ActivatedRoute } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
  Firestore,
  doc,
  docData,
} from "@angular/fire/firestore";
import { SeoService } from "../../shared/seo.service";
import { Subscription } from "rxjs";

interface OutreachLP {
  slug: string;
  niche: string;
  region: string;
  hero: { eyebrow: string; headline: string; subheadline: string };
  painHeadline: string;
  painSubheadline: string;
  painPoints: { title: string; description: string }[];
  solutionHeadline: string;
  features: { icon: string; title: string; description: string }[];
  midCta: string;
  faq: { question: string; answer: string }[];
  finalCta: { headline: string; subheadline: string };
  getStartedParams: { industry: string; source: string };
  seoTitle: string;
  seoDescription: string;
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  selector: "app-outreach-lp",
  templateUrl: "./outreach-lp.component.html",
  styleUrls: ["./outreach-lp.component.css"],
})
export class OutreachLandingPageComponent implements OnInit, OnDestroy {
  lp: OutreachLP | null = null;
  loading = true;
  private sub: Subscription;
  private injectedScripts: HTMLScriptElement[] = [];

  constructor(
    private route: ActivatedRoute,
    private db: Firestore,
    private seo: SeoService,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get("slug");
    if (!slug) {
      this.loading = false;
      return;
    }

    this.sub = docData(doc(this.db, `outreach-landing-pages/${slug}`)).subscribe(
      (data: any) => {
        if (data) {
          this.lp = data as OutreachLP;
          this.seo.setCustomSeo({
            title: this.lp.seoTitle || `${this.lp.hero.headline} | Compliance Chimp`,
            description: this.lp.seoDescription || this.lp.hero.subheadline,
            url: `https://compliancechimp.com/lp/o/${slug}`,
          });
          this.injectStructuredData();
        }
        this.loading = false;
      },
      () => {
        this.loading = false;
      }
    );
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
    for (const script of this.injectedScripts) {
      script.remove();
    }
  }

  private injectStructuredData(): void {
    if (!this.lp) return;

    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: this.lp.faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    };

    const script = this.document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(faqSchema);
    this.document.head.appendChild(script);
    this.injectedScripts.push(script);
  }
}
