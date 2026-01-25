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
  }

  private loadPosts(): void {
    this.loading = true;
    this.blogService.getAllPosts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (posts) => {
          this.posts = posts;
          this.filteredPosts = posts;
          this.loading = false;
          this.addBlogListStructuredData(posts);
        },
        error: (error) => {
          console.error('Error loading blog posts:', error);
          this.loading = false;
        }
      });
  }

  onSearch(): void {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredPosts = this.posts;
      return;
    }
    this.filteredPosts = this.posts.filter(post => 
      post.title.toLowerCase().includes(query) ||
      post.category.toLowerCase().includes(query)
    );
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filteredPosts = this.posts;
  }

  private addBlogListStructuredData(posts: BlogPost[]): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Remove any existing blog list structured data
    const existingScript = this.document.querySelector('script[data-blog-list-schema]');
    if (existingScript) {
      existingScript.remove();
    }

    // Create ItemList structured data for blog posts
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "Compliance Chimp Blog",
      "description": "OSHA compliance guides, safety training tips, and industry-specific compliance resources.",
      "url": "https://compliancechimp.com/blog",
      "publisher": {
        "@type": "Organization",
        "name": "Compliance Chimp",
        "logo": {
          "@type": "ImageObject",
          "url": "https://compliancechimp.com/assets/ccLogo.png"
        }
      },
      "blogPost": posts.slice(0, 10).map(post => ({
        "@type": "BlogPosting",
        "headline": post.title,
        "description": post.description,
        "url": `https://compliancechimp.com/blog/${post.slug}`,
        "datePublished": post.publishedDate,
        "author": {
          "@type": "Person",
          "name": post.author || "The Chimp"
        }
      }))
    };

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-blog-list-schema', 'true');
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
}
