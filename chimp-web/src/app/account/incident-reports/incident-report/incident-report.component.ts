import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { AccountService } from "../../account.service";
import { Subscription, combineLatest, filter, take } from "rxjs";
import { doc, getDoc, deleteDoc, collection, collectionData, query, where } from "@angular/fire/firestore";
import { jsPDF } from "jspdf";

@Component({
  standalone: true,
  selector: "app-incident-report",
  templateUrl: "./incident-report.component.html",
  styleUrls: ["./incident-report.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatProgressBarModule
  ],
  providers: [DatePipe]
})
export class IncidentReportComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  report: any = null;
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public accountService: AccountService,
    private snackbar: MatSnackBar
  ) {}

  ngOnInit() {
    this.subscription = this.route.params.subscribe(params => {
      const reportId = params['reportId'];
      if (reportId) {
        this.loadReport(reportId);
      }
    });
  }

  async loadReport(reportId: string) {
    this.loading = true;
    try {
      const reportDoc = await getDoc(doc(this.accountService.db, `incident-report/${reportId}`));
      if (reportDoc.exists()) {
        this.report = { id: reportDoc.id, ...reportDoc.data() };
        
        // Convert createdAt timestamp
        if (this.report.createdAt?.toDate) {
          this.report.createdAt = this.report.createdAt.toDate();
        }

        // Wait for team members to be loaded, then get user info
        if (this.report.submittedBy) {
          combineLatest([
            this.accountService.teamMembersObservable,
            this.accountService.aTeamObservable
          ]).pipe(
            filter(([members, team]) => !!members && members.length > 0 && !!team),
            take(1)
          ).subscribe(([members, team]) => {
            // Get user info
            this.report.user = members.find(
              (user: any) => user.id === this.report.submittedBy
            );

            // Get previous reports count
            const reportsQuery = query(
              collection(this.accountService.db, "incident-report"),
              where("teamId", "==", team.id),
              where("submittedBy", "==", this.report.submittedBy)
            );
            collectionData(reportsQuery, { idField: "id" }).pipe(take(1)).subscribe(allReports => {
              this.report.previousReports = allReports;
            });
          });
        }
      }
    } catch (error) {
      console.error('Error loading report:', error);
    }
    this.loading = false;
  }

  leave() {
    this.router.navigate(['../'], { relativeTo: this.route });
  }

  delete() {
    if (this.report?.id) {
      const snackbarRef = this.snackbar.open("Deleting report...", "Undo", {
        duration: 6000
      });
      snackbarRef.afterDismissed().subscribe(action => {
        if (!action.dismissedByAction) {
          deleteDoc(doc(this.accountService.db, `incident-report/${this.report.id}`))
            .then(() => this.leave());
        }
      });
      snackbarRef.onAction().subscribe(() => {
        snackbarRef.dismiss();
      });
    }
  }

  async export() {
    if (!this.report?.questions) return;

    const pdfDoc = new jsPDF({
      orientation: "portrait",
      unit: "in",
      format: [8.5, 11]
    });

    const startOfPage = 0.75;
    const endOfPage = 10.25;
    const lineSpace = 0.22;
    const sectionGap = 0.3;
    const maxWidth = 7.0; // inches for text wrapping
    const leftMargin = 0.5;
    const answerIndent = 0.7;
    const imageWidth = 2.5;
    const imageHeight = 2.5;

    let y = startOfPage;

    // Helper to add a new page if needed
    const checkPageBreak = (neededSpace: number = lineSpace) => {
      if (y + neededSpace > endOfPage) {
        pdfDoc.addPage();
        y = startOfPage;
      }
    };

    // Title
    pdfDoc.setFontSize(18);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text(this.report.type || "Incident Report", leftMargin, y);
    y += lineSpace * 1.8;

    // Company name
    if (this.accountService.aTeam?.name) {
      pdfDoc.setFontSize(12);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(this.accountService.aTeam.name, leftMargin, y);
      y += lineSpace * 1.2;
    }

    // Date and submitter info
    pdfDoc.setFontSize(11);
    pdfDoc.setFont("helvetica", "normal");
    const dateStr = this.report.createdAt instanceof Date 
      ? this.report.createdAt.toLocaleDateString() + ' at ' + this.report.createdAt.toLocaleTimeString()
      : String(this.report.createdAt || '');
    pdfDoc.text(`Date: ${dateStr}`, leftMargin, y);
    y += lineSpace;
    
    if (this.report.user?.name) {
      pdfDoc.text(`Reported by: ${this.report.user.name}`, leftMargin, y);
      y += lineSpace;
      if (this.report.user?.jobTitle) {
        pdfDoc.text(`Job Title: ${this.report.user.jobTitle}`, leftMargin, y);
        y += lineSpace;
      }
    }
    
    y += sectionGap;

    // Questions and answers
    for (let index = 0; index < this.report.questions.length; index++) {
      const item = this.report.questions[index];
      
      checkPageBreak(lineSpace * 4);

      // Question number and text
      pdfDoc.setFontSize(10);
      pdfDoc.setFont("helvetica", "bold");
      const questionText = `${index + 1}. ${item.description || ''}`;
      const questionLines = pdfDoc.splitTextToSize(questionText, maxWidth);
      
      questionLines.forEach((line: string) => {
        pdfDoc.text(line, leftMargin, y);
        y += lineSpace;
        checkPageBreak();
      });
      
      y += 0.08; // Small gap before answer
      
      // Answer
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.setFontSize(10);
      
      if (item.type === 'signature' && item.value) {
        // Handle signature as image
        checkPageBreak(1.2);
        try {
          pdfDoc.addImage(item.value, "PNG", answerIndent, y, 2.5, 1);
          y += 1.1;
        } catch (e) {
          pdfDoc.setTextColor(100);
          pdfDoc.text("[Signature image could not be loaded]", answerIndent, y);
          pdfDoc.setTextColor(0);
          y += lineSpace;
        }
      } else if (item.type === 'photos' && Array.isArray(item.value) && item.value.length > 0) {
        // Handle photos - add each image
        for (const photo of item.value) {
          if (photo.imageUrl) {
            checkPageBreak(imageHeight + 0.2);
            try {
              pdfDoc.addImage(photo.imageUrl, "JPEG", answerIndent, y, imageWidth, imageHeight);
              y += imageHeight + 0.15;
            } catch (e) {
              pdfDoc.setTextColor(100);
              pdfDoc.text("[Photo could not be loaded]", answerIndent, y);
              pdfDoc.setTextColor(0);
              y += lineSpace;
            }
          }
        }
      } else if (item.type === 'date' && item.value) {
        // Handle date values
        let dateValue = item.value;
        if (dateValue?.toDate) {
          dateValue = dateValue.toDate();
        }
        const formatted = dateValue instanceof Date 
          ? dateValue.toLocaleDateString()
          : String(dateValue);
        pdfDoc.text(formatted, answerIndent, y);
        y += lineSpace;
      } else {
        // Handle text/radio values
        const answer = item.value || '—';
        const answerLines = pdfDoc.splitTextToSize(String(answer), maxWidth - 0.2);
        answerLines.forEach((line: string) => {
          pdfDoc.text(line, answerIndent, y);
          y += lineSpace;
          checkPageBreak();
        });
      }
      
      y += sectionGap;
    }

    // Add chimp logo at the bottom
    try {
      const logoData = await getImage('/assets/chimp.png');
      const logoWidth = 1.0;
      const logoHeight = 1.4;
      const logoX = (8.5 - logoWidth) / 2;
      checkPageBreak(logoHeight + 0.3);
      pdfDoc.addImage(logoData, "PNG", logoX, y + 0.2, logoWidth, logoHeight);
    } catch (e) {
      console.error('Failed to load chimp logo:', e);
    }

    // Save the PDF
    const filename = (this.report.type || 'incident-report').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    pdfDoc.save(`${filename}.pdf`);
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }
}

async function getImage(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}
