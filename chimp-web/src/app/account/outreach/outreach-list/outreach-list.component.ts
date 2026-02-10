import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule, Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { AccountService } from "../../account.service";
import { OutreachService, ScrapeJob } from "../outreach.service";
import { Observable, Subscription } from "rxjs";
import { tap } from "rxjs/operators";

@Component({
  standalone: true,
  selector: "app-outreach-list",
  templateUrl: "./outreach-list.component.html",
  styleUrls: ["./outreach-list.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  providers: [DatePipe, OutreachService],
})
export class OutreachListComponent implements OnInit, OnDestroy {
  jobs$: Observable<ScrapeJob[]>;
  hasJobs: boolean = false;
  setupCollapsed: boolean = false;
  private sub: Subscription;

  constructor(
    public accountService: AccountService,
    public service: OutreachService,
    private router: Router
  ) {}

  ngOnInit() {
    this.jobs$ = this.service.getJobs().pipe(
      tap((jobs) => {
        this.hasJobs = jobs.length > 0;
        if (this.hasJobs && !this.setupCollapsed) {
          this.setupCollapsed = true;
        }
      })
    );
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }

  viewJob(job: ScrapeJob): void {
    this.router.navigate(["account", "support", "outreach", job.id]);
  }

  downloadCsv(event: Event, job: ScrapeJob): void {
    event.stopPropagation();
    this.service.downloadCsv(job);
  }

  deleteJob(event: Event, job: ScrapeJob): void {
    event.stopPropagation();
    if (confirm(`Delete "${job.niche} - ${job.region}" scrape job?`)) {
      this.service.deleteJob(job.id);
    }
  }
}
