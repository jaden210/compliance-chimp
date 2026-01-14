import { Component } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule } from "@angular/router";
import { SelfInspectionsService, SelfInspection, Inspection } from "../self-inspections.service";
import { AccountService } from "../../account.service";
import { ActivatedRoute, Router } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatChipsModule } from "@angular/material/chips";
import { Observable, BehaviorSubject, combineLatest, forkJoin, of } from "rxjs";
import { filter, map, shareReplay, switchMap, take } from "rxjs/operators";

export type FilterType = 'all' | 'inProgress' | 'lastInspected' | 'dueSoon' | 'overdue';
export type SortColumn = 'status' | 'name' | 'lastCompleted' | 'nextDue' | 'frequency' | null;
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface SelfInspectionWithStatus extends SelfInspection {
  nextDueDate?: Date;
  daysUntilDue?: number;
  status?: 'overdue' | 'dueSoon' | 'ok' | 'neverRun';
  inProgressInspection?: Inspection;
}

@Component({
  standalone: true,
  selector: "app-self-inspection",
  templateUrl: "./self-inspections-list.component.html",
  styleUrls: ["./self-inspections-list.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatButtonToggleModule,
    MatChipsModule
  ],
  providers: [DatePipe]
})
export class SelfInspectionsListComponent {

  selfInspections$: Observable<SelfInspectionWithStatus[]>;
  filteredInspections$: Observable<SelfInspectionWithStatus[]>;
  activeFilter$ = new BehaviorSubject<FilterType>('all');
  sort$ = new BehaviorSubject<SortState>({ column: null, direction: 'asc' });

