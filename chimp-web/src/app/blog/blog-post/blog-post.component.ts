import { Component, OnInit, Inject, PLATFORM_ID } from "@angular/core";
import { CommonModule, isPlatformBrowser, DOCUMENT } from "@angular/common";
import { RouterModule, ActivatedRoute, Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { BlogService, BlogPost } from "../blog.service";
import { SeoService } from "../../shared/seo.service";
import { BlogCtaComponent } from "../blog-cta/blog-cta.component";

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    BlogCtaComponent
  ],
  selector: "app-blog-post",
  templateUrl: "./blog-post.component.html",
  styleUrls: ["./blog-post.component.scss"]
})
export class BlogPostComponent implements OnInit {
  post: BlogPost | undefined;
  renderedContent: string = "";
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private blogService: BlogService,
    private seoService: SeoService,
    @Inject(PLATFORM_ID) private platformId: Object,
    @Inject(DOCUMENT) private document: Document
  ) {}

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get("slug");
    if (slug) {
      this.loading = true;
      try {
        this.post = await this.blogService.getPostBySlug(slug);
        if (this.post) {
          this.renderedContent = this.parseMarkdown(this.post.content);
          // Update SEO meta tags for this blog post
          this.seoService.setCustomSeo({
            title: `${this.post.title} | Compliance Chimp Blog`,
            description: this.post.description,
            keywords: this.post.keywords?.join(', ') || `${this.post.category}, ${this.post.industry || ''}, OSHA compliance, safety training`,
            url: `https://compliancechimp.com/blog/${this.post.slug}`,
            type: 'article',
            image: this.post.heroImage
          });
          // Add Article structured data
          this.addArticleStructuredData(this.post);
        } else {
          this.router.navigate(["/blog"]);
        }
      } catch (error) {
        console.error('Error loading blog post:', error);
        this.router.navigate(["/blog"]);
      } finally {
        this.loading = false;
      }
    }
  }

  private addArticleStructuredData(post: BlogPost): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Remove any existing article structured data
    const existingScript = this.document.querySelector('script[data-blog-post-schema]');
    if (existingScript) {
      existingScript.remove();
    }

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": post.title,
      "description": post.description,
      "datePublished": post.publishedDate,
      "dateModified": post.publishedDate,
      "author": {
        "@type": "Person",
        "name": post.author || "The Chimp",
        "url": "https://compliancechimp.com"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Compliance Chimp",
        "logo": {
          "@type": "ImageObject",
          "url": "https://compliancechimp.com/assets/ccLogo.png"
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `https://compliancechimp.com/blog/${post.slug}`
      },
      "image": post.heroImage || "https://compliancechimp.com/assets/og-image.png",
      "articleSection": post.category,
      "keywords": post.keywords?.join(', ') || `${post.category}, ${post.industry || ''}, OSHA, compliance, safety`
    };

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-blog-post-schema', 'true');
    script.textContent = JSON.stringify(structuredData);
    this.document.head.appendChild(script);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  private parseMarkdown(content: string): string {
    let html = content;

    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Checkmarks (✓)
    html = html.replace(/^✓ (.*)$/gm, '<div class="check-item"><span class="check-icon">✓</span><span>$1</span></div>');

    // Unordered lists
    html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.*)$/gm, '<li>$1</li>');

    // Paragraphs (lines that aren't already wrapped)
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed && 
          !trimmed.startsWith('<h') && 
          !trimmed.startsWith('<ul') && 
          !trimmed.startsWith('<li') && 
          !trimmed.startsWith('<hr') &&
          !trimmed.startsWith('<div class="check')) {
        return `<p>${trimmed}</p>`;
      }
      return line;
    });
    html = processedLines.join('\n');

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
  }
}
