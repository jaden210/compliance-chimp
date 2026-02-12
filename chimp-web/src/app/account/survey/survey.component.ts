import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { SurveyService } from "./survey.service";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { AccountService, Team, TeamMember, User } from "../account.service";
import { Observable, Subscription, combineLatest, of } from "rxjs";
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { Location } from "@angular/common";
import { map, groupBy, flatMap, toArray, share, tap } from "rxjs/operators";
import { CreateSurveyDialogComponent } from "../surveys/create-survey-dialog/create-survey-dialog.component";
import { Survey, SurveyResponse } from "src/app/app.service";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { jsPDF } from "jspdf";

@Component({
  standalone: true,
  selector: "app-survey",
  templateUrl: "./survey.component.html",
  styleUrls: ["./survey.component.css"],
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  providers: [DatePipe]
})
export class SurveyComponent implements OnInit, OnDestroy {
  private team: Team;
  public teamMembers: TeamMember[];
  public users: User[];
  public tmGroup: any[] = [];
  public survey: Survey = new Survey();
  public sender: User;
  public responses: SurveyResponse[] = [];

  private subscription: Subscription;
  private todaysDatePiped: string;
  public title: string;
  public surveyResponseList: Observable<any[]>;
  public runType: string;
  public surveyResponseListLength: number;
  
  // Computed statistics
  public get responseRate(): number {
    if (!this.tmGroup?.length) return 0;
    return Math.round((this.responses.length / this.tmGroup.length) * 100);
  }

  public get yesCount(): number {
    return this.responses.filter(r => r.shortAnswer?.toLowerCase() === 'yes').length;
  }

  public get noCount(): number {
    return this.responses.filter(r => r.shortAnswer?.toLowerCase() === 'no').length;
  }

  public get yesPercent(): number {
    if (!this.responses.length) return 0;
    return Math.round((this.yesCount / this.responses.length) * 100);
  }

  public get noPercent(): number {
    if (!this.responses.length) return 0;
    return Math.round((this.noCount / this.responses.length) * 100);
  }

  public hasResponded(tmId: string): boolean {
    return this.responses.some(r => r.teamMemberId === tmId);
  }

  public hasContactInfo(tm: any): boolean {
    return !!(tm.phone || tm.email);
  }

  public formatDate(date: any): string {
    if (!date) return '';
    const jsDate = date.toDate ? date.toDate() : date;
    return this.datePipe.transform(jsDate, 'MMM d, y · h:mm a') || '';
  }

  public resendNotification(teamMember: any): void {
    teamMember.sending = true;
    const resendSurvey = httpsCallable(this.functions, "resendSurveyNotification");
    resendSurvey({ 
      teamMember: teamMember, 
      survey: this.survey,
      team: this.accountService.aTeam 
    }).then(() => {
      teamMember.sending = false;
      this.snackbar.open(`Notification sent to ${teamMember.name}`, null, { duration: 3000 });
    }).catch((error) => {
      teamMember.sending = false;
      console.error('Error sending notification:', error);
      this.snackbar.open('Failed to send notification', null, { duration: 3000 });
    });
  }

  private colors = [
    "#FF6F00",
    "#B71C1C",
    "#880E4F",
    "#4A148C",
    "#311B92",
    "#1A237E",
    "#01579B",
    "#006064",
    "#BF360C",
    "#1B5E20"
  ];

  constructor(
    private service: SurveyService,
    private snackbar: MatSnackBar,
    private accountService: AccountService,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private location: Location,
    private datePipe: DatePipe,
    private functions: Functions
  ) {
    this.todaysDatePiped = this.datePipe.transform(
      new Date(),
      "EEEE, MMM d, y"
    );
  }

  ngOnInit() {
    this.subscription = combineLatest([
      this.accountService.aTeamObservable,
      this.accountService.teamMembersObservable,
      this.accountService.teamManagersObservable,
    ]).subscribe(results => {
      const [team, teamMembers, users] = results;
      if (team && teamMembers) {
        this.team = team;
        this.teamMembers = teamMembers;
        this.users = users;
        this.route.paramMap.subscribe((params: ParamMap) => {
          let surveyId = params.get("surveyId");
          if (surveyId) {
            this.getSurvey(surveyId);
            this.getSurveyResponses(surveyId);
          }
        });
      }
    });
  }

  private getSurvey(surveyId): void {
    this.service.getSurvey(surveyId).subscribe(survey => {
      if (survey) {
        this.title = "/ " + survey.title;
        this.getGroup(survey.trainees);
        this.sender = this.users.find(u => u.id == survey.userId);
        survey.createdAt = survey.createdAt.toDate();
        this.survey = survey;
      } else {
        this.survey = null;
      }
    });
  }

