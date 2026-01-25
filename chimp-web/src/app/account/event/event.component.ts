import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router } from "@angular/router";
import { AccountService, Event } from "../account.service";
import { map, take } from "rxjs/operators";
import moment from "moment";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatBadgeModule } from "@angular/material/badge";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { Observable, Subscription } from "rxjs";
import { EventsFilterDialog } from './filter-dialog/filter.dialog';
import { collection, collectionData, query, orderBy, limit as limitQuery } from "@angular/fire/firestore";

interface CalendarDay {
  id: number;
  date: moment.Moment;
  month: string;
  day: string;
  dOW: string;
  events: Event[];
}

@Component({
  standalone: true,
  selector: "app-event",
  templateUrl: "./event.component.html",
  styleUrls: ["./event.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatBadgeModule,
    MatTooltipModule,
    MatProgressBarModule
  ]
})
export class EventComponent implements OnDestroy {
  private subscription: Subscription;
  searchVisible = false;
  searchStr = '';
  filterUsers: string[] = [];
  filterTypes: string[] = [];
  aDay: string | null = null;

  eventTypes: string[] = [];
  days: CalendarDay[] = [];
  calendarDays: CalendarDay[] = [];

  resultsLimit: number = 0;
  lastLength: number = 0;

  loading = true;
  hasEvents = false;

  now: string = moment().format('MMM');
  currentYear: string = moment().format('YYYY');

  constructor(
    public accountService: AccountService,
    public dialog: MatDialog,
    public router: Router
  ) {
    this.accountService.helper = this.accountService.helperProfiles.event;
    this.subscription = this.accountService.teamManagersObservable.subscribe(aTeam => {
      if (aTeam) {
        this.getLogs();
      }
    });
  }

  getLogs() {
    this.resultsLimit = this.resultsLimit + 50;
    this.getEvents().subscribe(events => {
      this.loading = false;
      
      if (events.length === 0) {
        this.hasEvents = false;
        this.accountService.showHelper = true;
        return;
      }
      
      this.hasEvents = true;
      if (events.length === this.lastLength) return;
      this.lastLength = events.length;
      
      events.forEach(event => {
        const fullTeam = this.accountService.teamManagers
          .map(u => ({ id: u.id, name: u.name }))
          .concat(this.accountService.teamMembers.map(u => ({ id: u.id, name: u.name })));
        event.user = fullTeam.find(user => user.id === (event.userId || event.teamMemberId));
        if (!this.eventTypes.find(type => type === event.type)) {
          this.eventTypes.push(event.type);
        }
      });
      
      this.buildCalendar(events);
    });
  }

  public getEvents(): Observable<any> {
    const eventsQuery = query(
      collection(this.accountService.db, `team/${this.accountService.aTeam.id}/event`),
      orderBy("createdAt", "desc"),
      limitQuery(this.resultsLimit)
    );
    return collectionData(eventsQuery, { idField: "id" }).pipe(
      map((actions: any[]) =>
        actions.map((data) => ({
          ...data,
          createdAt: data["createdAt"]?.toDate ? data["createdAt"].toDate() : data["createdAt"]
        }))
      )
    );
  }

  @HostListener('scroll', ['$event'])
  onScroll(event?: any) {
    if (!event) {
      const bbody = document.getElementById('bbody');
      const window = document.getElementById('window');
      if (bbody && window && bbody.clientHeight < window.clientHeight) {
        this.getLogs();
        return;
      }
    } else {
      if (event.target.offsetHeight + event.target.scrollTop + 1 >= event.target.scrollHeight) {
        this.getLogs();
      }
    }
  }

  buildCalendar(events: Event[]) {
    this.calendarDays = [];
    const totalDays = moment().diff(events[events.length - 1].createdAt, 'days') + 7;
    
    for (let i = 0; i <= totalDays; i++) {
      const date = moment().subtract(i, "days");
      const month = date.format("MMM");
      const day = date.format("DD");
      const dOW = date.format("ddd");
      const dayEvents = events.filter(event => moment(event.createdAt).isSame(date, "day"));
      
      this.calendarDays.push({
        id: i + 1,
        date,
        month,
        day,
        dOW,
        events: dayEvents
      });
    }
    
    this.filterEvents();
    setTimeout(() => {
      this.onScroll();
    }, 1000);
  }

