import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router } from "@angular/router";
import { TrainingService, LibraryItem, OSHAArticle } from "../training.service";
import { AccountService } from "../../account.service";
import { BehaviorSubject, Observable, combineLatest, of, Subscription } from "rxjs";
import { filter, map, shareReplay, switchMap, take } from "rxjs/operators";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSidenavModule } from "@angular/material/sidenav";
import { HelpDialog } from "../help.dialog";
import { BlasterDialog } from "src/app/blaster/blaster.component";
import { CreateEditArticleComponent } from "./create-edit-article/create-edit-article.component";

export type LibraryTab = 'myLibrary' | 'osha' | 'chimpChats';
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
    MatSidenavModule,
    CreateEditArticleComponent
  ],
  providers: [DatePipe]
})
export class LibraryComponent implements OnInit, OnDestroy {
  // Observable streams
  library$: Observable<LibraryItem[]>;
  chimpChats$: Observable<LibraryItem[]>;
  oshaArticles$: Observable<OSHAArticle[]>;
  filteredContent$: Observable<(LibraryItem | OSHAArticle)[]>;
  
  // UI state
  activeTab$ = new BehaviorSubject<LibraryTab>('myLibrary');
  searchTerm$ = new BehaviorSubject<string>('');
  sort$ = new BehaviorSubject<SortState>({ column: null, direction: 'asc' });
  
  // Selected article for detail view
  selectedArticle: LibraryItem | OSHAArticle | null = null;
  customArticle = false;
  
  private teamSubscription: Subscription;
  private libraryItemsCache: LibraryItem[] = [];

  constructor(
    private trainingService: TrainingService,
    public accountService: AccountService,
    private dialog: MatDialog,
    private router: Router
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
    this.teamSubscription = this.library$.subscribe(items => {
      this.libraryItemsCache = items;
    });

    this.chimpChats$ = this.trainingService.getChimpChats().pipe(
      map(cc => cc.sort((a: LibraryItem, b: LibraryItem) => a.name.localeCompare(b.name))),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.oshaArticles$ = combineLatest([
      this.trainingService.getOshaContent(),
      this.accountService.aTeamObservable.pipe(filter(team => !!team))
    ]).pipe(
      map(([data, team]) => {
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
          art.thumbnail = topic.imageUrl || industry.imageUrl;
          return art;
        }).filter((a: OSHAArticle) => team.industries?.find((i: string) => i === a.industryId))
          .sort((a: OSHAArticle, b: OSHAArticle) => 
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
      this.chimpChats$,
      this.searchTerm$,
      this.sort$
    ]).pipe(
      map(([tab, library, osha, chats, search, sort]) => {
        let content: (LibraryItem | OSHAArticle)[] = [];
        
        switch (tab) {
          case 'myLibrary':
            content = library;
            break;
          case 'osha':
            content = osha;
            break;
          case 'chimpChats':
            content = chats;
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

        return content;
      })
    );
  }

  private applySearch(content: (LibraryItem | OSHAArticle)[], search: string): (LibraryItem | OSHAArticle)[] {
    const terms = search.toLowerCase().trim().split(' ');
    return content.filter(item => {
      const name = item.name.toLowerCase();
      const industry = (item.industry || '').toLowerCase();
      const topic = (item.topic || '').toLowerCase();
      const itemContent = ('content' in item ? item.content || '' : '').toLowerCase();
      
      let score = 0;
      terms.forEach(term => {
        if (name.includes(term)) score += 4;
        if (industry.includes(term)) score += 2;
        if (topic.includes(term)) score += 2;
        if (itemContent.includes(term)) score += 1;
      });
      return score >= terms.length;
    }).sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
  }

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
    this.selectedArticle = article;
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

  startTraining(): void {
    if (!this.selectedArticle) return;
    this.dialog.open(BlasterDialog, {
      data: {
        libraryItem: this.selectedArticle
      }
    });
  }

  createCustomArticle(article: LibraryItem | null = null): void {
    this.selectedArticle = article;
    this.customArticle = true;
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
      ? `Build your training library by adding OSHA articles or Chimp Chats that apply to your team. 
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
      case 'chimpChats': return 'Chimp Chats';
    }
  }

  ngOnDestroy() {
    if (this.teamSubscription) this.teamSubscription.unsubscribe();
  }
}
