import { Component, OnInit, OnDestroy, Input } from "@angular/core";
import { getTagColor } from "../../../shared/tag-colors";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { TrainingService, LibraryItem, OSHAArticle, TrainingCadence } from "../training.service";
import { AccountService } from "../../account.service";
import { BehaviorSubject, Observable, combineLatest, of, Subscription } from "rxjs";
import { filter, map, shareReplay, switchMap, take } from "rxjs/operators";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSidenavModule } from "@angular/material/sidenav";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatSelectModule } from "@angular/material/select";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { HelpDialog } from "../help.dialog";
import { BlasterDialog } from "src/app/blaster/blaster.component";
import { CreateEditArticleComponent } from "./create-edit-article/create-edit-article.component";
import { VoiceArticleDialog } from "./create-edit-article/voice-article-dialog/voice-article-dialog.component";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { TagInputComponent } from "../../team/tag-input/tag-input.component";

export type LibraryTab = 'myLibrary' | 'osha';
export type SortColumn = 'name' | 'industry' | 'topic' | null;
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface LibraryItemWithStatus extends LibraryItem {
  isInLibrary?: boolean;
}

@Component({
  standalone: true,
  selector: "app-library",
  templateUrl: "./library.component.html",
  styleUrls: ["./library.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSidenavModule,
    MatSnackBarModule,
    MatCheckboxModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    CreateEditArticleComponent,
    TagInputComponent
  ],
  providers: [DatePipe]
})
export class LibraryComponent implements OnInit, OnDestroy {
  // Input to hide toolbar when embedded in dashboard
  @Input() embedded: boolean = false;

  // Observable streams
  library$: Observable<LibraryItem[]>;
  oshaArticles$: Observable<OSHAArticle[]>;
  filteredContent$: Observable<(LibraryItem | OSHAArticle)[]>;
  
  // UI state
  activeTab$ = new BehaviorSubject<LibraryTab>('myLibrary');
  searchTerm$ = new BehaviorSubject<string>('');
  sort$ = new BehaviorSubject<SortState>({ column: null, direction: 'asc' });
  
  // Selected article for detail view
  selectedArticle: LibraryItem | OSHAArticle | null = null;
  customArticle = false;
  
  // Training cadence options
  cadenceOptions = [
    { value: TrainingCadence.Once, label: 'Once (one-time training)' },
    { value: TrainingCadence.Monthly, label: 'Monthly' },
    { value: TrainingCadence.Quarterly, label: 'Quarterly' },
    { value: TrainingCadence.SemiAnnually, label: 'Semi-Annually' },
    { value: TrainingCadence.Annually, label: 'Annually' }
  ];
  
  // Multi-select state
  selectedItems = new Set<string>();
  selectionMode = false;
  processingBulkAction = false;
  
  // Template application state
  applyingTemplates = false;
  showTemplateOffer = false;
  industryArticleCount: number | null = null;
  loadingArticleCount = false;
  
  // Industry suggestions state
  loadingSuggestions = false;
  suggestedArticles: { id: string; name: string }[] = [];
  showSuggestions = false;
  
  // Get all unique tags from team members for autocomplete
  get allTags(): string[] {
    return this.trainingService.getAllTags(this.accountService.teamMembers || []);
  }
  
  private teamSubscription: Subscription;
  private libraryItemsCache: LibraryItem[] = [];
  private currentFilteredContent: (LibraryItem | OSHAArticle)[] = [];