  routeToEventOrigin(event: Event) {
    switch (event.type) {
      case EventType.log:
        this.accountService.searchForHelper = event.documentId;
        this.router.navigate(['account/log']);
        return;
      case EventType.timeclock:
        this.accountService.searchForHelper = event.documentId;
        this.router.navigate(['account/time']);
        return;
      case EventType.member:
        this.accountService.searchForHelper = event.documentId;
        this.router.navigate(['account/dashboard']);
        return;
      case EventType.incidentReport:
        this.router.navigate(['account/incident-reports']);
        return;
      case EventType.selfInspection:
        this.router.navigate(['account/self-inspections']);
        return;
      case EventType.survey:
        this.router.navigate(['account/surveys/' + event.documentId]);
        return;
      case EventType.surveyResponse:
        this.router.navigate(['account/surveys/' + event.documentId]);
        return;
    }
  }

  filter(): void {
    this.dialog.open(EventsFilterDialog, {
      data: {
        eventTypes: this.eventTypes,
        filterUsers: this.filterUsers,
        filterTypes: this.filterTypes
      },
      disableClose: true
    })
    .afterClosed()
    .subscribe((data) => {
      if (data) {
        this.filterUsers = data.filterUsers;
        this.filterTypes = data.filterTypes;
        this.filterEvents();
      }
    });
  }

  filterEvents(): void {
    if (this.searchStr?.trim() || this.filterUsers.length > 0 || this.filterTypes.length > 0) {
      const filter: string[] = [
        ...(this.searchStr ? this.searchStr.trim().split(/\s+/) : []),
        ...this.filterUsers,
        ...this.filterTypes
      ];
      
      const results: CalendarDay[] = JSON.parse(JSON.stringify(this.calendarDays));
      this.days = results.filter(day => {
        day.events = day.events.filter((event: Event) => {
          let eventFiltersFound = 0;
          for (const f of filter) {
            if (event.documentId?.toLowerCase().includes(f.toLowerCase())) eventFiltersFound++;
            if (event.description?.toLowerCase().includes(f.toLowerCase())) eventFiltersFound++;
            if (event.action?.toLowerCase().includes(f.toLowerCase())) eventFiltersFound++;
            if (event.type?.toLowerCase().includes(f.toLowerCase())) eventFiltersFound++;
            if (event['user']?.name?.toLowerCase().includes(f.toLowerCase())) eventFiltersFound++;
          }
          return eventFiltersFound >= filter.length;
        });
        return day.events.length > 0;
      });
    } else {
      this.days = this.calendarDays;
    }
  }

  clearSearch(): void {
    this.searchStr = '';
    this.filterEvents();
  }

  get activeFilterCount(): number {
    return this.filterUsers.length + this.filterTypes.length;
  }

  get totalEventsCount(): number {
    return this.calendarDays.reduce((sum, day) => sum + day.events.length, 0);
  }

  get visibleEventsCount(): number {
    return this.days.reduce((sum, day) => sum + day.events.length, 0);
  }

  getEventIcon(type: string): string {
    switch (type) {
      case EventType.log: return 'description';
      case EventType.timeclock: return 'schedule';
      case EventType.member: return 'person';
      case EventType.incidentReport: return 'warning';
      case EventType.selfInspection: return 'checklist';
      case EventType.survey: return 'poll';
      case EventType.surveyResponse: return 'how_to_vote';
      case EventType.training: return 'school';
      default: return 'event';
    }
  }

  trackByDayId(index: number, day: CalendarDay): number {
    return day.id;
  }

  trackByEventId(index: number, event: Event): string {
    return event.documentId || index.toString();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}

enum EventType {
  log = 'Log',
  timeclock = "Timeclock",
  incidentReport = "Incident Report",
  survey = "Survey",
  surveyResponse = "Survey Response",
  selfInspection = "Self Inspection",
  training = "Training",
  member = "Member"
}
