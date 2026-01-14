import {
  Component,
  AfterViewInit,
  OnDestroy
} from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule } from "@angular/router";
import { TrainingService } from "../training.service";
import { AccountService, Team, TeamMember, User } from "../../account.service";
import { BehaviorSubject, combineLatest, Observable, Subscription } from "rxjs";
import { filter, map } from "rxjs/operators";
import { MatDialogModule } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Router } from "@angular/router";
export type SortColumn = 'date' | 'title' | 'trainer' | null;
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface TrainingHistoryItem {
  id?: string;
  articleId: string;
  receivedTraining: string[];
  userId: string;
  active: boolean;
  createdAt: any; // Firestore Timestamp or Date
  category: string;
  categoryEs: string;
  title: string;
  titleEs: string;
  runDate: any; // Firestore Timestamp or Date
  userSurvey: any;
  creator?: string;
  creatorUser?: User;
}

@Component({
  standalone: true,
  selector: "app-dashboard",
  templateUrl: "./dashboard.component.html",
  styleUrls: ["./dashboard.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule
  ],
  providers: [DatePipe]
})
export class DashboardComponent implements AfterViewInit, OnDestroy {
  team: Team;
  teamMembers: TeamMember[];
  teamManagers: User[];
  
  loading = true;
  trainingsSubscription: Subscription;
  
  trainingHistory: TrainingHistoryItem[] = [];
  filteredHistory$: Observable<TrainingHistoryItem[]>;
  
  sort$ = new BehaviorSubject<SortState>({ column: null, direction: 'desc' });
  searchTerm$ = new BehaviorSubject<string>('');

  constructor(
    private trainingService: TrainingService,
    public accountService: AccountService,
    private router: Router,
    private date: DatePipe
  ) {}

  ngAfterViewInit() {
    this.accountService.helper = this.accountService.helperProfiles.training;
    combineLatest([
      this.accountService.aTeamObservable,
      this.accountService.teamMembersObservable,
      this.accountService.teamManagersObservable,
    ]).subscribe(
      data => {
        if (data[0] && data[1]) {
          this.team = data[0];
          this.teamMembers = data[1] || [];
          this.teamManagers = data[2] || [];
          this.getTrainings();
        }
      }
    );
  }

  private getTrainings(): void {
    this.loading = true;
    this.trainingsSubscription = this.trainingService.getTrainingHistory(this.team.id).subscribe(history => {
      this.trainingHistory = history.map(h => {
        const creatorUser = this.teamManagers.find(u => u.id == h.userId);
        const creator = creatorUser ? creatorUser.name : 'Unknown';
        return { ...h, creator, creatorUser } as TrainingHistoryItem;
      });
      this.loading = false;
      this.setupFilteredHistory();
    });
  }

  private setupFilteredHistory(): void {
    this.filteredHistory$ = combineLatest([
      this.sort$,
      this.searchTerm$
    ]).pipe(
      map(([sort, searchTerm]) => this.applyFilterAndSort(this.trainingHistory, sort, searchTerm))
    );
  }

  private applyFilterAndSort(history: TrainingHistoryItem[], sort: SortState, searchTerm: string): TrainingHistoryItem[] {
    let filtered = [...history];

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(h => 
        h.title?.toLowerCase().includes(term) ||
        h.creator?.toLowerCase().includes(term) ||
        h.category?.toLowerCase().includes(term)
      );
    }

    // Apply sort
    if (sort.column) {
      filtered = this.sortHistory(filtered, sort);
    }

    return filtered;
  }

  private sortHistory(history: TrainingHistoryItem[], sort: SortState): TrainingHistoryItem[] {
    const dir = sort.direction === 'asc' ? 1 : -1;

    return history.sort((a, b) => {
      switch (sort.column) {
        case 'date':
          const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt;
          const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt;
          if (!aDate) return 1 * dir;
          if (!bDate) return -1 * dir;
          return (new Date(aDate).getTime() - new Date(bDate).getTime()) * dir;
        
        case 'title':
          return (a.title || '').localeCompare(b.title || '') * dir;
        
        case 'trainer':
          return (a.creator || '').localeCompare(b.creator || '') * dir;
        
        default:
          return 0;
      }
    });
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

  onSearch(term: string) {
    this.searchTerm$.next(term);
  }

  public routeToSurvey(id: string): void {
    this.router.navigate([`/account/survey/${id}`]);
  }

  public openTrainingDetails(history: TrainingHistoryItem): void {
    if (history?.id) {
      this.routeToSurvey(history.id);
    }
  }

  public goToLibrary(): void {
    this.router.navigate(['/account/training/library']);
  }

  formatDate(date: any): string {
    if (!date) return '—';
    const d = date.toDate ? date.toDate() : new Date(date);
    return this.date.transform(d, 'mediumDate') || '—';
  }

  formatTime(date: any): string {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return this.date.transform(d, 'shortTime') || '';
  }

  getAttendeeCount(history: TrainingHistoryItem): number {
    return history.receivedTraining?.length || 0;
  }

  trackByHistoryId(index: number, item: TrainingHistoryItem) {
    return item.id || index;
  }

  ngOnDestroy() {
    if (this.trainingsSubscription) this.trainingsSubscription.unsubscribe();
  }
}
