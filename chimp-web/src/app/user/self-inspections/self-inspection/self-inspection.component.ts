import { Component, inject, DestroyRef } from "@angular/core";
import { CommonModule, DatePipe, Location } from "@angular/common";
import { RouterModule, Router, ActivatedRoute, ParamMap } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SelfInspectionsService, Inspection, SelfInspection } from "../self-inspections.service";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { jsPDF } from "jspdf";
import { UserService } from "../../user.service";

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
  private readonly userService = inject(UserService);
  readonly selfInspectionsService = inject(SelfInspectionsService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  inProgressInspections: Inspection[] = [];
  completedInspections: Inspection[] = [];
  selfInspection: SelfInspection;
  selfInspectionInspections: Inspection[];
  loading: boolean = true;

  constructor() {
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team) {
          this.route.paramMap
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((params: ParamMap) => {
              const selfInspectionId = params.get("selfInspectionId");
              this.selfInspectionsService.getSelfInspection(selfInspectionId, team.id)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(selfInspection => {
                  this.selfInspection = selfInspection;
                  this.selfInspectionsService.getInspections(selfInspectionId)
                    .pipe(takeUntilDestroyed(this.destroyRef))
                    .subscribe(inspections => {
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
                      this.loading = false;
                    });
                });
            });
        }
      });
  }

  startSelfInspection() {
    this.selfInspectionsService.startInspection(this.selfInspection).then(newInspection => {
      this.resumeSelfInspection(newInspection);
    });
  }

  resumeSelfInspection(inspection: Inspection) {
    this.router.navigate([inspection.id], { relativeTo: this.route });
  }

  editSelfInspection() {
    this.router.navigate(['edit'], { relativeTo: this.route });
  }

  leave() {
    this.router.navigate([`/user/self-inspections`]);
  }

  async export(si: Inspection) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: [8.5, 11]
    });

    const margin = 0.75;
    const pageWidth = 8.5;
    const pageHeight = 11;
    const contentWidth = pageWidth - (margin * 2);
    const startY = margin;
    const endY = pageHeight - margin;
    const lineHeight = 0.2;

    let y = startY;

    const checkPageBreak = (neededSpace: number = lineHeight) => {
      if (y + neededSpace > endY) {
        doc.addPage();
        y = startY;
      }
    };

    const wrapText = (text: string, fontSize: number, maxWidth: number): string[] => {
      doc.setFontSize(fontSize);
      return doc.splitTextToSize(text, maxWidth);
    };

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#054d8a");
    doc.text(this.selfInspection.title, margin, y);
    y += lineHeight * 1.5;

    // Completion date
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#666666");
    const completedDate = si.completedAt instanceof Date
      ? si.completedAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : new Date(si.completedAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Completed: ${completedDate}`, margin, y);
    y += lineHeight * 2;

    // Divider line
    doc.setDrawColor("#cccccc");
    doc.line(margin, y, pageWidth - margin, y);
    y += lineHeight;

    // Process each category
    for (const category of si.categories) {
      checkPageBreak(lineHeight * 2);

      // Category header
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor("#054d8a");
      y += lineHeight;
      doc.text(category.subject, margin, y);
      y += lineHeight * 1.2;

      // Questions in this category
      for (const question of category.questions) {
        checkPageBreak(lineHeight * 3);

        // Question text
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor("#333333");
        const questionLines = wrapText(question.name, 10, contentWidth - 0.5);
        for (const line of questionLines) {
          checkPageBreak();
          doc.text(line, margin + 0.2, y);
          y += lineHeight;
        }

        // Answer
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        if (question.answer === undefined) {
          doc.setTextColor("#999999");
          doc.text("○ Not answered", margin + 0.3, y);
        } else if (question.answer) {
          doc.setTextColor("#4caf50");
          doc.text("✓ YES", margin + 0.3, y);
        } else {
          doc.setTextColor("#ff9800");
          doc.text("✗ NO", margin + 0.3, y);
        }
        y += lineHeight;

        // Comment if present
        if (question.comment) {
          doc.setFontSize(9);
          doc.setFont("helvetica", "italic");
          doc.setTextColor("#666666");
          const commentLines = wrapText(`Note: ${question.comment}`, 9, contentWidth - 0.6);
          for (const line of commentLines) {
            checkPageBreak();
            doc.text(line, margin + 0.4, y);
            y += lineHeight;
          }
        }

        // Images if present
        if (question.images && question.images.length > 0) {
          const imageSize = 2.5;
          const imagesPerRow = 2;
          const imageSpacing = 0.25;

          for (let i = 0; i < question.images.length; i++) {
            try {
              const imageData = await getImage(question.images[i]);
              const col = i % imagesPerRow;
              const xPos = margin + 0.3 + (col * (imageSize + imageSpacing));

              if (col === 0) {
                checkPageBreak(imageSize + lineHeight);
              }

              doc.addImage(imageData, "JPEG", xPos, y, imageSize, imageSize);

              if (col === imagesPerRow - 1 || i === question.images.length - 1) {
                y += imageSize + lineHeight;
              }
            } catch (e) {
              console.error('Failed to load image:', e);
            }
          }
        }

        y += lineHeight * 0.5;
      }

      // Category divider
      y += lineHeight * 0.5;
      doc.setDrawColor("#eeeeee");
      doc.line(margin, y, pageWidth - margin, y);
      y += lineHeight;
    }

    // Add chimp logo at the bottom
    try {
      const logoData = await getImage('/assets/chimp.png');
      const logoWidth = 1.0;
      const logoHeight = 1.4;
      const logoX = (pageWidth - logoWidth) / 2;
      checkPageBreak(logoHeight + 0.3);
      doc.addImage(logoData, "PNG", logoX, y + 0.2, logoWidth, logoHeight);
    } catch (e) {
      console.error('Failed to load chimp logo:', e);
    }

    doc.save(`${this.selfInspection.title} - ${completedDate}.pdf`);
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
