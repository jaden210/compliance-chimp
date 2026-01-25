import { Injectable, inject } from "@angular/core";
import { Firestore, collection, collectionData, query, where, limit, getDocs } from "@angular/fire/firestore";
import { Observable, BehaviorSubject, of } from "rxjs";
import { map, catchError, tap } from "rxjs/operators";

export interface BlogPost {
  id?: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  industry?: string;
  industryId?: string;
  publishedDate: string;
  readTime: string;
  heroImage?: string;
  content: string;
  keywords?: string[];
  parentCategory?: string;
  oshaStandards?: string[];
  hazards?: string[];
  generatedAt?: any;
  author?: string;
}

@Injectable({
  providedIn: "root"
})
export class BlogService {
  private firestore = inject(Firestore);
  
  // Cache for posts to avoid repeated Firestore calls
  private postsCache: BlogPost[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  // Observable for reactive updates
  private postsSubject = new BehaviorSubject<BlogPost[]>([]);

  /**
   * Get all blog posts from Firestore, ordered by publishedDate descending.
   * Results are cached for 5 minutes.
   */
  getAllPosts(): Observable<BlogPost[]> {
    const now = Date.now();
    
    // Return cached data if still valid
    if (this.postsCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      return of(this.postsCache);
    }
    
    const blogCollection = collection(this.firestore, 'blog');
    // Simple query without orderBy to avoid index requirements
    // Sorting is done client-side in the map function
    const blogQuery = query(blogCollection);
    
    return collectionData(blogQuery, { idField: 'id' }).pipe(
      map((docs: any[]) => {
        // Map all docs and filter out invalid posts (no title or no slug)
        const posts: BlogPost[] = docs
          .filter(doc => doc.title && doc.slug) // Only include posts with title and slug
          .map(doc => ({
            id: doc.id,
            slug: doc.slug || '',
            title: doc.title || '',
            description: doc.description || '',
            category: doc.category || 'OSHA',
            industry: doc.industry,
            industryId: doc.industryId,
            publishedDate: doc.publishedDate || '',
            readTime: doc.readTime || '5 min read',
            heroImage: doc.heroImage,
            content: doc.content || '',
            keywords: doc.keywords,
            parentCategory: doc.parentCategory,
            oshaStandards: doc.oshaStandards,
            hazards: doc.hazards,
            generatedAt: doc.generatedAt,
            author: doc.author || 'The Chimp'
          }))
          // Sort by publishedDate descending (in case Firestore index isn't set up)
          .sort((a, b) => {
            if (!a.publishedDate) return 1;
            if (!b.publishedDate) return -1;
            return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime();
          });
        
        // Update cache
        this.postsCache = posts;
        this.cacheTimestamp = now;
        this.postsSubject.next(posts);
        
        return posts;
      }),
      catchError(error => {
        console.error('Error fetching blog posts:', error);
        // Return cached data if available, otherwise empty array
        return of(this.postsCache || []);
      })
    );
  }

  /**
   * Get a single blog post by slug.
   * First checks cache, then queries Firestore if not found.
   */
  async getPostBySlug(slug: string): Promise<BlogPost | undefined> {
    // Check cache first
    if (this.postsCache) {
      const cachedPost = this.postsCache.find(post => post.slug === slug);
      if (cachedPost) {
        return cachedPost;
      }
    }
    
    // Query Firestore directly
    try {
      const blogCollection = collection(this.firestore, 'blog');
      const blogQuery = query(blogCollection, where('slug', '==', slug), limit(1));
      const snapshot = await getDocs(blogQuery);
      
      if (snapshot.empty) {
        return undefined;
      }
      
      const doc = snapshot.docs[0];
      const data = doc.data();
      
      return {
        id: doc.id,
        slug: data['slug'] || '',
        title: data['title'] || '',
        description: data['description'] || '',
        category: data['category'] || 'OSHA',
        industry: data['industry'],
        industryId: data['industryId'],
        publishedDate: data['publishedDate'] || '',
        readTime: data['readTime'] || '5 min read',
        heroImage: data['heroImage'],
        content: data['content'] || '',
        keywords: data['keywords'],
        parentCategory: data['parentCategory'],
        oshaStandards: data['oshaStandards'],
        hazards: data['hazards'],
        generatedAt: data['generatedAt'],
        author: data['author'] || 'The Chimp'
      };
    } catch (error) {
      console.error('Error fetching blog post by slug:', error);
      return undefined;
    }
  }

  /**
   * Get posts by category.
   */
  getPostsByCategory(category: string): Observable<BlogPost[]> {
    return this.getAllPosts().pipe(
      map(posts => posts.filter(post => post.category === category))
    );
  }

  /**
   * Get posts by industry.
   */
  getPostsByIndustry(industry: string): Observable<BlogPost[]> {
    return this.getAllPosts().pipe(
      map(posts => posts.filter(post => post.industry === industry))
    );
  }

  /**
   * Get all unique categories from posts.
   */
  getCategories(): Observable<string[]> {
    return this.getAllPosts().pipe(
      map(posts => [...new Set(posts.map(post => post.category))])
    );
  }

  /**
   * Get all unique industries from posts.
   */
  getIndustries(): Observable<string[]> {
    return this.getAllPosts().pipe(
      map(posts => [...new Set(posts.filter(p => p.industry).map(post => post.industry!))])
    );
  }

  /**
   * Force refresh the cache.
   */
  refreshCache(): void {
    this.postsCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Get observable stream of posts (for reactive updates).
   */
  getPostsStream(): Observable<BlogPost[]> {
    return this.postsSubject.asObservable();
  }
}
