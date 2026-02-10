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

    // Show loading state
    this.snackbar.open("Generating PDF...", undefined, { duration: 0 });

    const pdfDoc = new jsPDF({
      orientation: "portrait",
      unit: "in",
      format: [8.5, 11]
    });

    const pageWidth = 8.5;
    const startOfPage = 0.75;
    const endOfPage = 10.25;
    const lineSpace = 0.2;
    const sectionGap = 0.25;
    const maxWidth = 7.0;
    const leftMargin = 0.75;
    const contentWidth = pageWidth - (leftMargin * 2);

    let y = startOfPage;

    // Helper to add a new page if needed
    const checkPageBreak = (neededSpace: number = lineSpace) => {
      if (y + neededSpace > endOfPage) {
        pdfDoc.addPage();
        y = startOfPage;
        return true;
      }
      return false;
    };

    // Draw a horizontal divider line
    const drawDivider = () => {
      pdfDoc.setDrawColor(200, 200, 200);
      pdfDoc.setLineWidth(0.01);
      pdfDoc.line(leftMargin, y, leftMargin + contentWidth, y);
      y += 0.15;
    };

    // --- HEADER SECTION ---
    // Title with accent color
    pdfDoc.setFontSize(24);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setTextColor(5, 77, 138); // Chimp primary blue
    pdfDoc.text(this.report.type || "Incident Report", leftMargin, y);
    y += lineSpace * 2;

    // Reset text color
    pdfDoc.setTextColor(0, 0, 0);

    // Company name
    if (this.accountService.aTeam?.name) {
      pdfDoc.setFontSize(14);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(this.accountService.aTeam.name, leftMargin, y);
      y += lineSpace * 1.5;
    }

    y += 0.1;
    drawDivider();

    // --- INFO BOX ---
    const boxTop = y;
    const boxPadding = 0.15;
    const jobTitleX = leftMargin + 5;
    const jobTitleMaxWidth = leftMargin + contentWidth - jobTitleX - boxPadding;

    // Pre-calculate job title lines to determine box height
    let jobTitleLines: string[] = [];
    if (this.report.user?.jobTitle) {
      pdfDoc.setFontSize(11);
      pdfDoc.setFont("helvetica", "bold");
      jobTitleLines = pdfDoc.splitTextToSize(this.report.user.jobTitle, jobTitleMaxWidth);
    }
    const extraJobTitleLines = Math.max(0, jobTitleLines.length - 1);
    const boxHeight = 0.9 + (extraJobTitleLines * lineSpace);

    pdfDoc.setFillColor(248, 249, 250);
    pdfDoc.roundedRect(leftMargin, y, contentWidth, boxHeight, 0.1, 0.1, 'F');
    y += boxPadding + 0.1;

    // Date reported
    pdfDoc.setFontSize(10);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setTextColor(100, 100, 100);
    pdfDoc.text("Date Reported", leftMargin + boxPadding, y);
    pdfDoc.text("Reported By", leftMargin + 2.5, y);
    if (this.report.user?.jobTitle) {
      pdfDoc.text("Job Title", jobTitleX, y);
    }
    y += lineSpace;

    pdfDoc.setFontSize(11);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setTextColor(0, 0, 0);
    const dateStr = this.report.createdAt instanceof Date 
      ? this.report.createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : String(this.report.createdAt || '');
    pdfDoc.text(dateStr, leftMargin + boxPadding, y);
    pdfDoc.text(this.report.user?.name || 'Unknown', leftMargin + 2.5, y);
    if (jobTitleLines.length > 0) {
      pdfDoc.text(jobTitleLines, jobTitleX, y);
    }

    y = boxTop + boxHeight + sectionGap;

    // --- QUESTIONS SECTION ---
    pdfDoc.setFontSize(14);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setTextColor(5, 77, 138);
    pdfDoc.text("Incident Details", leftMargin, y);
    pdfDoc.setTextColor(0, 0, 0);
    y += lineSpace * 1.5;

    // Questions and answers
    for (let index = 0; index < this.report.questions.length; index++) {
      const item = this.report.questions[index];
      
      checkPageBreak(lineSpace * 5);

      // Question number badge - properly centered
      const numStr = String(index + 1);
      const circleRadius = 0.12;
      const circleX = leftMargin + circleRadius;
      const circleY = y - 0.04;
      
      pdfDoc.setFillColor(5, 77, 138);
      pdfDoc.circle(circleX, circleY, circleRadius, 'F');
      
      // Center the number text in the circle
      pdfDoc.setFontSize(numStr.length > 1 ? 7 : 9);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.setTextColor(255, 255, 255);
      const numWidth = pdfDoc.getTextWidth(numStr);
      pdfDoc.text(numStr, circleX - (numWidth / 2), circleY + 0.03);
      pdfDoc.setTextColor(0, 0, 0);

      // Question text
      pdfDoc.setFontSize(11);
      pdfDoc.setFont("helvetica", "bold");
      const questionText = item.description || '';
      const questionLines = pdfDoc.splitTextToSize(questionText, maxWidth - 0.5);
      
      questionLines.forEach((line: string, lineIndex: number) => {
        if (lineIndex > 0) checkPageBreak();
        pdfDoc.text(line, leftMargin + 0.35, y);
        y += lineSpace;
      });
      
      y += 0.08;
      
      // Answer
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.setFontSize(10);
      
      if (item.type === 'signature' && item.value) {
        // Handle signature - may be base64 or URL
        checkPageBreak(1.2);
        try {
          // Get the signature data (fetch if URL, use directly if base64)
          const signatureData = await getImage(item.value);
          
          // Get dimensions and maintain aspect ratio
          const dims = await getImageDimensions(signatureData);
          const maxSigWidth = 3.5;
          const maxSigHeight = 1.0;
          const fitted = fitImageToBounds(dims.width, dims.height, maxSigWidth, maxSigHeight);
          
          // Draw a light border around signature area
          pdfDoc.setDrawColor(220, 220, 220);
          pdfDoc.setFillColor(255, 255, 255);
          pdfDoc.setLineWidth(0.01);
          pdfDoc.roundedRect(leftMargin + 0.35, y, fitted.width + 0.1, fitted.height + 0.1, 0.05, 0.05, 'FD');
          pdfDoc.addImage(signatureData, "PNG", leftMargin + 0.4, y + 0.05, fitted.width, fitted.height);
          y += fitted.height + 0.2;
        } catch (e) {
          console.error('Failed to load signature:', e);
          // Draw empty signature box as fallback
          pdfDoc.setDrawColor(220, 220, 220);
          pdfDoc.setFillColor(250, 250, 250);
          pdfDoc.roundedRect(leftMargin + 0.35, y, 3, 0.6, 0.05, 0.05, 'FD');
          pdfDoc.setTextColor(180, 180, 180);
          pdfDoc.setFontSize(9);
          pdfDoc.text("Signature on file", leftMargin + 0.5, y + 0.35);
          pdfDoc.setTextColor(0, 0, 0);
          y += 0.7;
        }
      } else if (item.type === 'photos' && Array.isArray(item.value) && item.value.length > 0) {
        // Handle photos - fetch, convert to base64, and maintain aspect ratio
        const maxPhotoWidth = 2.0;
        const maxPhotoHeight = 2.5;
        const photoGap = 0.15;
        let photoX = leftMargin + 0.35;
        let currentRowHeight = 0;
        let photosInRow = 0;
        const maxPhotosPerRow = 3;

        for (const photo of item.value) {
          if (photo.imageUrl) {
            try {
              // Fetch image and convert to base64
              const imageData = await getImage(photo.imageUrl);
              
              // Get actual dimensions and calculate fitted size
              const dims = await getImageDimensions(imageData);
              const fitted = fitImageToBounds(dims.width, dims.height, maxPhotoWidth, maxPhotoHeight);
              
              // Check if we need a new row
              if (photosInRow >= maxPhotosPerRow || (photoX + fitted.width > leftMargin + contentWidth)) {
                y += currentRowHeight + photoGap;
                photoX = leftMargin + 0.35;
                photosInRow = 0;
                currentRowHeight = 0;
              }
              
              checkPageBreak(fitted.height + 0.3);
              
              // Draw photo with border
              pdfDoc.setDrawColor(220, 220, 220);
              pdfDoc.setLineWidth(0.015);
              pdfDoc.roundedRect(photoX, y, fitted.width + 0.1, fitted.height + 0.1, 0.05, 0.05, 'S');
              pdfDoc.addImage(imageData, "JPEG", photoX + 0.05, y + 0.05, fitted.width, fitted.height);
              
              // Track the tallest photo in this row
              currentRowHeight = Math.max(currentRowHeight, fitted.height + 0.1);
              
              photoX += fitted.width + 0.1 + photoGap;
              photosInRow++;
            } catch (e) {
              console.error('Failed to load photo:', e);
            }
          }
        }
        
        // Move past the last row of photos
        if (photosInRow > 0) {
          y += currentRowHeight + photoGap;
        }
      } else if (item.type === 'date' && item.value) {
        // Handle date values
        let dateValue = item.value;
        if (dateValue?.toDate) {
          dateValue = dateValue.toDate();
        }
        const formatted = dateValue instanceof Date 
          ? dateValue.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
          : String(dateValue);
        
        // Answer in a subtle box
        pdfDoc.setFillColor(252, 252, 252);
        const textWidth = pdfDoc.getTextWidth(formatted) + 0.3;
        pdfDoc.roundedRect(leftMargin + 0.35, y - 0.12, textWidth, 0.25, 0.05, 0.05, 'F');
        pdfDoc.text(formatted, leftMargin + 0.5, y);
        y += lineSpace + 0.1;
      } else {
        // Handle text/radio values
        const answer = item.value || '—';
        
        // Draw answer in a light background box
        pdfDoc.setFillColor(252, 252, 252);
        const answerLines = pdfDoc.splitTextToSize(String(answer), maxWidth - 0.7);
        const boxHeight = (answerLines.length * lineSpace) + 0.15;
        pdfDoc.roundedRect(leftMargin + 0.35, y - 0.1, contentWidth - 0.45, boxHeight, 0.05, 0.05, 'F');
        
        y += 0.02;
        answerLines.forEach((line: string) => {
          checkPageBreak();
          pdfDoc.text(line, leftMargin + 0.45, y);
          y += lineSpace;
        });
        y += 0.05;
      }
      
      y += sectionGap;
    }

    // --- FOOTER ---
    // Add ComplianceChimp branding at the bottom
    checkPageBreak(1.2);
    y += 0.3;
    drawDivider();
    y += 0.2;

    try {
      const logoData = await getImage('/assets/ccLogoDark.png');
      const logoWidth = 1.8;
      const logoHeight = 0.5;
      const logoX = (pageWidth - logoWidth) / 2;
      pdfDoc.addImage(logoData, "PNG", logoX, y, logoWidth, logoHeight);
    } catch (e) {
      // Fallback text if logo fails
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(150, 150, 150);
      pdfDoc.text("ComplianceChimp", pageWidth / 2, y + 0.2, { align: 'center' });
    }

    // Close loading snackbar
    this.snackbar.dismiss();

    // Save the PDF with descriptive filename
    const type = this.report.type || 'Incident Report';
    const date = this.report.createdAt instanceof Date 
      ? this.report.createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '';
    const name = this.report.user?.name || '';
    const filenameParts = [type, date, name].filter(Boolean).join(' ');
    const filename = filenameParts.replace(/[^a-z0-9 ]/gi, '').replace(/\s+/g, '-');
    pdfDoc.save(`${filename}.pdf`);

    this.snackbar.open("PDF exported successfully", undefined, { duration: 3000 });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }
}

// Fetch image and convert to base64
async function getImage(imageUrl: string): Promise<string> {
  // If already base64, return as-is
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }
  
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

// Get image dimensions from base64 data
function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error('Failed to load image dimensions'));
    img.src = base64;
  });
}

// Calculate dimensions to fit within max bounds while maintaining aspect ratio
function fitImageToBounds(
  imgWidth: number, 
  imgHeight: number, 
  maxWidth: number, 
  maxHeight: number
): { width: number; height: number } {
  const aspectRatio = imgWidth / imgHeight;
  
  let width = maxWidth;
  let height = width / aspectRatio;
  
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }
  
  return { width, height };
}