  constructor(
    private trainingService: TrainingService,
    public accountService: AccountService,
    private dialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private functions: Functions,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.accountService.showLD = true;
    this.accountService.helper = this.accountService.helperProfiles.training;
    
    this.library$ = this.accountService.aTeamObservable.pipe(
      filter(team => !!team),
      switchMap(team => this.trainingService.getLibrary(team.id)),
      map(library => library.sort((a: LibraryItem, b: LibraryItem) => 
        (a.topic || 'na').localeCompare(b.topic) || a.name.localeCompare(b.name)
      )),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // Cache library items for isInLibrary checks
    // Also check if library is empty to show template offer
    this.teamSubscription = this.library$.subscribe(items => {
      this.libraryItemsCache = items;
      
      // Show template offer if library is empty and user hasn't dismissed it
      const hideOffer = localStorage.getItem('hideTemplateOffer') === 'true';
      if (items.length === 0 && !hideOffer && this.accountService.aTeam?.industries?.length > 0) {
        this.showTemplateOffer = true;
        this.loadIndustryArticleCount();
      }
    });


    this.oshaArticles$ = this.trainingService.getOshaContent().pipe(
      map((data) => {
        return data[0].map((article: any) => {
          const art = new OSHAArticle();
          art.content = article.content;
          art.name = article.name;
          art.contentEs = article.contentEs;
          art.id = article.id;
          const topic = data[1].find((t: any) => t.id === article.topicId) || {};
          const industry = data[2].find((ind: any) => ind.id === topic.industryId) || {};
          art.topic = topic.name;
          art.topicId = topic.id;
          art.industry = industry.name;
          art.industryId = industry.id;
          art.thumbnail = topic.imageUrl || '/assets/chimpTop.png';
          return art;
        }).sort((a: OSHAArticle, b: OSHAArticle) => 
            (a.industry || 'na').localeCompare(b.industry) || 
            (a.topic || 'na').localeCompare(b.topic) || 
            a.name.localeCompare(b.name)
          );
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // Filtered content based on active tab and search
    this.filteredContent$ = combineLatest([
      this.activeTab$,
      this.library$,
      this.oshaArticles$,
      this.searchTerm$,
      this.sort$
    ]).pipe(
      map(([tab, library, osha, search, sort]) => {
        let content: (LibraryItem | OSHAArticle)[] = [];
        
        switch (tab) {
          case 'myLibrary':
            content = library;
            break;
          case 'osha':
            content = osha;
            break;
        }

        // Apply search filter
        if (search.trim()) {
          content = this.applySearch(content, search);
        }

        // Apply sort
        if (sort.column) {
          content = this.applySort(content, sort);
        }

        // Cache for selection operations
        this.currentFilteredContent = content;

        return content;
      })
    );

    // Check for smartBuilder query parameter - redirect to dedicated route
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      if (params['smartBuilder'] === 'true') {
        this.router.navigate(['/account/training/smart-builder']);
      }
    });
  }

  /**
   * Navigate to the Smart Builder page for AI-powered article generation
   */
  openSmartBuilder(): void {
    this.router.navigate(['/account/training/smart-builder']);
  }

  /**
   * @deprecated Use openSmartBuilder() instead - navigates to dedicated route
   */
  private openSmartBuilderDialog(): void {
    const dialogRef = this.dialog.open(VoiceArticleDialog, {
      width: '520px',
      data: {
        industry: this.accountService.aTeam?.industry
      }
    });

    dialogRef.afterClosed().subscribe((result: { title: string; content: string } | undefined) => {
      if (result?.title && result?.content) {
        // Create a new library item with the generated content
        const newItem = new LibraryItem();
        newItem.name = result.title;
        newItem.content = result.content;
        newItem.industry = this.accountService.aTeam?.industry || 'General';
        newItem.topic = 'Written by the Chimp';
        newItem.teamId = this.accountService.aTeam.id;
        newItem.addedBy = this.accountService.user?.id || '';
        newItem.trainingCadence = TrainingCadence.Annually;
        newItem.scheduledDueDate = this.trainingService.calculateOptimalScheduledDate(
          newItem.trainingCadence,
          this.libraryItemsCache
        );

        // Save to library
        this.trainingService.addToLibrary(newItem).then(id => {
          newItem.id = id;
          this.libraryItemsCache.push(newItem);
          this.snackBar.open('Training article created!', 'Close', { duration: 3000 });
          
          // Open the article for editing/review
          this.createCustomArticle(newItem);
        }).catch(error => {
          console.error('Error saving article:', error);
          this.snackBar.open('Failed to save article', 'Close', { duration: 3000 });
        });
      }
    });
  }

  private applySearch(content: (LibraryItem | OSHAArticle)[], search: string): (LibraryItem | OSHAArticle)[] {
    const terms = search.toLowerCase().trim().split(' ');
    return content.filter(item => {
      const name = item.name.toLowerCase();
      const industry = (item.industry || '').toLowerCase();
      const topic = (item.topic || '').toLowerCase();
      const itemContent = ('content' in item ? item.content || '' : '').toLowerCase();
      // Include assigned tags in search
      const tags = ('assignedTags' in item ? (item.assignedTags || []).join(' ') : '').toLowerCase();
      
      let score = 0;
      terms.forEach(term => {
        if (name.includes(term)) score += 4;
        if (industry.includes(term)) score += 2;
        if (topic.includes(term)) score += 2;
        if (tags.includes(term)) score += 3; // Tags are important for search
        if (itemContent.includes(term)) score += 1;
      });
      return score >= terms.length;
    }).sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
  }
  
  // Use shared tag color utility
  getTagColor = getTagColor;

  private applySort(content: (LibraryItem | OSHAArticle)[], sort: SortState): (LibraryItem | OSHAArticle)[] {
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...content].sort((a, b) => {
      switch (sort.column) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'industry':
          return (a.industry || '').localeCompare(b.industry || '') * dir;
        case 'topic':
          return (a.topic || '').localeCompare(b.topic || '') * dir;
        default:
          return 0;
      }
    });
  }