  constructor(
    public router: Router,
    public route: ActivatedRoute,
    private selfInspectionsService: SelfInspectionsService,
    public accountService: AccountService,
  ) {
    this.selfInspections$ = this.accountService.aTeamObservable.pipe(
      filter(team => !!team),
      switchMap(team => this.selfInspectionsService.getSelfInspections(team.id)),
      switchMap((inspections) => {
        if (inspections.length === 0) return of([]);
        // For each self-inspection, get its inspections to find in-progress ones
        const inspectionObservables = inspections.map(si => 
          this.selfInspectionsService.getInspections(si.id).pipe(
            take(1),
            map(runs => {
              const inProgress = runs.find(r => !r.completedAt);
              const result = this.addStatusInfo(si);
              result.inProgressInspection = inProgress;
              return result;
            })
          )
        );
        return forkJoin(inspectionObservables);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.filteredInspections$ = combineLatest([this.selfInspections$, this.activeFilter$, this.sort$]).pipe(
      map(([inspections, filterType, sort]) => this.applyFilterAndSort(inspections, filterType, sort))
    );
  }

  private addStatusInfo(inspection: SelfInspection): SelfInspectionWithStatus {
    const result: SelfInspectionWithStatus = { ...inspection };
    
    if (!inspection.lastCompletedAt || !inspection.inspectionExpiration || inspection.inspectionExpiration === 'Manual') {
      result.status = inspection.lastCompletedAt ? 'ok' : 'neverRun';
      return result;
    }

    const lastCompleted = inspection.lastCompletedAt?.toDate 
      ? inspection.lastCompletedAt.toDate() 
      : new Date(inspection.lastCompletedAt);
    
    const nextDue = this.calculateNextDueDate(lastCompleted, inspection.inspectionExpiration);
    result.nextDueDate = nextDue;
    
    const now = new Date();
    const diffTime = nextDue.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    result.daysUntilDue = diffDays;

    if (diffDays < 0) {
      result.status = 'overdue';
    } else if (diffDays <= 14) {
      result.status = 'dueSoon';
    } else {
      result.status = 'ok';
    }

    return result;
  }

  private calculateNextDueDate(lastCompleted: Date, frequency: string): Date {
    const nextDue = new Date(lastCompleted);
    
    switch (frequency) {
      case 'Monthly':
        nextDue.setMonth(nextDue.getMonth() + 1);
        break;
      case 'Quarterly':
        nextDue.setMonth(nextDue.getMonth() + 3);
        break;
      case 'Semi-Anually':
        nextDue.setMonth(nextDue.getMonth() + 6);
        break;
      case 'Anually':
      default:
        nextDue.setFullYear(nextDue.getFullYear() + 1);
        break;
    }
    
    return nextDue;
  }

  private applyFilterAndSort(inspections: SelfInspectionWithStatus[], filterType: FilterType, sort: SortState): SelfInspectionWithStatus[] {
    let filtered = [...inspections];

    // Apply filter
    switch (filterType) {
      case 'inProgress':
        filtered = filtered.filter(i => !!i.inProgressInspection);
        break;
      case 'overdue':
        filtered = filtered.filter(i => i.status === 'overdue');
        break;
      case 'dueSoon':
        filtered = filtered.filter(i => i.status === 'dueSoon' || i.status === 'overdue');
        break;
    }

    // Apply sort
    if (sort.column) {
      filtered = this.sortInspections(filtered, sort);
    } else {
      // Default sort based on filter
      switch (filterType) {
        case 'overdue':
        case 'dueSoon':
          filtered.sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));
          break;
        case 'lastInspected':
          filtered.sort((a, b) => {
            const aDate = a.lastCompletedAt?.toDate ? a.lastCompletedAt.toDate() : a.lastCompletedAt;
            const bDate = b.lastCompletedAt?.toDate ? b.lastCompletedAt.toDate() : b.lastCompletedAt;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return new Date(bDate).getTime() - new Date(aDate).getTime();
          });
          break;
        default:
          filtered.sort((a, b) => a.title.localeCompare(b.title));
      }
    }

    return filtered;
  }

  private sortInspections(inspections: SelfInspectionWithStatus[], sort: SortState): SelfInspectionWithStatus[] {
    const dir = sort.direction === 'asc' ? 1 : -1;

    return inspections.sort((a, b) => {
      switch (sort.column) {
        case 'status':
          const statusOrder = { overdue: 0, dueSoon: 1, ok: 2, neverRun: 3 };
          return (statusOrder[a.status || 'ok'] - statusOrder[b.status || 'ok']) * dir;
        
        case 'name':
          return a.title.localeCompare(b.title) * dir;
        
        case 'lastCompleted':
          const aLast = a.lastCompletedAt?.toDate ? a.lastCompletedAt.toDate() : a.lastCompletedAt;
          const bLast = b.lastCompletedAt?.toDate ? b.lastCompletedAt.toDate() : b.lastCompletedAt;
          if (!aLast) return 1 * dir;
          if (!bLast) return -1 * dir;
          return (new Date(aLast).getTime() - new Date(bLast).getTime()) * dir;
        
        case 'nextDue':
          if (!a.nextDueDate) return 1 * dir;
          if (!b.nextDueDate) return -1 * dir;
          return (a.nextDueDate.getTime() - b.nextDueDate.getTime()) * dir;
        
        case 'frequency':
          const freqOrder = { 'Manual': 0, 'Monthly': 1, 'Quarterly': 2, 'Semi-Anually': 3, 'Anually': 4 };
          const aFreq = freqOrder[a.inspectionExpiration || 'Manual'] ?? 5;
          const bFreq = freqOrder[b.inspectionExpiration || 'Manual'] ?? 5;
          return (aFreq - bFreq) * dir;
        
        default:
          return 0;
      }
    });
  }

  toggleSort(column: SortColumn) {
    const current = this.sort$.value;
    if (current.column === column) {
      // Toggle direction or clear
      if (current.direction === 'asc') {
        this.sort$.next({ column, direction: 'desc' });
      } else {
        this.sort$.next({ column: null, direction: 'asc' });
      }
    } else {
      this.sort$.next({ column, direction: 'asc' });
    }
  }

  setFilter(filterType: FilterType) {
    this.activeFilter$.next(filterType);
    // Clear sort when changing filter
    this.sort$.next({ column: null, direction: 'asc' });
  }

  selectSelfInspection(inspection) {
    this.router.navigate([inspection.id], { relativeTo: this.route });
  }

  startNewSelfInspection() {
    this.router.navigate(['new'], { relativeTo: this.route });
  }

  startInspection(inspection: SelfInspectionWithStatus) {
    if (inspection.inProgressInspection) {
      // Resume existing in-progress inspection
      this.router.navigate([inspection.id, inspection.inProgressInspection.id], { relativeTo: this.route });
    } else {
      // Start new inspection
      this.selfInspectionsService.startInspection(inspection).then(newInspection => {
        this.router.navigate([inspection.id, newInspection.id], { relativeTo: this.route });
      });
    }
  }

  trackByInspectionId(index: number, inspection: SelfInspection) {
    return inspection.id || inspection.title || index;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'overdue': return 'Overdue';
      case 'dueSoon': return 'Due Soon';
      case 'neverRun': return 'Never Run';
      default: return 'On Track';
    }
  }
}
