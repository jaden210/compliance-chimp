import { Component, HostListener, OnDestroy} from '@angular/core';
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { AccountService, Event } from "../account.service";
import { map, take } from "rxjs/operators";
import moment from "moment";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatBadgeModule } from "@angular/material/badge";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Observable, Subscription } from "rxjs";
import { Router } from '@angular/router';
import { EventsFilterDialog } from './filter-dialog/filter.dialog';
import { collection, collectionData, query, orderBy, limit as limitQuery } from "@angular/fire/firestore";

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
    MatTooltipModule
  ]
})
export class EventComponent implements OnDestroy {
  private subscription: Subscription;
  searchVisible = true;
  searchStr; // template variable
  filterUsers = []; // template variable
  filterTypes = []; // template variable
  aDay: string | null = null; // template variable for calendar day selection

  eventTypes = [];
  days = [];
  calendarDays = [];

  resultsLimit: number = 0; // for pagination
  lastLength: number = 0; // for pagination

  now: any = moment().format('MMM');

  constructor(public accountService: AccountService, public dialog: MatDialog, public router: Router) {
    this.accountService.helper = this.accountService.helperProfiles.event;
    this.subscription = this.subscription = this.accountService.teamManagersObservable.subscribe(aTeam => {
      if (aTeam) {
        this.getLogs();
      }
    });
  }

  getLogs() {
    this.resultsLimit = this.resultsLimit + 50;
    this.getEvents().subscribe(events => {
      if (events.length == 0) {
        this.accountService.showHelper = true;
        return;
      };
      if (events.length == this.lastLength) return;
      this.lastLength = events.length;
      events.forEach(event => {
        const fullTeam = this.accountService.teamManagers.map(u => {return {id: u.id, name: u.name}}).concat(this.accountService.teamMembers.map(u => {return{id: u.id, name: u.name}}));
        event.user = fullTeam.find(user => user.id == (event.userId || event.teamMemberId));
        if (!event.user) {
          console.log(event.userId);
          console.log(this.accountService.teamMembers);
        }
        if (!this.eventTypes.find(type => type == event.type)) this.eventTypes.push(event.type);
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
      if (document.getElementById('bbody').clientHeight < document.getElementById('window').clientHeight) {
        this.getLogs(); // if there isn't enough results to pass the fold, load more
        return;
      } 
    } else {
      if (event.target.offsetHeight + event.target.scrollTop + 1 >= event.target.scrollHeight) {
        this.getLogs();
      }
    }
  }
  
  buildCalendar(events) {
    this.calendarDays = [];
    let total_days = moment().diff(events[events.length -1].createdAt, 'days') + 7; //buffer week
    for (let i = 0; i <= total_days; i++) {
      let date = moment().subtract(i, "days");
      let month = date.format("MMM");
      let day = date.format("DD");
      let dOW = date.format("ddd");
      let dayEvents = events.filter(event => moment(event.createdAt).isSame(date, "day"));
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
    console.log(event.type);
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
      console.log(event.documentId);
      this.router.navigate(['account/surveys/' + event.documentId]);
      return;
      case EventType.surveyResponse:
      console.log(event.documentId);
      
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
    if (this.searchStr && this.searchStr != "" || this.filterUsers.length > 0 || this.filterTypes.length > 0) {
      let filter: string[] = [].concat(
        this.searchStr ? this.searchStr.trim().split(/\s+/) : [],
        this.filterUsers,
        this.filterTypes
      );
      let results = JSON.parse(JSON.stringify(this.calendarDays));
      this.days = results.filter(day => {
        day.events = day.events.filter((event: Event) => {
          let eventFiltersFound = 0;
          for (let f of filter) {
            event.documentId.toLowerCase().includes(f.toLowerCase()) ? eventFiltersFound ++ : null;
            event.description.toLowerCase().includes(f.toLowerCase()) ? eventFiltersFound ++ : null;
            event.action.toLowerCase().includes(f.toLowerCase()) ? eventFiltersFound ++ : null;
            event.type.toLowerCase().includes(f.toLowerCase()) ? eventFiltersFound ++ : null;
            event['user'] ? event['user'].name.toLowerCase().includes(f.toLowerCase()) ? eventFiltersFound ++ : null : null;
          };
          return eventFiltersFound >= filter.length ?  true : false;
        });
        return day.events.length;
      })
    } else this.days = this.calendarDays;
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

// if (this.searchStr) {
//   let newDays = this.calendarDays.filter(day => {
//     let filter: string[] = this.searchStr ? this.searchStr.trim().split(/\s+/) : null;
//     let fFound = 0;
//     filter.forEach(f => {
//       day.day.includes(f) ? fFound ++ : null;
//       day.month.toLowerCase().includes(f) ? fFound ++ : null;
//       day.dOW.toLowerCase().includes(f) ? fFound ++ : null;
//     });
//     day.events.filter(event => {
//       console.log(event)
//       let ret = false;
//       filter.forEach(f => {
//         if (event.description.includes(f)) {
//           fFound ++;
//           ret = true;
//         }
//       });
//       return ret
//     })
//     return fFound >= filter.length ? true : false;
//   });
//   this.days = newDays;
// } else this.days = this.calendarDays;