  setTab(tab: LibraryTab) {
    this.activeTab$.next(tab);
    this.selectedArticle = null;
    this.searchTerm$.next('');
    this.clearSelection();
  }

  onSearch(value: string) {
    this.searchTerm$.next(value);
  }

  toggleSort(column: SortColumn) {
    const current = this.sort$.value;
    if (current.column === column) {
      if (current.direction === 'asc') {
        this.sort$.next({ column, direction: 'desc' });
      } else {
        this.sort$.next({ column: null, direction: 'asc' });
      }
    } else {
      this.sort$.next({ column, direction: 'asc' });
    }
  }

  selectArticle(article: LibraryItem | OSHAArticle) {
    if (this.embedded && (article as LibraryItem).id) {
      // When embedded, navigate directly to the article
      this.router.navigate(['/account/training/library', (article as LibraryItem).id]);
    } else {
      this.selectedArticle = article;
    }
  }

  closeArticle() {
    this.selectedArticle = null;
  }

  isInLibrary(articleName: string): boolean {
    return this.libraryItemsCache.some(l => l.name === articleName);
  }

  addToLibrary(article: OSHAArticle | LibraryItem): void {
    const li = new LibraryItem();
    li.addedBy = this.accountService.user.id;
    li.content = article.content;
    li.industry = article.industry || 'Chimp';
    li.topic = article.topic || 'Chat';
    li.name = article.name;
    li.teamId = this.accountService.aTeam.id;
    li.thumbnail = article.thumbnail || null;
    li.trainingCadence = TrainingCadence.Annually;
    
    // Calculate optimal scheduled date based on existing library items
    li.scheduledDueDate = this.trainingService.calculateOptimalScheduledDate(
      li.trainingCadence,
      this.libraryItemsCache
    );
    
    this.trainingService.addToLibrary(li).then((id) => {
      li.id = id;
      this.libraryItemsCache.push(li);
    });
  }

  removeFromLibrary(article: LibraryItem): void {
    this.trainingService.removeFromLibrary(article).then(() => {
      this.libraryItemsCache = this.libraryItemsCache.filter(l => l.id !== article.id);
      this.selectedArticle = null;
    });
  }

  updateCadence(article: LibraryItem, cadence: TrainingCadence): void {
    if (!article.id) return;
    
    // If training hasn't been completed yet, recalculate optimal scheduled date
    // to find a slot that doesn't overlap with other trainings of the same cadence
    let newScheduledDate: Date | undefined;
    if (!article.lastTrainedAt) {
      // Get other library items excluding this one
      const otherItems = this.libraryItemsCache.filter(l => l.id !== article.id);
      newScheduledDate = this.trainingService.calculateOptimalScheduledDate(cadence, otherItems);
    }
    
    const updates: Partial<LibraryItem> = { trainingCadence: cadence };
    if (newScheduledDate) {
      updates.scheduledDueDate = newScheduledDate;
    }
    
    this.trainingService.updateLibraryItem(article.id, updates).then(() => {
      // Update local cache
      const cached = this.libraryItemsCache.find(l => l.id === article.id);
      if (cached) {
        cached.trainingCadence = cadence;
        if (newScheduledDate) {
          cached.scheduledDueDate = newScheduledDate;
        }
      }
      // Update selected article
      if (this.selectedArticle && (this.selectedArticle as LibraryItem).id === article.id) {
        (this.selectedArticle as LibraryItem).trainingCadence = cadence;
        if (newScheduledDate) {
          (this.selectedArticle as LibraryItem).scheduledDueDate = newScheduledDate;
        }
      }
      this.snackBar.open('Training cadence updated', 'Close', { duration: 2000 });
    }).catch(error => {
      console.error('Error updating cadence:', error);
      this.snackBar.open('Error updating cadence', 'Close', { duration: 3000 });
    });
  }

