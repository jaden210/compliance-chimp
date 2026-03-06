import { Component, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { collection, collectionData, doc, orderBy, query, updateDoc, where } from "@angular/fire/firestore";
import { Subscription } from "rxjs";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { AccountService } from "../../account.service";
import {
  IncidentReportLike,
  normalizeOshaCase,
  OshaCase,
  summarizeAnnualCases
} from "../../../shared/osha-recordkeeping";
import {
  exportInspectionPacketPdf,
  exportOsha300ASummaryPdf
} from "../../../shared/osha-pdf";

@Component({
  standalone: true,
  selector: "app-osha-300a-summary",
  templateUrl: "./osha-300a-summary.component.html",
  styleUrls: ["./osha-300a-summary.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    MatSnackBarModule
  ]
})
export class Osha300ASummaryComponent implements OnInit, OnDestroy {
  private subscription?: Subscription;
  loading = true;
  saving = false;
  selectedYear = new Date().getFullYear();
  cases: OshaCase[] = [];
  certification = {
    certifierName: "",
    certifierTitle: "",
    certifiedAt: ""
  };

  constructor(
    public accountService: AccountService,
    private snackbar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.subscription = this.accountService.teamMembersObservable.subscribe(members => {
      if (!members || !this.accountService.aTeam?.id) return;

      const reportQuery = query(
        collection(this.accountService.db, "incident-report"),
        where("teamId", "==", this.accountService.aTeam.id),
        orderBy("createdAt", "desc")
      );

      collectionData(reportQuery, { idField: "id" }).subscribe(reports => {
        this.cases = (reports as IncidentReportLike[]).map(report => {
          const user = members.find(member => member.id === report.submittedBy);
          return normalizeOshaCase(report, this.accountService.aTeam, user);
        });
        this.selectedYear = this.availableYears[0] || this.selectedYear;
        this.loadCertification();
        this.loading = false;
      });
    });
  }

  get availableYears(): number[] {
    return [...new Set(this.cases.map(item => item.calendarYear))].sort((a, b) => b - a);
  }

  get recordableCasesForYear(): OshaCase[] {
    return this.cases.filter(item => item.calendarYear === this.selectedYear && item.isRecordable);
  }

  get pendingReviewCount(): number {
    return this.cases.filter(item => item.calendarYear === this.selectedYear && item.requiresReview).length;
  }

  get summary() {
    return {
      ...summarizeAnnualCases(this.recordableCasesForYear),
      year: this.selectedYear
    };
  }

  loadCertification(): void {
    const certifications = (this.accountService.aTeam as any)?.oshaAnnualSummaryCertifications || {};
    this.certification = {
      certifierName: certifications?.[this.selectedYear]?.certifierName || "",
      certifierTitle: certifications?.[this.selectedYear]?.certifierTitle || "",
      certifiedAt: certifications?.[this.selectedYear]?.certifiedAt || ""
    };
  }

  async saveCertification(): Promise<void> {
    if (!this.accountService.aTeam?.id) return;
    this.saving = true;
    try {
      await updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}`), {
        [`oshaAnnualSummaryCertifications.${this.selectedYear}`]: this.certification
      });
      this.snackbar.open("300A certification saved", undefined, { duration: 2500 });
    } catch (error) {
      console.error("Error saving certification:", error);
      this.snackbar.open("Failed to save certification", undefined, { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  exportSummary(): void {
    exportOsha300ASummaryPdf(this.accountService.aTeam, this.summary, this.certification);
  }

  exportInspectionPacket(): void {
    exportInspectionPacketPdf(this.accountService.aTeam, this.summary, this.recordableCasesForYear);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