  /* Builds all contacts of the survey and colors them */
  private getGroup(tmIds: string[]): void {
    this.tmGroup = [];
    let colorsMap = {};
    let colorsIndex = 0;
    tmIds.forEach(tmId => {
      let user = this.teamMembers.find(tm => tm.id == tmId);
      if (!user) {
        // Skip if team member is not found
        return;
      }
      if (colorsMap[tmId]) user["color"] = colorsMap[tmId];
      else {
        user["color"] = this.colors[colorsIndex];
        colorsMap[tmId] = this.colors[colorsIndex];
        colorsIndex =
          colorsIndex + 1 > this.colors.length - 1 ? 0 : colorsIndex + 1;
      }
      this.tmGroup.push(user);
    });
  }

  /* Grouping by date to show group date in template */
  private getSurveyResponses(surveyId): void {
   this.service.getSurveyResponses(surveyId).subscribe(responses => {
     responses.map(r => {
       let tIndex = this.survey.trainees.findIndex(t => t == r.teamMemberId);
       r['color'] = this.colors[tIndex];
       r['user'] = this.teamMembers.find(tm => tm.id == r.teamMemberId);
       return r;
     });
     this.responses = responses;
   })
      // .pipe(
      //   map(responses =>
      //     responses.map(response => {
      //       response["user"] = this.tmGroup.find(
      //         u => u.id == response.teamMemberId
      //       );
      //       response["groupByDate"] = this.getGroupByDate(response.createdAt);
      //       return response;
      //     })
      //   ),
      //   flatMap(recordings => {
      //     let r = of(recordings).pipe(
      //       flatMap(r => r),
      //       groupBy(sr => sr["groupByDate"]),
      //       flatMap(obs =>
      //         obs.pipe(
      //           toArray(),
      //           map(r => ({ date: r[0]["groupByDate"], responses: r }))
      //         )
      //       ),
      //       toArray()
      //     );
      //     return combineLatest(r, rr => {
      //       return rr;
      //     });
      //   }),
      //   tap(responses => (this.surveyResponseListLength = responses.length)),
      //   share()
      // ).subscribe(s => {
      //   console.log(s);
        
      // })
  }

  /* Builds date without time to group by and display */
  private getGroupByDate(date: Date): string {
    let ds = this.datePipe.transform(date, "EEEE, MMM d, y");
    if (this.todaysDatePiped == ds) return "Today";
    return ds;
  }

  /* Not used currently */
  deleteSurvey(survey) {
    this.service.deleteSurvey(survey, this.team.id).then(() => {
      this.survey = null;
      let snackbar = this.snackbar.open("survey deleted", null, {
        duration: 3000
      });
    });
  }

  public editSurvey(step: number): void {
    /* **step - which step of the dialog is being edited.
    1 = Category and Title, 2 = Run Date, 3 = Contacts. */
    if (step == 1 && this.surveyResponseListLength) {
      alert(
        "You cannot change the survey question or category after a receiving a response."
      );
    } else {
      this.dialog.open(CreateSurveyDialogComponent, {
        disableClose: true,
        data: { survey: this.survey, step }
      });
    }
  }