  getCadenceLabel(cadence: TrainingCadence | undefined): string {
    const option = this.cadenceOptions.find(o => o.value === cadence);
    return option ? option.label : 'Annually';
  }

  // Get the team's global auto-start setting - undefined/missing means disabled (grandfather existing teams)
  get teamAutoStartEnabled(): boolean {
    return this.accountService.aTeam?.autoStartTrainings === true;
  }

  // Get the effective auto-start status for an article
  getAutoStartStatus(article: LibraryItem): { enabled: boolean; inherited: boolean; label: string } {
    if (article.autoStart === undefined) {
      return { 
        enabled: this.teamAutoStartEnabled, 
        inherited: true, 
        label: this.teamAutoStartEnabled ? 'On (team setting)' : 'Off (team setting)'
      };
    }
    return { 
      enabled: article.autoStart, 
      inherited: false, 
      label: article.autoStart ? 'On (override)' : 'Off (override)'
    };
  }

  // Update the per-article auto-start setting
  updateAutoStart(article: LibraryItem, value: boolean | 'inherit'): void {
    if (!article.id) return;
    
    const autoStart = value === 'inherit' ? undefined : value;
    this.trainingService.updateLibraryItem(article.id, { autoStart } as any).then(() => {
      // Update local cache
      const cached = this.libraryItemsCache.find(l => l.id === article.id);
      if (cached) {
        cached.autoStart = autoStart;
      }
      // Update selected article
      if (this.selectedArticle && (this.selectedArticle as LibraryItem).id === article.id) {
        (this.selectedArticle as LibraryItem).autoStart = autoStart;
      }
      this.snackBar.open('Auto-start setting updated', 'Close', { duration: 2000 });
    }).catch(error => {
      console.error('Error updating auto-start:', error);
      this.snackBar.open('Error updating auto-start', 'Close', { duration: 3000 });
    });
  }

  updateAssignedTags(article: LibraryItem, tags: string[]): void {
    if (!article.id) return;
    
    this.trainingService.updateLibraryItem(article.id, { assignedTags: tags }).then(() => {
      // Update local cache
      const cached = this.libraryItemsCache.find(l => l.id === article.id);
      if (cached) {
        cached.assignedTags = tags;
      }
      // Update selected article
      if (this.selectedArticle && (this.selectedArticle as LibraryItem).id === article.id) {
        (this.selectedArticle as LibraryItem).assignedTags = tags;
      }
      this.snackBar.open('Assigned tags updated', 'Close', { duration: 2000 });
    }).catch(error => {
      console.error('Error updating assigned tags:', error);
      this.snackBar.open('Error updating assigned tags', 'Close', { duration: 3000 });
    });
  }

  startTraining(): void {
    if (!this.selectedArticle) return;
    this.dialog.open(BlasterDialog, {
      data: {
        libraryItem: this.selectedArticle
      }
    });
  }

  createCustomArticle(article: LibraryItem | null = null): void {
    if (article) {
      // Editing an existing article - use the inline editor
      this.selectedArticle = article;
      this.customArticle = true;
    } else {
      // Creating from scratch - go to Smart Builder
      this.router.navigate(['/account/training/smart-builder'], { queryParams: { mode: 'scratch' } });
    }
  }

  closeCustomArticle(): void {
    this.customArticle = false;
    this.selectedArticle = null;
  }

  routeToHistory(): void {
    this.router.navigate(["account", "training"]);
  }

  help(helpTopic: string): void {
    const helpContent = helpTopic === "library"
      ? `Build your training library by adding OSHA articles that apply to your team. 
         Once articles are in your library, you can start training sessions and track compliance across your team.`
      : `Explore our curated collection of training content. Click on any article to preview it, 
         then add it to your library to make it available for training sessions.`;
    
    this.dialog.open(HelpDialog, {
      data: helpContent,
      maxWidth: "50vw"
    });
  }

