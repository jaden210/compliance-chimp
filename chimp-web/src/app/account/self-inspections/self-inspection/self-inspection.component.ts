import { Component } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule } from "@angular/router";
import { SelfInspectionsService, Inspection, DeleteInspectionDialog, SelfInspection } from "../self-inspections.service";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { jsPDF } from "jspdf";
import { Location } from "@angular/common";
import { Subscription } from "rxjs";
import { AccountService } from "../../account.service";

@Component({
  standalone: true,
  selector: "app-self-inspection",
  templateUrl: "./self-inspection.component.html",
  styleUrls: ["./self-inspection.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  providers: [DatePipe]
})
export class SelfInspectionComponent {

  subscription: Subscription;
  inProgressInspections: Inspection[] = [];
  completedInspections: Inspection[] = [];
  selfInspection: SelfInspection;
  selfInspectionInspections: Inspection[];
  
  // Dashboard computed properties
  status: 'overdue' | 'dueSoon' | 'ok' | 'neverRun' = 'neverRun';
  nextDueDate: Date | null = null;
  daysUntilDue: number | null = null;
  averageCompliance: number | null = null;

  constructor(
    private accountService: AccountService,
    public selfInspectionsService: SelfInspectionsService,
    private snackbar: MatSnackBar,
    private location: Location,
    private router: Router,
    private route: ActivatedRoute,
    public dialog: MatDialog,
    private datePipe: DatePipe
  ) {
    this.subscription = this.accountService.aTeamObservable.subscribe(team => {
      if (team) {
        this.route.paramMap.subscribe((params: ParamMap) => {
          let selfInspectionId = params.get("selfInspectionId");
          this.selfInspectionsService.getSelfInspection(selfInspectionId, team.id).subscribe(selfInspection => {
            this.selfInspection = selfInspection;
            this.calculateDashboardMetrics();
            
            this.selfInspectionsService.getInspections(selfInspectionId).subscribe(inspections => {
              this.selfInspectionInspections = inspections;
              this.inProgressInspections = [];
              this.completedInspections = [];
              inspections.forEach(inspection => {
                if (inspection.completedAt) {
                  this.completedInspections.push(inspection);
                } else {
                  this.inProgressInspections.push(inspection);
                }
              });
              this.calculateAverageCompliance();
            });
          });
        });
      }
    });
  }

  private calculateDashboardMetrics(): void {
    if (!this.selfInspection) return;

    const lastCompleted = this.selfInspection.lastCompletedAt;
    const frequency = this.selfInspection.inspectionExpiration;

    if (!lastCompleted) {
      this.status = 'neverRun';
      this.nextDueDate = null;
      this.daysUntilDue = null;
      return;
    }

    if (!frequency || frequency === 'Manual') {
      this.status = 'ok';
      this.nextDueDate = null;
      this.daysUntilDue = null;
      return;
    }

    const lastDate = lastCompleted?.toDate ? lastCompleted.toDate() : new Date(lastCompleted);
    this.nextDueDate = this.calculateNextDueDate(lastDate, frequency);
    
    const now = new Date();
    const diffTime = this.nextDueDate.getTime() - now.getTime();
    this.daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (this.daysUntilDue < 0) {
      this.status = 'overdue';
    } else if (this.daysUntilDue <= 14) {
      this.status = 'dueSoon';
    } else {
      this.status = 'ok';
    }
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

  private calculateAverageCompliance(): void {
    if (!this.completedInspections || this.completedInspections.length === 0) {
      this.averageCompliance = null;
      return;
    }

    const total = this.completedInspections.reduce((sum, inspection) => {
      return sum + (inspection.compliantPercent || 0);
    }, 0);
    
    this.averageCompliance = Math.round(total / this.completedInspections.length);
  }

  formatDate(date: any): string {
    if (!date) return '';
    const d = date?.toDate ? date.toDate() : new Date(date);
    return this.datePipe.transform(d, 'mediumDate') || '';
  }

  getStatusLabel(): string {
    switch (this.status) {
      case 'overdue': return 'Overdue';
      case 'dueSoon': return 'Due Soon';
      case 'neverRun': return 'Never Run';
      default: return 'On Track';
    }
  }

  startSelfInspection() {
    this.selfInspectionsService.startInspection(this.selfInspection).then(newInspection => {
      this.resumeSelfInspection(newInspection);
    });
  }
  
  resumeSelfInspection(inspection) {
    this.router.navigate([inspection.id], { relativeTo: this.route });
  }

  getCompliantOfTotal(inspection: any): number {
    if (!inspection.completedPercent) return 0;
    const compliantPercent = inspection.compliantPercent || 0;
    // compliantPercent is % of answered questions, convert to % of total
    return Math.round((compliantPercent / 100) * inspection.completedPercent);
  }

  getNonCompliantOfTotal(inspection: any): number {
    if (!inspection.completedPercent) return 0;
    const compliantOfTotal = this.getCompliantOfTotal(inspection);
    return inspection.completedPercent - compliantOfTotal;
  }

  editSelfInspection() {
    this.router.navigate(['edit'], { relativeTo: this.route });
  }

  deleteSelfInspection() {
    let dialog = this.dialog.open(DeleteInspectionDialog);
    dialog.afterClosed().subscribe(bDelete => {
      if (bDelete) {
        this.selfInspectionsService.deleteSelfInspection(this.selfInspection, this.selfInspectionInspections).then(() => {
          this.leave();
        })
        .catch(error => {
          let snackbar = this.snackbar.open("Error deleting self-inspection...", null, {
            duration: 3000
          });
          console.log(error);
        });
      }
    });
  }

  leave() {
    this.subscription.unsubscribe();
    this.router.navigate([`/account/self-inspections`]);
  }

  async export(si: Inspection) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: [8.5, 11]
    });
    
    const margin = 0.6;
    const pageWidth = 8.5;
    const pageHeight = 11;
    const contentWidth = pageWidth - (margin * 2);
    const startY = 0.8;
    const endY = pageHeight - 0.6;
    const lineHeight = 0.18;
    
    // Colors
    const primaryColor = "#1a5a96";
    const successColor = "#2e7d32";
    const warningColor = "#ed6c02";
    const textPrimary = "#1a1a1a";
    const textSecondary = "#5f6368";
    const bgLight = "#f8f9fa";
    const borderColor = "#e0e0e0";
    
    let y = startY;
    let pageNumber = 1;
    
    const addPageNumber = () => {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(textSecondary);
      doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 0.35, { align: 'center' });
    };
    
    const checkPageBreak = (neededSpace: number = lineHeight) => {
      if (y + neededSpace > endY) {
        addPageNumber();
        doc.addPage();
        pageNumber++;
        y = startY;
      }
    };
    
    const wrapText = (text: string, fontSize: number, maxWidth: number): string[] => {
      doc.setFontSize(fontSize);
      return doc.splitTextToSize(text, maxWidth);
    };
    
    const drawRoundedRect = (x: number, yPos: number, w: number, h: number, r: number, fillColor?: string, strokeColor?: string) => {
      if (fillColor) {
        doc.setFillColor(fillColor);
      }
      if (strokeColor) {
        doc.setDrawColor(strokeColor);
      }
      doc.roundedRect(x, yPos, w, h, r, r, fillColor && strokeColor ? 'FD' : (fillColor ? 'F' : 'S'));
    };

    // Format date
    const completedDate = si.completedAt instanceof Date 
      ? si.completedAt 
      : si.completedAt?.toDate ? si.completedAt.toDate() : new Date(si.completedAt);
    const formattedDate = completedDate.toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    // Calculate stats
    let totalQuestions = 0;
    let answeredQuestions = 0;
    let compliantAnswers = 0;
    for (const cat of si.categories) {
      for (const q of cat.questions) {
        totalQuestions++;
        if (q.answer !== undefined) {
          answeredQuestions++;
          const expectedAnswer = q.expectedAnswer === false ? false : true;
          if (q.answer === expectedAnswer) compliantAnswers++;
        }
      }
    }
    const completionRate = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;
    const complianceRate = answeredQuestions > 0 ? Math.round((compliantAnswers / answeredQuestions) * 100) : 0;

    // ===== HEADER SECTION =====
    // Header background
    drawRoundedRect(margin, y - 0.15, contentWidth, 0.9, 0.08, primaryColor);
    
    // Title
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#ffffff");
    doc.text("Self-Inspection Report", margin + 0.2, y + 0.15);
    
    // Inspection name
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(this.selfInspection.title, margin + 0.2, y + 0.4);
    
    // Date
    doc.setFontSize(10);
    doc.text(`Completed: ${formattedDate}`, margin + 0.2, y + 0.6);
    
    y += 1.0;

    // ===== SUMMARY CARDS =====
    const cardWidth = (contentWidth - 0.2) / 3;
    const cardHeight = 0.7;
    const cardY = y;
    
    // Completion Card
    drawRoundedRect(margin, cardY, cardWidth, cardHeight, 0.06, bgLight);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textSecondary);
    doc.text("COMPLETION", margin + 0.15, cardY + 0.22);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textPrimary);
    doc.text(`${completionRate}%`, margin + 0.15, cardY + 0.5);
    
    // Compliance Card
    const card2X = margin + cardWidth + 0.1;
    drawRoundedRect(card2X, cardY, cardWidth, cardHeight, 0.06, bgLight);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textSecondary);
    doc.text("COMPLIANCE", card2X + 0.15, cardY + 0.22);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(complianceRate >= 80 ? successColor : warningColor);
    doc.text(`${complianceRate}%`, card2X + 0.15, cardY + 0.5);
    
    // Questions Card
    const card3X = margin + (cardWidth + 0.1) * 2;
    drawRoundedRect(card3X, cardY, cardWidth, cardHeight, 0.06, bgLight);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textSecondary);
    doc.text("QUESTIONS", card3X + 0.15, cardY + 0.22);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textPrimary);
    doc.text(`${answeredQuestions}/${totalQuestions}`, card3X + 0.15, cardY + 0.5);
    
    y += cardHeight + 0.4;

    // ===== QUESTIONS SECTION =====
    for (const category of si.categories) {
      checkPageBreak(0.8);
      
      // Category header bar
      drawRoundedRect(margin, y, contentWidth, 0.35, 0.04, primaryColor);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor("#ffffff");
      doc.text(category.subject.toUpperCase(), margin + 0.15, y + 0.23);
      y += 0.5;
      
      // Questions
      for (const question of category.questions) {
        checkPageBreak(0.6);
        
        // Question row background
        const questionStartY = y;
        
        // Determine compliance for this question
        const expectedAnswer = question.expectedAnswer === false ? false : true;
        const isCompliant = question.answer !== undefined && question.answer === expectedAnswer;
        const isNonCompliant = question.answer !== undefined && question.answer !== expectedAnswer;
        
        // Status indicator dot
        const dotX = margin + 0.12;
        const dotY = y + 0.08;
        const dotRadius = 0.06;
        
        if (question.answer === undefined) {
          doc.setDrawColor(borderColor);
          doc.setFillColor("#ffffff");
          doc.circle(dotX, dotY, dotRadius, 'FD');
        } else if (isCompliant) {
          doc.setFillColor(successColor);
          doc.circle(dotX, dotY, dotRadius, 'F');
        } else {
          doc.setFillColor(warningColor);
          doc.circle(dotX, dotY, dotRadius, 'F');
        }
        
        // Question text
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(textPrimary);
        const questionLines = wrapText(question.name, 10, contentWidth - 1.2);
        let questionTextY = y + 0.12;
        for (const line of questionLines) {
          checkPageBreak();
          doc.text(line, margin + 0.3, questionTextY);
          questionTextY += lineHeight;
        }
        
        // Answer badge
        const badgeX = pageWidth - margin - 0.6;
        const badgeY = y - 0.02;
        if (question.answer === undefined) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(textSecondary);
          doc.text("—", badgeX + 0.25, y + 0.1);
        } else {
          const badgeColor = isCompliant ? successColor : warningColor;
          drawRoundedRect(badgeX, badgeY, 0.5, 0.22, 0.04, badgeColor);
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor("#ffffff");
          doc.text(question.answer ? "YES" : "NO", badgeX + 0.12, y + 0.1);
        }
        
        y = questionTextY + 0.05;
        
        // Comment
        if (question.comment) {
          checkPageBreak(0.3);
          doc.setFontSize(9);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(textSecondary);
          const commentLines = wrapText(`"${question.comment}"`, 9, contentWidth - 0.6);
          for (const line of commentLines) {
            checkPageBreak();
            doc.text(line, margin + 0.3, y);
            y += lineHeight;
          }
          y += 0.05;
        }
        
        // Images
        if (question.images && question.images.length > 0) {
          const imageSize = 1.8;
          const imagesPerRow = 3;
          const imageSpacing = 0.15;
          
          for (let i = 0; i < question.images.length; i++) {
            try {
              const imageData = await getImage(question.images[i]);
              const col = i % imagesPerRow;
              const xPos = margin + 0.3 + (col * (imageSize + imageSpacing));
              
              if (col === 0) {
                checkPageBreak(imageSize + 0.2);
              }
              
              // Image border
              doc.setDrawColor(borderColor);
              doc.roundedRect(xPos - 0.03, y - 0.03, imageSize + 0.06, imageSize + 0.06, 0.04, 0.04, 'S');
              doc.addImage(imageData, "JPEG", xPos, y, imageSize, imageSize);
              
              if (col === imagesPerRow - 1 || i === question.images.length - 1) {
                y += imageSize + 0.2;
              }
            } catch (e) {
              console.error('Failed to load image:', e);
            }
          }
        }
        
        // Subtle separator line
        doc.setDrawColor(borderColor);
        doc.setLineWidth(0.003);
        doc.line(margin + 0.3, y, pageWidth - margin, y);
        y += 0.15;
      }
      
      y += 0.2;
    }
    
    // Add page number to last page
    addPageNumber();
    
    const filename = `${this.selfInspection.title} - ${completedDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}.pdf`;
    doc.save(filename);
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
