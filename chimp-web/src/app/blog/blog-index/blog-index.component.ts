import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from "@angular/core";
import { CommonModule, isPlatformBrowser, DOCUMENT } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { BlogService, BlogPost } from "../blog.service";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  selector: "app-blog-index",
  templateUrl: "./blog-index.component.html",
  styleUrls: ["./blog-index.component.scss"]
})
export class BlogIndexComponent implements OnInit, OnDestroy {
  posts: BlogPost[] = [];
  filteredPosts: BlogPost[] = [];
  categories: string[] = [];
  activeCategory = '';
  searchQuery = '';
  loading = true;

  private destroy$ = new Subject<void>();

  constructor(
    private blogService: BlogService,
    @Inject(PLATFORM_ID) private platformId: Object,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.loadPosts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Clean up structured data
    if (isPlatformBrowser(this.platformId)) {
      const existingScript = this.document.querySelector('script[data-blog-list-schema]');
      if (existingScript) {
        existingScript.remove();
      }
    }
  }

  private loadPosts(): void {
    this.loading = true;
    this.blogService.getAllPosts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (posts) => {
          this.posts = posts;
          this.filteredPosts = posts;
          this.categories = [...new Set(posts.map(p => p.category).filter(Boolean))].sort();
          this.loading = false;
          this.addBlogListStructuredData(posts);
        },
        error: (error) => {
          console.error('Error loading blog posts:', error);
          this.loading = false;
        }
      });
  }

  filterByCategory(category: string): void {
    if (this.activeCategory === category) {
      // Toggle off — show all
      this.activeCategory = '';
      this.applyFilters();
      return;
    }
    this.activeCategory = category;
    this.applyFilters();
  }

  clearCategory(): void {
    this.activeCategory = '';
    this.applyFilters();
  }

  onSearch(): void {
    this.applyFilters();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilters();
  }

  private applyFilters(): void {
    let results = this.posts;

    // Filter by active category
    if (this.activeCategory) {
      results = results.filter(post => post.category === this.activeCategory);
    }

    // Filter by search query
    const query = this.searchQuery.toLowerCase().trim();
    if (query) {
      results = results.filter(post =>
        post.title.toLowerCase().includes(query) ||
        post.description.toLowerCase().includes(query) ||
        post.category.toLowerCase().includes(query) ||
        (post.industry && post.industry.toLowerCase().includes(query))
      );
    }

    this.filteredPosts = results;
  }

  private addBlogListStructuredData(posts: BlogPost[]): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Remove any existing blog list structured data
    const existingScript = this.document.querySelector('script[data-blog-list-schema]');
    if (existingScript) {
      existingScript.remove();
    }

    // Blog structured data
    const blogSchema: any = {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "Compliance Chimp Blog — OSHA Compliance & Safety Training Resources",
      "description": "Expert guides on OSHA compliance, workplace safety training, hazard prevention, and industry-specific regulations. Helping small businesses stay compliant and avoid costly fines.",
      "url": "https://compliancechimp.com/blog",
      "inLanguage": "en-US",
      "publisher": {
        "@type": "Organization",
        "name": "Compliance Chimp",
        "url": "https://compliancechimp.com",
        "logo": {
          "@type": "ImageObject",
          "url": "https://compliancechimp.com/assets/ccLogo.png"
        }
      },
      "blogPost": posts.slice(0, 20).map(post => ({
        "@type": "BlogPosting",
        "headline": post.title,
        "description": post.description,
        "url": `https://compliancechimp.com/blog/${post.slug}`,
        "datePublished": post.publishedDate,
        "author": {
          "@type": "Person",
          "name": post.author || "The Chimp"
        },
        "keywords": post.keywords?.join(', ') || post.category
      }))
    };

    // CollectionPage structured data for the index
    const collectionSchema: any = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "OSHA Compliance & Safety Training Blog",
      "description": "Browse expert articles on OSHA regulations, workplace safety, compliance training, and industry-specific hazard prevention.",
      "url": "https://compliancechimp.com/blog",
      "isPartOf": {
        "@type": "WebSite",
        "name": "Compliance Chimp",
        "url": "https://compliancechimp.com"
      },
      "breadcrumb": {
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
          }
        ]
      }
    };

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-blog-list-schema', 'true');
    script.textContent = JSON.stringify([blogSchema, collectionSchema]);
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
}