  trackByArticleId(index: number, article: LibraryItem | OSHAArticle): string {
    return article.id || article.name || index.toString();
  }

  getTabLabel(tab: LibraryTab): string {
    switch (tab) {
      case 'myLibrary': return 'My Library';
      case 'osha': return 'OSHA Articles';
    }
  }

  /**
   * Load the count of industry articles that would be added to the library.
   */
  loadIndustryArticleCount(): void {
    if (!this.accountService.aTeam?.id || this.loadingArticleCount) return;
    
    this.loadingArticleCount = true;
    
    const getCount = httpsCallable(this.functions, 'getIndustryArticleCount');
    getCount({ teamId: this.accountService.aTeam.id })
      .then((result: any) => {
        this.loadingArticleCount = false;
        if (result.data?.success) {
          this.industryArticleCount = result.data.count;
        }
      })
      .catch(error => {
        this.loadingArticleCount = false;
        console.error('Error getting article count:', error);
      });
  }

  /**
   * Apply industry-specific OSHA article templates to the team's library.
   * This calls a Cloud Function that looks up articles based on the team's
   * selected industries and adds them to their library.
   */
  applyIndustryTemplates(): void {
    if (this.applyingTemplates || !this.accountService.aTeam?.id) return;
    
    this.applyingTemplates = true;
    
    const applyTemplates = httpsCallable(this.functions, 'applyIndustryTemplates');
    applyTemplates({ teamId: this.accountService.aTeam.id })
      .then((result: any) => {
        this.applyingTemplates = false;
        this.showTemplateOffer = false;
        
        if (result.data?.success && result.data?.articlesAdded > 0) {
          this.snackBar.open(
            `✓ Added ${result.data.articlesAdded} recommended articles to your library!`,
            'View',
            { duration: 5000 }
          ).onAction().subscribe(() => {
            this.setTab('myLibrary');
          });
          
          // Refresh the library to show new articles
          window.location.reload();
        } else if (result.data?.articlesAdded === 0) {
          this.snackBar.open(
            'All recommended articles are already in your library!',
            'Close',
            { duration: 3000 }
          );
        } else {
          this.snackBar.open(
            result.data?.message || 'No templates available for your industries yet.',
            'Close',
            { duration: 3000 }
          );
        }
      })
      .catch(error => {
        this.applyingTemplates = false;
        console.error('Error applying templates:', error);
        this.snackBar.open(
          'Error applying templates. Please try again.',
          'Close',
          { duration: 3000 }
        );
      });
  }

  dismissTemplateOffer(): void {
    this.showTemplateOffer = false;
    // Optionally persist this preference
    localStorage.setItem('hideTemplateOffer', 'true');
  }

  /**
   * Get article suggestions based on the team's industry.
   */
  getSuggestions(): void {
    const industry = this.accountService.aTeam?.industry;
    if (!industry || this.loadingSuggestions) return;

    this.loadingSuggestions = true;
    this.suggestedArticles = [];
    this.showSuggestions = true;

    const getSuggestions = httpsCallable(this.functions, 'getAISuggestedArticles');
    getSuggestions({ 
      industry: industry,
      teamId: this.accountService.aTeam?.id 
    })
      .then((result: any) => {
        this.loadingSuggestions = false;
        if (result.data?.success) {
          this.suggestedArticles = result.data.articles || [];
          if (this.suggestedArticles.length === 0) {
            this.snackBar.open(
              'No additional articles suggested for your industry.',
              'Close',
              { duration: 3000 }
            );
          }
        }
      })
      .catch(error => {
        this.loadingSuggestions = false;
        console.error('Error getting suggestions:', error);
        this.snackBar.open(
          'Error getting suggestions. Please try again.',
          'Close',
          { duration: 3000 }
        );
      });
  }

  /**
   * Close the suggestions panel
   */
  closeSuggestions(): void {
    this.showSuggestions = false;
    this.suggestedArticles = [];
    this.selectedArticle = null;
  }

  /**
   * Select a suggested article to preview in the sidenav
   */
  selectSuggestedArticle(articleId: string): void {
    this.oshaArticles$.pipe(take(1)).subscribe(articles => {
      const article = articles.find(a => a.id === articleId);
      if (article) {
        this.selectedArticle = article;
      }
    });
  }