  async export() {
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
    const warningColor = "#d32f2f";
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
    const createdDate = this.survey.createdAt instanceof Date 
      ? this.survey.createdAt 
      : this.survey.createdAt?.toDate ? this.survey.createdAt.toDate() : new Date();
    const formattedDate = createdDate.toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    // Calculate stats
    const totalResponses = this.responses.length;
    const yesResponses = this.responses.filter(r => r.shortAnswer?.toLowerCase() === 'yes').length;
    const noResponses = this.responses.filter(r => r.shortAnswer?.toLowerCase() === 'no').length;
    const yesPercent = totalResponses > 0 ? Math.round((yesResponses / totalResponses) * 100) : 0;

    // ===== HEADER SECTION =====
    drawRoundedRect(margin, y - 0.15, contentWidth, 0.9, 0.08, primaryColor);
    
    // Title
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#ffffff");
    doc.text("Survey Results", margin + 0.2, y + 0.15);
    
    // Survey name
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    const surveyTitle = this.survey.title || 'Untitled Survey';
    doc.text(surveyTitle, margin + 0.2, y + 0.4);
    
    // Date
    doc.setFontSize(10);
    doc.text(`Created: ${formattedDate}`, margin + 0.2, y + 0.6);
    
    y += 1.0;

    // ===== SUMMARY CARDS =====
    const cardWidth = (contentWidth - 0.2) / 3;
    const cardHeight = 0.7;
    const cardY = y;
    
    // Total Responses Card
    drawRoundedRect(margin, cardY, cardWidth, cardHeight, 0.06, bgLight);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textSecondary);
    doc.text("RESPONSES", margin + 0.15, cardY + 0.22);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textPrimary);
    doc.text(`${totalResponses}`, margin + 0.15, cardY + 0.5);
    
    // Yes Responses Card
    const card2X = margin + cardWidth + 0.1;
    drawRoundedRect(card2X, cardY, cardWidth, cardHeight, 0.06, bgLight);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textSecondary);
    doc.text("YES", card2X + 0.15, cardY + 0.22);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(successColor);
    doc.text(`${yesResponses}`, card2X + 0.15, cardY + 0.5);
    
    // No Responses Card
    const card3X = margin + (cardWidth + 0.1) * 2;
    drawRoundedRect(card3X, cardY, cardWidth, cardHeight, 0.06, bgLight);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textSecondary);
    doc.text("NO", card3X + 0.15, cardY + 0.22);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(noResponses > 0 ? warningColor : textPrimary);
    doc.text(`${noResponses}`, card3X + 0.15, cardY + 0.5);
    
    y += cardHeight + 0.4;

    // ===== RESPONSES SECTION =====
    checkPageBreak(0.5);
    drawRoundedRect(margin, y, contentWidth, 0.35, 0.04, primaryColor);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#ffffff");
    doc.text("INDIVIDUAL RESPONSES", margin + 0.15, y + 0.23);
    y += 0.5;

    for (const response of this.responses) {
      checkPageBreak(0.8);
      
      const responseStartY = y;
      const userName = response['user']?.name || 'Unknown';
      const isYes = response.shortAnswer?.toLowerCase() === 'yes';
      
      // Response card background
      drawRoundedRect(margin, y, contentWidth, 0.08, 0.04, isYes ? successColor : warningColor);
      y += 0.15;
      
      // User name
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(textPrimary);
      doc.text(userName, margin + 0.15, y + 0.08);
      
      // Answer badge
      const answerText = response.shortAnswer || 'N/A';
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(isYes ? successColor : warningColor);
      doc.text(answerText.toUpperCase(), margin + contentWidth - 0.5, y + 0.08);
      
      y += 0.25;
      
      // Long answer if present
      if (response.longAnswer) {
        checkPageBreak(0.4);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(textSecondary);
        
        const answerLines = wrapText(response.longAnswer, 10, contentWidth - 0.4);
        for (const line of answerLines) {
          checkPageBreak();
          doc.text(line, margin + 0.15, y);
          y += lineHeight;
        }
        y += 0.05;
      }
      
      // Signature if present
      if (response.signatureUrl) {
        try {
          checkPageBreak(1.2);
          const sigData = await getImage(response.signatureUrl);
          doc.setDrawColor(borderColor);
          doc.roundedRect(margin + 0.15, y, 2, 0.8, 0.04, 0.04, 'S');
          doc.addImage(sigData, "JPEG", margin + 0.18, y + 0.03, 1.94, 0.74);
          y += 0.9;
        } catch (e) {
          console.error('Failed to load signature:', e);
        }
      }
      
      // Separator line
      y += 0.1;
      doc.setDrawColor(borderColor);
      doc.setLineWidth(0.003);
      doc.line(margin, y, pageWidth - margin, y);
      y += 0.2;
    }
    
    // Add chimp logo at the bottom
    try {
      const logoData = await getImage('/assets/chimp.png');
      const logoWidth = 1.0;
      const logoHeight = 1.4;
      const logoX = (pageWidth - logoWidth) / 2;
      const logoY = pageHeight - 0.8 - logoHeight;
      checkPageBreak(logoHeight + 0.3);
      doc.addImage(logoData, "PNG", logoX, y + 0.2, logoWidth, logoHeight);
    } catch (e) {
      console.error('Failed to load chimp logo:', e);
    }
    
    // Add page number to last page
    addPageNumber();
    
    const filename = `Survey - ${surveyTitle} - ${createdDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}.pdf`;
    doc.save(filename);
  }

  

  public goBack(): void {
    this.location.back();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}

async function getImage(imageUrl): Promise<any> {
  var res = await fetch(imageUrl);
  var blob = await res.blob();
  return new Promise((resolve, reject) => {
    var reader  = new FileReader();
    reader.addEventListener("load", function () {
        resolve(reader.result);
    }, false);

    reader.onerror = () => {
      return reject(this);
    };
    reader.readAsDataURL(blob);
  })
}