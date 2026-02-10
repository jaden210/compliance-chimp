import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from "@angular/core";
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
export class BlogPostComponent implements OnInit, OnDestroy {
  post: BlogPost | undefined;
  renderedContent: string = "";
  relatedPosts: BlogPost[] = [];
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

          // Set article-specific OG meta tags
          this.setArticleMetaTags(this.post);

          // Add Article + BreadcrumbList structured data
          this.addStructuredData(this.post);

          // Load related posts for internal linking
          this.loadRelatedPosts(this.post);
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

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Clean up structured data scripts
      const articleScript = this.document.querySelector('script[data-blog-post-schema]');
      if (articleScript) articleScript.remove();

      // Clean up article-specific meta tags
      this.removeMetaProperty('article:published_time');
      this.removeMetaProperty('article:author');
      this.removeMetaProperty('article:section');
      this.removeMetaProperty('article:tag');
    }
  }

  private setArticleMetaTags(post: BlogPost): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // article:published_time — critical for freshness signals
    this.setMetaProperty('article:published_time', post.publishedDate);

    // article:author
    this.setMetaProperty('article:author', post.author || 'The Chimp');

    // article:section (maps to category)
    this.setMetaProperty('article:section', post.category);

    // article:tag — one per keyword
    if (post.keywords && post.keywords.length > 0) {
      // Remove any existing article:tag tags first
      const existing = this.document.querySelectorAll('meta[property="article:tag"]');
      existing.forEach(el => el.remove());

      post.keywords.slice(0, 5).forEach(keyword => {
        const meta = this.document.createElement('meta');
        meta.setAttribute('property', 'article:tag');
        meta.setAttribute('content', keyword);
        this.document.head.appendChild(meta);
      });
    }
  }

  private setMetaProperty(property: string, content: string): void {
    let meta = this.document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
    if (!meta) {
      meta = this.document.createElement('meta');
      meta.setAttribute('property', property);
      this.document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  }

  private removeMetaProperty(property: string): void {
    const metas = this.document.querySelectorAll(`meta[property="${property}"]`);
    metas.forEach(el => el.remove());
  }

  private loadRelatedPosts(currentPost: BlogPost): void {
    this.blogService.getAllPosts().subscribe(posts => {
      // Score each post by relevance to current post
      const scored = posts
        .filter(p => p.slug !== currentPost.slug)
        .map(p => {
          let score = 0;
          // Same category = strong match
          if (p.category === currentPost.category) score += 3;
          // Same industry = strong match
          if (p.industry && p.industry === currentPost.industry) score += 3;
          // Overlapping keywords
          if (p.keywords && currentPost.keywords) {
            const overlap = p.keywords.filter(k => currentPost.keywords!.includes(k));
            score += overlap.length;
          }
          // Same parent category
          if (p.parentCategory && p.parentCategory === currentPost.parentCategory) score += 1;
          return { post: p, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      this.relatedPosts = scored.slice(0, 3).map(item => item.post);

      // If we didn't find enough related posts, fill with recent posts
      if (this.relatedPosts.length < 3) {
        const existingSlugs = new Set(this.relatedPosts.map(p => p.slug));
        const fillers = posts
          .filter(p => p.slug !== currentPost.slug && !existingSlugs.has(p.slug))
          .slice(0, 3 - this.relatedPosts.length);
        this.relatedPosts = [...this.relatedPosts, ...fillers];
      }
    });
  }

  private addStructuredData(post: BlogPost): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Remove any existing article structured data
    const existingScript = this.document.querySelector('script[data-blog-post-schema]');
    if (existingScript) {
      existingScript.remove();
    }

    const wordCount = post.content ? post.content.split(/\s+/).length : 0;

    const articleSchema: any = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": post.title,
      "description": post.description,
      "datePublished": post.publishedDate,
      "dateModified": post.publishedDate,
      "wordCount": wordCount,
      "author": {
        "@type": "Person",
        "name": post.author || "The Chimp",
        "url": "https://compliancechimp.com"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Compliance Chimp",
        "url": "https://compliancechimp.com",
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
      "keywords": post.keywords?.join(', ') || `${post.category}, ${post.industry || ''}, OSHA, compliance, safety`,
      "inLanguage": "en-US",
      "isPartOf": {
        "@type": "Blog",
        "name": "Compliance Chimp Blog",
        "url": "https://compliancechimp.com/blog"
      }
    };

    // Add industry if available
    if (post.industry) {
      articleSchema["about"] = {
        "@type": "Thing",
        "name": post.industry
      };
    }

    // BreadcrumbList structured data
    const breadcrumbSchema: any = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://compliancechimp.com"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Blog",
          "item": "https://compliancechimp.com/blog"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": post.title,
          "item": `https://compliancechimp.com/blog/${post.slug}`
        }
      ]
    };

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-blog-post-schema', 'true');
    script.textContent = JSON.stringify([articleSchema, breadcrumbSchema]);
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

    // Headers — h1 in markdown becomes h2 in rendered output
    // to preserve the single page <h1> for SEO
    html = html.replace(/^### (.*$)/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.*$)/gm, '<h2>$1</h2>');

    // Bold and italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Links — add rel attributes for external links, keep internal links clean
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
      const isExternal = url.startsWith('http') && !url.includes('compliancechimp.com');
      if (isExternal) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return `<a href="${url}">${text}</a>`;
    });

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
