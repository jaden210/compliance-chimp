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
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { AccountService } from "../../account.service";
import {
  OutreachService,
  ScrapeJob,
  ScrapeJobResult,
  EmailVerification,
} from "../outreach.service";
import { CampaignService } from "../campaign.service";
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
    MatSelectModule,
    MatSnackBarModule,
  ],
  providers: [DatePipe, OutreachService, CampaignService],
})
export class OutreachDetailComponent implements OnInit, OnDestroy {
  job: ScrapeJob;
  dataSource = new MatTableDataSource<ScrapeJobResult>([]);
  searchTerm: string = "";
  displayedColumns: string[] = [
    "name",
    "phone",
    "email",
    "status",
    "website",
    "address",
  ];

  statusFilter: string = "all";
  editingCell: { row: number; col: string } | null = null;
  editValue: string = "";
  sanitizing: boolean = false;
  verifying: boolean = false;

  @ViewChild(MatSort) sort: MatSort;

  private sub: Subscription;

  constructor(
    public accountService: AccountService,
    public service: OutreachService,
    private campaignService: CampaignService,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar
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

    let filtered = this.job.results;
    switch (this.statusFilter) {
      case "deliverable":
      case "risky":
      case "undeliverable":
      case "unknown":
      case "custom":
        filtered = filtered.filter(
          (r) => r.emailVerification?.status === this.statusFilter
        );
        break;
      case "not_verified":
        filtered = filtered.filter(
          (r) => r.email && !r.emailVerification
        );
        break;
      case "no_email":
        filtered = filtered.filter((r) => !r.email && !r.skipped);
        break;
      case "skipped":
        filtered = filtered.filter((r) => r.skipped);
        break;
      case "sendable":
        filtered = filtered.filter(
          (r) =>
            r.emailVerification?.status === "deliverable" ||
            r.emailVerification?.status === "custom"
        );
        break;
    }

    this.dataSource.data = filtered;
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
      if (col === "email") {
        delete row.emailVerification;
        if (trimmed) row.skipped = false;
      }
      this.service.updateResult(this.job.id, this.job.results);
    }
    this.editingCell = null;
  }

  skipResult(row: ScrapeJobResult): void {
    row.skipped = true;
    this.service.updateResult(this.job.id, this.job.results);
    this.applyFilter();
  }

  cancelEdit(): void {
    this.editingCell = null;
  }

  async sanitizeEmails(): Promise<void> {
    if (!this.job?.results?.length || this.sanitizing) return;
    this.sanitizing = true;
    try {
      const changed = await this.service.sanitizeEmails(this.job);
      this.snackBar.open(
        changed > 0
          ? `Sanitized ${changed} email${changed > 1 ? "s" : ""}`
          : "All emails are already clean",
        "OK",
        { duration: 3000 }
      );
    } catch (err) {
      console.error("Error sanitizing emails:", err);
      this.snackBar.open("Error sanitizing emails", "OK", { duration: 3000 });
    } finally {
      this.sanitizing = false;
    }
  }

  hasUnverifiedEmails(): boolean {
    if (!this.job?.results?.length) return false;
    return this.job.results.some(
      (r) => r.email && !r.emailVerification
    );
  }

  async verifyEmails(): Promise<void> {
    if (!this.job?.results?.length || this.verifying) return;
    this.verifying = true;
    try {
      const result = await this.service.verifyEmails(this.job.id);
      const { deliverable, risky, undeliverable, unknown } = result.results;
      const parts: string[] = [];
      if (deliverable) parts.push(`${deliverable} deliverable`);
      if (risky) parts.push(`${risky} risky`);
      if (undeliverable) parts.push(`${undeliverable} undeliverable`);
      if (unknown) parts.push(`${unknown} unknown`);
      const summary = parts.length ? parts.join(", ") : "No new emails to verify";
      this.snackBar.open(
        `Verified ${result.verified} email${result.verified !== 1 ? "s" : ""}: ${summary}`,
        "OK",
        { duration: 5000 }
      );
    } catch (err: any) {
      console.error("Error verifying emails:", err);
      const message =
        err?.message?.includes("insufficient credits")
          ? "Bouncer account has insufficient credits"
          : err?.message?.includes("rate limit")
          ? "Rate limit exceeded. Try again in a minute."
          : "Error verifying emails";
      this.snackBar.open(message, "OK", { duration: 4000 });
    } finally {
      this.verifying = false;
    }
  }

  markAsCustom(row: ScrapeJobResult): void {
    row.emailVerification = {
      status: "custom",
      reason: "manual",
      verifiedAt: new Date().toISOString(),
    };
    this.service.updateResult(this.job.id, this.job.results);

    this.campaignService
      .addVerifiedContactToCampaign(this.job.id, {
        email: row.email,
        companyName: row.name || "",
        website: row.website || "",
      })
      .then((added) => {
        const msg = added
          ? "Marked as custom — added to campaign at step 1"
          : "Marked as custom — already in campaign";
        this.snackBar.open(msg, "OK", { duration: 3000 });
      })
      .catch(() => {
        this.snackBar.open("Marked as custom — will be included in sends", "OK", {
          duration: 2000,
        });
      });
  }

  getVerificationIcon(v: EmailVerification): string {
    switch (v.status) {
      case "deliverable": return "check_circle";
      case "custom": return "person_check";
      case "risky": return "warning";
      case "undeliverable": return "cancel";
      default: return "help_outline";
    }
  }

  getVerificationTooltip(v: EmailVerification): string {
    if (v.status === "custom") return "Manually approved";
    const parts: string[] = [v.status];
    if (v.reason) parts.push(`(${v.reason})`);
    if (v.score != null) parts.push(`Score: ${v.score}`);
    return parts.join(" ");
  }
}
