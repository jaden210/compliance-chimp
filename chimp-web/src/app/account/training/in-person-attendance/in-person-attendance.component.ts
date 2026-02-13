import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatBottomSheet, MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Subscription, combineLatest } from "rxjs";
import { Firestore, collection, addDoc, doc, updateDoc } from "@angular/fire/firestore";
import { SurveyService } from "../../survey/survey.service";
import { AccountService, TeamMember, User } from "../../account.service";
import { Survey, SurveyResponse, ShortAnswer } from "src/app/app.service";
import { SignatureBottomSheetComponent } from "src/app/user/survey/signature-bottom-sheet.component";

interface AttendeeRow {
  teamMember: TeamMember;
  color: string;
  signed: boolean;
  signing: boolean;
  responding: boolean;
  shortAnswer: boolean | null;
  longAnswer: string;
  response?: SurveyResponse;
}

@Component({
  standalone: true,
  selector: "app-in-person-attendance",
  templateUrl: "./in-person-attendance.component.html",
  styleUrls: ["./in-person-attendance.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatBottomSheetModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  providers: [DatePipe]
})
export class InPersonAttendanceComponent implements OnInit, OnDestroy {
  survey: Survey | null = null;
  attendees: AttendeeRow[] = [];
  loading = true;
  currentAttendee: AttendeeRow | null = null;
  backButtonLabel = 'View Training Details';

  private subscription: Subscription;
  private innerSubscriptions: Subscription[] = [];

  private colors = [
    "#FF6F00", "#B71C1C", "#880E4F", "#4A148C", "#311B92",
    "#1A237E", "#01579B", "#006064", "#BF360C", "#1B5E20"
  ];

  get signedCount(): number {
    return this.attendees.filter(a => a.signed).length;
  }

  get totalCount(): number {
    return this.attendees.length;
  }

  get allSigned(): boolean {
    return this.totalCount > 0 && this.signedCount === this.totalCount;
  }

  constructor(
    private surveyService: SurveyService,
    public accountService: AccountService,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private bottomSheet: MatBottomSheet,
    private datePipe: DatePipe,
    private db: Firestore
  ) {}

  ngOnInit(): void {
    this.subscription = combineLatest([
      this.accountService.aTeamObservable,
      this.accountService.teamMembersObservable,
      this.route.paramMap,
    ]).subscribe(([team, teamMembers, params]) => {
      // Clean up previous inner subscriptions
      this.innerSubscriptions.forEach(s => s.unsubscribe());
      this.innerSubscriptions = [];

      if (team && teamMembers) {
        const surveyId = (params as ParamMap).get("surveyId");
        if (surveyId) {
          this.loadSurvey(surveyId, teamMembers);
        }
      }
    });
  }

  private loadSurvey(surveyId: string, teamMembers: TeamMember[]): void {
    this.innerSubscriptions.push(this.surveyService.getSurvey(surveyId).subscribe(survey => {
      if (!survey) {
        this.loading = false;
        return;
      }
      this.survey = survey;

      // Build attendee list from trainees
      this.attendees = (survey.trainees || []).map((tmId: string, index: number) => {
        const tm = teamMembers.find(m => m.id === tmId);
        return {
          teamMember: tm || { id: tmId, name: 'Unknown', teamId: survey.teamId } as any,
          color: this.colors[index % this.colors.length],
          signed: false,
          signing: false,
          responding: false,
          shortAnswer: null,
          longAnswer: ''
        };
      });

      // Listen for existing responses
      this.innerSubscriptions.push(this.surveyService.getSurveyResponses(surveyId).subscribe(responses => {
        this.attendees.forEach(a => {
          const resp = responses.find(r => r.teamMemberId === a.teamMember.id);
          if (resp) {
            a.signed = true;
            a.response = resp;
          }
        });
        this.loading = false;
      }));
    }));
  }

  collectSignature(attendee: AttendeeRow): void {
    if (attendee.signed || attendee.signing || attendee.responding) return;

    // Open the inline response form for this attendee
    this.currentAttendee = attendee;
    attendee.responding = true;
  }

  setAnswer(attendee: AttendeeRow, answer: boolean): void {
    attendee.shortAnswer = attendee.shortAnswer === answer ? null : answer;
  }

  cancelResponse(attendee: AttendeeRow): void {
    attendee.responding = false;
    attendee.shortAnswer = null;
    attendee.longAnswer = '';
    if (this.currentAttendee === attendee) {
      this.currentAttendee = null;
    }
  }

  submitResponse(attendee: AttendeeRow): void {
    if (attendee.shortAnswer === null) return;

    attendee.signing = true;

    const sheetRef = this.bottomSheet.open(SignatureBottomSheetComponent, {
      panelClass: "signature-sheet-panel"
    });

    sheetRef.afterDismissed().subscribe((signatureDataUrl: string | undefined) => {
      if (signatureDataUrl && this.survey) {
        this.saveResponse(attendee, signatureDataUrl);
      } else {
        attendee.signing = false;
      }
    });
  }

  private async saveResponse(attendee: AttendeeRow, signatureUrl: string): Promise<void> {
    try {
      const response = new SurveyResponse();
      response.teamId = this.survey!.teamId;
      response.surveyId = this.survey!.id!;
      response.createdAt = new Date();
      response.shortAnswer = attendee.shortAnswer ? ShortAnswer.Yes : ShortAnswer.No;
      response.longAnswer = attendee.longAnswer || null;
      response.teamMemberId = attendee.teamMember.id!;
      response.signatureUrl = signatureUrl;
      response.isInPerson = true;
      response.collectedBy = this.accountService.user?.id;

      // Filter out undefined/null values
      const cleanResponse = Object.fromEntries(
        Object.entries(response).filter(([_, value]) => value !== undefined && value !== null)
      );

      await addDoc(collection(this.db, "survey-response"), cleanResponse);

      attendee.signed = true;
      attendee.signing = false;
      attendee.responding = false;
      this.currentAttendee = null;

      this.snackBar.open(`Signature collected for ${attendee.teamMember.name}`, 'Close', { duration: 3000 });

      // If all attendees have signed, deactivate the survey
      if (this.allSigned) {
        this.deactivateSurvey();
      }
    } catch (error) {
      console.error('Error saving in-person response:', error);
      attendee.signing = false;
      this.currentAttendee = null;
      this.snackBar.open('Error saving signature. Please try again.', 'Close', { duration: 3000 });
    }
  }

  private async deactivateSurvey(): Promise<void> {
    if (!this.survey?.id) return;
    try {
      await updateDoc(doc(this.db, `survey/${this.survey.id}`), { active: false });
    } catch (error) {
      console.error('Error deactivating survey:', error);
    }
  }

  formatDate(date: any): string {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return this.datePipe.transform(d, 'MMM d, y') || '';
  }

  goBack(): void {
    if (this.survey?.id) {
      this.router.navigate([`/account/survey/${this.survey.id}`]);
    } else {
      this.router.navigate(['/account/training']);
    }
  }

  ngOnDestroy(): void {
    if (this.subscription) this.subscription.unsubscribe();
    this.innerSubscriptions.forEach(s => s.unsubscribe());
  }
}