  // ============ Multi-Select Methods ============

  /**
   * Get unique identifier for an article
   */
  getArticleKey(article: LibraryItem | OSHAArticle): string {
    return article.id || article.name;
  }

  /**
   * Toggle selection mode
   */
  toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.clearSelection();
    }
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    this.selectedItems.clear();
    this.selectionMode = false;
  }

  /**
   * Toggle selection of a single item
   */
  toggleItemSelection(article: LibraryItem | OSHAArticle, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    
    const key = this.getArticleKey(article);
    if (this.selectedItems.has(key)) {
      this.selectedItems.delete(key);
    } else {
      this.selectedItems.add(key);
    }
    
    // Auto-enable selection mode if items are selected
    if (this.selectedItems.size > 0) {
      this.selectionMode = true;
    }
  }

  /**
   * Check if an item is selected
   */
  isItemSelected(article: LibraryItem | OSHAArticle): boolean {
    return this.selectedItems.has(this.getArticleKey(article));
  }

  /**
   * Select all visible items
   */
  selectAll(): void {
    this.currentFilteredContent.forEach(article => {
      this.selectedItems.add(this.getArticleKey(article));
    });
    this.selectionMode = true;
  }

  /**
   * Deselect all items
   */
  deselectAll(): void {
    this.selectedItems.clear();
  }

  /**
   * Check if all visible items are selected
   */
  isAllSelected(): boolean {
    if (this.currentFilteredContent.length === 0) return false;
    return this.currentFilteredContent.every(article => 
      this.selectedItems.has(this.getArticleKey(article))
    );
  }

  /**
   * Check if some but not all items are selected (for indeterminate checkbox state)
   */
  isSomeSelected(): boolean {
    if (this.currentFilteredContent.length === 0) return false;
    const selectedCount = this.currentFilteredContent.filter(article => 
      this.selectedItems.has(this.getArticleKey(article))
    ).length;
    return selectedCount > 0 && selectedCount < this.currentFilteredContent.length;
  }

  /**
   * Toggle select all
   */
  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.deselectAll();
    } else {
      this.selectAll();
    }
  }

  /**
   * Get count of selected items that can be added to library
   */
  getAddableSelectedCount(): number {
    return this.currentFilteredContent.filter(article => 
      this.selectedItems.has(this.getArticleKey(article)) && 
      !this.isInLibrary(article.name)
    ).length;
  }

  /**
   * Get count of selected items that are in the library
   */
  getRemovableSelectedCount(): number {
    return this.currentFilteredContent.filter(article => 
      this.selectedItems.has(this.getArticleKey(article))
    ).length;
  }

  /**
   * Bulk add selected items to library
   */
  async bulkAddToLibrary(): Promise<void> {
    if (this.processingBulkAction) return;
    
    const articlesToAdd = this.currentFilteredContent.filter(article => 
      this.selectedItems.has(this.getArticleKey(article)) && 
      !this.isInLibrary(article.name)
    );
    
    if (articlesToAdd.length === 0) {
      this.snackBar.open('All selected articles are already in your library.', 'Close', { duration: 3000 });
      return;
    }
    
    this.processingBulkAction = true;
    
    // Calculate optimal scheduled dates for all items at once for even distribution
    const itemsForScheduling = articlesToAdd.map(() => ({ cadence: TrainingCadence.Annually }));
    const scheduledDates = this.trainingService.calculateBulkScheduledDates(
      itemsForScheduling,
      this.libraryItemsCache
    );
    
    try {
      for (let i = 0; i < articlesToAdd.length; i++) {
        await this.addToLibraryAsyncWithSchedule(articlesToAdd[i], scheduledDates[i]);
      }
      
      this.snackBar.open(
        `✓ Added ${articlesToAdd.length} article${articlesToAdd.length > 1 ? 's' : ''} to your library!`,
        'View',
        { duration: 5000 }
      ).onAction().subscribe(() => {
        this.setTab('myLibrary');
      });
      
      this.clearSelection();
    } catch (error) {
      console.error('Error adding articles:', error);
      this.snackBar.open('Error adding some articles. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.processingBulkAction = false;
    }
  }

  /**
   * Helper method to add article to library (returns promise)
   */
  private addToLibraryAsync(article: OSHAArticle | LibraryItem): Promise<void> {
    const li = new LibraryItem();
    li.addedBy = this.accountService.user.id;
    li.content = article.content;
    li.industry = article.industry || 'Chimp';
    li.topic = article.topic || 'Chat';
    li.name = article.name;
    li.teamId = this.accountService.aTeam.id;
    li.thumbnail = article.thumbnail || null;
    li.trainingCadence = TrainingCadence.Annually;
    
    // Calculate optimal scheduled date based on existing library items
    li.scheduledDueDate = this.trainingService.calculateOptimalScheduledDate(
      li.trainingCadence,
      this.libraryItemsCache
    );
    
    return this.trainingService.addToLibrary(li).then((id) => {
      li.id = id;
      this.libraryItemsCache.push(li);
    });
  }

  /**
   * Helper method to add article to library with pre-calculated schedule (for bulk adds)
   */
  private addToLibraryAsyncWithSchedule(article: OSHAArticle | LibraryItem, scheduledDueDate: Date): Promise<void> {
    const li = new LibraryItem();
    li.addedBy = this.accountService.user.id;
    li.content = article.content;
    li.industry = article.industry || 'Chimp';
    li.topic = article.topic || 'Chat';
    li.name = article.name;
    li.teamId = this.accountService.aTeam.id;
    li.thumbnail = article.thumbnail || null;
    li.trainingCadence = TrainingCadence.Annually;
    li.scheduledDueDate = scheduledDueDate;
    
    return this.trainingService.addToLibrary(li).then((id) => {
      li.id = id;
      this.libraryItemsCache.push(li);
    });
  }

  /**
   * Bulk remove selected items from library
   */
  async bulkRemoveFromLibrary(): Promise<void> {
    if (this.processingBulkAction) return;
    
    const articlesToRemove = this.currentFilteredContent.filter(article => 
      this.selectedItems.has(this.getArticleKey(article))
    ) as LibraryItem[];
    
    if (articlesToRemove.length === 0) return;
    
    this.processingBulkAction = true;
    
    try {
      for (const article of articlesToRemove) {
        await this.trainingService.removeFromLibrary(article);
        this.libraryItemsCache = this.libraryItemsCache.filter(l => l.id !== article.id);
      }
      
      this.snackBar.open(
        `✓ Removed ${articlesToRemove.length} article${articlesToRemove.length > 1 ? 's' : ''} from your library.`,
        'Close',
        { duration: 5000 }
      );
      
      this.clearSelection();
      this.selectedArticle = null;
    } catch (error) {
      console.error('Error removing articles:', error);
      this.snackBar.open('Error removing some articles. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.processingBulkAction = false;
    }
  }

  /**
   * Add all suggested articles to the library
   */
  addAllSuggestedArticles(): void {
    const articleIds = this.suggestedArticles.map(a => a.id);
    this.addSuggestedArticles(articleIds);
  }

  /**
   * Add selected suggested articles to the library
   */
  addSuggestedArticles(articleIds: string[]): void {
    if (articleIds.length === 0) return;

    // Find the full article data for each selected ID
    this.oshaArticles$.pipe(take(1)).subscribe(async allArticles => {
      const articlesToAdd = allArticles.filter(a => articleIds.includes(a.id!));
      
      if (articlesToAdd.length === 0) return;

      // Calculate optimal scheduled dates for all items at once for even distribution
      const itemsForScheduling = articlesToAdd.map(() => ({ cadence: TrainingCadence.Annually }));
      const scheduledDates = this.trainingService.calculateBulkScheduledDates(
        itemsForScheduling,
        this.libraryItemsCache
      );

      // Add each article to library with calculated schedule
      for (let i = 0; i < articlesToAdd.length; i++) {
        await this.addToLibraryAsyncWithSchedule(articlesToAdd[i], scheduledDates[i]);
      }
      
      this.snackBar.open(
        `✓ Added ${articlesToAdd.length} articles to your library!`,
        'View',
        { duration: 5000 }
      ).onAction().subscribe(() => {
        this.setTab('myLibrary');
        this.closeSuggestions();
      });
      
      // Remove added articles from suggestions
      this.suggestedArticles = this.suggestedArticles.filter(
        a => !articleIds.includes(a.id)
      );
    });
  }

  ngOnDestroy() {
    if (this.teamSubscription) this.teamSubscription.unsubscribe();
  }
}
