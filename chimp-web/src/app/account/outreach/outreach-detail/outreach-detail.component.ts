import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, ActivatedRoute, Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatTableModule, MatTableDataSource } from "@angular/material/table";
import { MatSortModule, MatSort } from "@angular/material/sort";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { AccountService } from "../../account.service";
import {
  OutreachService,
  ScrapeJob,
  ScrapeJobResult,
} from "../outreach.service";
import { Subscription } from "rxjs";

@Component({
  standalone: true,
  selector: "app-outreach-detail",
  templateUrl: "./outreach-detail.component.html",
  styleUrls: ["./outreach-detail.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatSortModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  providers: [DatePipe, OutreachService],
})
export class OutreachDetailComponent implements OnInit, OnDestroy {
  job: ScrapeJob;
  dataSource = new MatTableDataSource<ScrapeJobResult>([]);
  searchTerm: string = "";
  displayedColumns: string[] = [
    "name",
    "phone",
    "email",
    "website",
    "address",
  ];

  editingCell: { row: number; col: string } | null = null;
  editValue: string = "";

  @ViewChild(MatSort) sort: MatSort;

  private sub: Subscription;

  constructor(
    public accountService: AccountService,
    public service: OutreachService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    const jobId = this.route.snapshot.paramMap.get("jobId");
    if (jobId) {
      this.sub = this.service.getJob(jobId).subscribe((job) => {
        this.job = job;
        this.applyFilter();
        if (this.sort && !this.dataSource.sort) {
          this.dataSource.sort = this.sort;
        }
      });
    }

    this.dataSource.filterPredicate = (row: ScrapeJobResult, filter: string) =>
      (row.name || "").toLowerCase().includes(filter) ||
      (row.phone || "").toLowerCase().includes(filter) ||
      (row.email || "").toLowerCase().includes(filter) ||
      (row.address || "").toLowerCase().includes(filter) ||
      (row.website || "").toLowerCase().includes(filter);
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }

  goBack(): void {
    this.router.navigate(["account", "support", "outreach"]);
  }

  openCampaign(): void {
    if (!this.job) return;
    this.router.navigate([
      "account",
      "support",
      "outreach",
      this.job.id,
      "campaign",
    ]);
  }

  applyFilter(): void {
    if (!this.job?.results) {
      this.dataSource.data = [];
      return;
    }

    this.dataSource.data = this.job.results;
    this.dataSource.filter = (this.searchTerm || "").trim().toLowerCase();

    if (this.sort && !this.dataSource.sort) {
      this.dataSource.sort = this.sort;
    }
  }

  downloadCsv(): void {
    this.service.downloadCsv(this.job);
  }

  openMaps(url: string): void {
    if (url) window.open(url, "_blank");
  }

  openWebsite(url: string): void {
    if (url) window.open(url, "_blank");
  }

  copyEmail(email: string): void {
    if (email) {
      navigator.clipboard.writeText(email);
    }
  }

  copyPhone(phone: string): void {
    if (phone) {
      navigator.clipboard.writeText(phone);
    }
  }

  startEdit(rowIndex: number, col: string, currentValue: string): void {
    this.editingCell = { row: rowIndex, col };
    this.editValue = currentValue || "";
    setTimeout(() => {
      const input = document.querySelector(".inline-edit") as HTMLInputElement;
      if (input) input.focus();
    });
  }

  saveEdit(row: ScrapeJobResult, col: string): void {
    if (!this.editingCell) return;
    const trimmed = this.editValue.trim();
    if ((row as any)[col] !== trimmed) {
      (row as any)[col] = trimmed;
      this.service.updateResult(this.job.id, this.job.results);
    }
    this.editingCell = null;
  }

  cancelEdit(): void {
    this.editingCell = null;
  }
}
