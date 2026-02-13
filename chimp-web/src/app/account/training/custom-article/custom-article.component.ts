import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
  input,
  output
} from '@angular/core';
import { getTagColor } from '../../../shared/tag-colors';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { filter, switchMap, map, take } from 'rxjs/operators';
import { Subscription } from 'rxjs';

import { TrainingService, LibraryItem, TrainingExpiration, TrainingCadence } from '../training.service';
import { AccountService, User } from '../../account.service';
import { SurveysService } from '../../surveys/surveys.service';
import { SurveyService } from '../../survey/survey.service';
import { Survey } from '../../survey/survey';
import { BlasterDialog } from '../../../blaster/blaster.component';
import { CreateEditArticleComponent } from '../library/create-edit-article/create-edit-article.component';
import { CreateEditArticleService } from '../library/create-edit-article/create-edit-article.service';

@Component({
  standalone: true,
  selector: 'app-custom-article',
  templateUrl: './custom-article.component.html',
  styleUrls: ['./custom-article.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SurveysService, CreateEditArticleService],
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    CreateEditArticleComponent
  ]
})
export class CustomArticleComponent implements OnInit, OnDestroy {
  // Dependency injection using inject()
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private snackbar = inject(MatSnackBar);
  private trainingService = inject(TrainingService);
  private accountService = inject(AccountService);
  private surveysService = inject(SurveysService);
  private surveyService = inject(SurveyService);
  private articleService = inject(CreateEditArticleService);

  // Input signals for when component is used embedded
  articleInput = input<LibraryItem | null>(null, { alias: 'article' });

  // Output event for when article is closed (embedded mode)
  closed = output<void>();

  // Reactive signals
  article = signal<LibraryItem | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  isEditing = signal(false);
  trainingHistory = signal<Survey[]>([]);
  historyPanelOpen = signal(true);
  
  // Store response counts for each survey: { surveyId: responseCount }
  responseCountsMap = signal<Record<string, number>>({});
  
  // Convert observables to signals for reactivity
  private user = toSignal(this.accountService.userObservable);
  private team = toSignal(this.accountService.aTeamObservable);

  // Computed values
  wordCount = computed(() => {
    const content = this.article()?.content || '';
    const text = content.replace(/<[^>]*>/g, '');
    return text.split(/\s+/).filter(word => word.length > 0).length;
  });

  readingTime = computed(() => {
    const words = this.wordCount();
    const minutes = Math.ceil(words / 200);
    return minutes < 1 ? '< 1 min' : `${minutes} min read`;
  });

  canEdit = computed(() => {
    const article = this.article();
    const user = this.user();
    const team = this.team();
    
    // Need both article and user with valid IDs
    if (!article || !user?.id) return false;
    
    // Dev users can always edit
    if (user.isDev) return true;
    
    // Team owner can always edit
    if (team?.ownerId === user.id) return true;
    
    // User who created the article can always edit
    if (article.addedBy === user.id) return true;
    
    // Team managers can edit any article in their library
    // isManager defaults to true if not explicitly set to false
    return user.isManager !== false;
  });

  // Calculate next due date
  nextDueDate = computed(() => {
    const art = this.article();
    if (!art) return null;
    return this.trainingService.calculateNextDueDate(
      art.lastTrainedAt,
      art.trainingCadence || TrainingCadence.Annually,
      art.scheduledDueDate
    );
  });

  // Get cadence label
  cadenceLabel = computed(() => {
    const art = this.article();
    if (!art?.trainingCadence) return 'Annually';
    const labels: Record<string, string> = {
      [TrainingCadence.Once]: 'One-time',
      [TrainingCadence.UponHire]: 'Upon Hire',
      [TrainingCadence.Monthly]: 'Monthly',
      [TrainingCadence.Quarterly]: 'Quarterly',
      [TrainingCadence.SemiAnnually]: 'Semi-Annually',
      [TrainingCadence.Annually]: 'Annually'
    };
    return labels[art.trainingCadence] || art.trainingCadence;
  });

  trainingExpirations = Object.values(TrainingExpiration);

  // Use shared tag color utility
  getTagColor = getTagColor;

  private subscriptions = new Subscription();
  private teamId: string | null = null;

  ngOnInit() {
    // Check if article is passed as input (embedded mode)
    const inputArticle = this.articleInput();
    if (inputArticle) {
      this.article.set(inputArticle);
      this.loading.set(false);
      return;
    }

    // Otherwise load from route params
    const teamSub = this.accountService.aTeamObservable.pipe(
      filter(team => !!team)
    ).subscribe(team => {
      this.teamId = team.id;
      this.loadArticleFromRoute();
    });

    this.subscriptions.add(teamSub);
  }

  private loadArticleFromRoute(): void {
    const routeSub = this.route.paramMap.pipe(
      map(params => params.get('articleId')),
      filter(id => !!id),
      switchMap(id => this.trainingService.getLibrary(this.teamId!).pipe(
        map(library => library.find(item => item.id === id)),
        take(1)
      ))
    ).subscribe({
      next: (article) => {
        if (article) {
          this.article.set(article);
          this.loading.set(false);
          this.loadTrainingHistory(article.id!);
        } else {
          this.error.set('Article not found');
          this.loading.set(false);
        }
      },
      error: (err) => {
        console.error('Error loading article:', err);
        this.error.set('Failed to load article');
        this.loading.set(false);
      }
    });

    this.subscriptions.add(routeSub);
  }

  private loadTrainingHistory(articleId: string): void {
    if (!this.teamId) return;
    
    const historySub = this.trainingService.getTrainingHistory(this.teamId).pipe(
      map(surveys => surveys.filter(s => s.articleId === articleId || s.libraryId === articleId)),
      take(1)
    ).subscribe(history => {
      this.trainingHistory.set(history);
      // Load response counts for each survey
      this.loadResponseCounts(history);
    });

    this.subscriptions.add(historySub);
  }

  /** Load response counts for each survey in the training history */
  private loadResponseCounts(surveys: any[]): void {
    surveys.forEach(survey => {
      if (survey.id) {
        this.surveyService.getSurveyResponses(survey.id).pipe(
          take(1)
        ).subscribe(responses => {
          this.responseCountsMap.update(counts => ({
            ...counts,
            [survey.id]: responses.length
          }));
        });
      }
    });
  }

  /** Refresh article and training history data */
  private refreshData(): void {
    const article = this.article();
    if (!article?.id || !this.teamId) return;

    // Reload article to get updated lastTrainedAt
    this.trainingService.getLibrary(this.teamId).pipe(
      map(library => library.find(item => item.id === article.id)),
      take(1)
    ).subscribe(updatedArticle => {
      if (updatedArticle) {
        this.article.set(updatedArticle);
      }
    });

    // Reload training history
    this.loadTrainingHistory(article.id);
  }

  startTraining(): void {
    const article = this.article();
    if (!article) return;

    const dialogRef = this.dialog.open(BlasterDialog, {
      data: { libraryItem: article }
    });
    
    // Refresh data after dialog closes (training may have been started)
    dialogRef.afterClosed().subscribe(() => {
      // Small delay to allow Firestore to update
      setTimeout(() => this.refreshData(), 1000);
    });
  }

  startClassroomTraining(): void {
    const article = this.article();
    if (!article || !this.teamId) return;

    // Pass the article with assigned tags so they're pre-selected
    const dialogRef = this.dialog.open(BlasterDialog, {
      data: { libraryItem: article }
    });
    dialogRef.afterClosed().subscribe((traineeIds: string[]) => {
      if (traineeIds?.length) {
        const userSurvey: Record<string, number> = {};
        traineeIds.forEach(id => userSurvey[id] = 0);

        const survey = new Survey();
        survey.category = 'Safety Training';
        survey.title = `Did you participate in this training? - ${article.name}`;
        survey.active = true;
        survey.articleId = article.id;
        survey.userSurvey = userSurvey;
        survey.userId = this.accountService.user?.id || '';

        this.surveysService.createSurvey(survey, this.teamId);
        this.snackbar.open('Training session started', 'OK', { duration: 3000 });
        
        // Refresh data after creating the survey
        setTimeout(() => this.refreshData(), 1000);
      }
    });
  }

  editArticle(): void {
    const article = this.article();
    if (article?.id) {
      // Use replaceUrl so the article page is replaced in history
      // This way when returning from edit and clicking back, user goes to training home
      this.router.navigate(['/account/training/smart-builder'], { 
        queryParams: { edit: article.id },
        replaceUrl: true
      });
    }
  }

  onEditComplete(): void {
    this.isEditing.set(false);
    // Reload article to get updates
    if (this.articleInput()) {
      // In embedded mode, emit closed event
      this.closed.emit();
    } else {
      this.loadArticleFromRoute();
    }
  }

  shareArticle(): void {
    const article = this.article();
    if (!article) return;

    if (navigator.share) {
      navigator.share({
        title: article.name,
        text: `Check out this training article: ${article.name}`,
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      this.snackbar.open('Link copied to clipboard', 'OK', { duration: 2000 });
    }
  }

  printArticle(): void {
    window.print();
  }

  toggleHistoryPanel(): void {
    this.historyPanelOpen.update(open => !open);
  }

  getCompletionRate(survey: any): number {
    const total = this.getAttendeeCount(survey);
    if (total === 0) return 0;
    
    // Get response count from our loaded data
    const responseCount = this.responseCountsMap()[survey.id] || 0;
    return Math.round((responseCount / total) * 100);
  }

  viewSessionDetails(session: Survey): void {
    if (session.id) {
      this.router.navigate(['/account/survey', session.id]);
    }
  }

  exportSession(session: Survey): void {
    // Generate CSV export of attendance
    const article = this.article();
    const date = this.formatDate(session.createdAt);
    const attendees = Object.keys(session.userSurvey || {});
    const isInPerson = (session as any).isInPerson || false;
    
    let csv = 'Training Attendance Export\n';
    csv += `Article: ${article?.name || 'Unknown'}\n`;
    csv += `Date: ${date}\n`;
    csv += `Total Attendees: ${attendees.length}\n`;
    if (isInPerson) {
      csv += `Training Type: In-Person\n`;
    }
    csv += '\n';
    csv += 'Attendee ID,Status,In Person,Collected By\n';
    
    attendees.forEach(id => {
      const status = session.userSurvey[id] > 0 ? 'Completed' : 'Pending';
      const inPersonCol = isInPerson ? 'Yes' : 'No';
      csv += `${id},${status},${inPersonCol},\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-attendance-${date.replace(/[^a-z0-9]/gi, '-')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    this.snackbar.open('Attendance exported', 'OK', { duration: 2000 });
  }

  deleteArticle(): void {
    const article = this.article();
    if (!article?.id || !this.teamId) return;

    let shouldDelete = true;
    const snackbarRef = this.snackbar.open('Deleting Article', 'UNDO', {
      duration: 3000
    });
    
    snackbarRef.onAction().subscribe(() => (shouldDelete = false));
    snackbarRef.afterDismissed().subscribe(() => {
      if (shouldDelete) {
        this.articleService
          .deleteArticle(article.id, this.teamId!)
          .then(() => {
            this.snackbar.open('Article deleted', 'OK', { duration: 2000 });
            this.goBack();
          })
          .catch(() => {
            this.snackbar.open('Unable to delete article', 'OK', { duration: 3000 });
          });
      }
    });
  }

  formatDate(date: any): string {
    if (!date) return 'Not set';
    const d = date instanceof Date ? date : date.toDate?.() || new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getAttendeeCount(survey: any): number {
    // Check trainees array first (used in newer surveys)
    if (survey.trainees?.length) {
      return survey.trainees.length;
    }
    // Fall back to userSurvey object (legacy format)
    if (!survey.userSurvey) return 0;
    return Object.keys(survey.userSurvey).length;
  }

  goBack(): void {
    if (this.articleInput()) {
      this.closed.emit();
    } else {
      // Use browser history to return to the previous tab they were on
      window.history.back();
    }
  }

  openInPersonInfo(): void {
    this.dialog.open(InPersonInfoDialog, { width: '480px' });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}

@Component({
  standalone: true,
  selector: 'in-person-info-dialog',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="in-person-dialog">
      <div class="dialog-header">
        <mat-icon class="header-icon">groups</mat-icon>
        <h2>In-Person Training</h2>
      </div>
      
      <div class="dialog-body">
        <p>This training is marked as <strong>in-person required</strong>, meaning it must be conducted face-to-face to be OSHA-defensible.</p>
        
        <div class="info-section">
          <h3>How it works</h3>
          <div class="info-item">
            <mat-icon>notifications</mat-icon>
            <span>When this training is due, <strong>only managers</strong> are notified — team members are not sent individual links.</span>
          </div>
          <div class="info-item">
            <mat-icon>phone_android</mat-icon>
            <span>A manager conducts the training in person, then opens the signature collection page on their device.</span>
          </div>
          <div class="info-item">
            <mat-icon>draw</mat-icon>
            <span>Each attendee signs on the manager's device to confirm they attended in person.</span>
          </div>
          <div class="info-item">
            <mat-icon>verified</mat-icon>
            <span>Signatures are recorded with the manager's name attached, creating an OSHA-defensible proof of attendance.</span>
          </div>
        </div>

        <div class="info-section">
          <h3>Why in-person?</h3>
          <p>OSHA requires certain trainings — like equipment operation, lockout/tagout, PPE fit testing, and hands-on skill demonstrations — to be conducted in person with documented proof of physical attendance.</p>
        </div>
      </div>

      <div class="dialog-actions">
        <button mat-flat-button color="primary" mat-dialog-close>Got it</button>
      </div>
    </div>
  `,
  styles: [`
    .in-person-dialog {
      padding: 24px;
    }
    
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    
    .header-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: var(--chimp-primary, #054d8a);
    }
    
    .dialog-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--chimp-on-surface, #1a1a1a);
    }
    
    .dialog-body p {
      font-size: 14px;
      line-height: 1.6;
      color: var(--chimp-on-surface-variant, #555);
      margin: 0 0 16px;
    }
    
    .info-section {
      margin-bottom: 20px;
    }
    
    .info-section h3 {
      font-size: 14px;
      font-weight: 700;
      color: var(--chimp-on-surface, #1a1a1a);
      margin: 0 0 12px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    
    .info-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }
    
    .info-item mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--chimp-primary, #054d8a);
      flex-shrink: 0;
      margin-top: 1px;
    }
    
    .info-item span {
      font-size: 14px;
      line-height: 1.5;
      color: var(--chimp-on-surface-variant, #555);
    }
    
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }
  `]
})
export class InPersonInfoDialog {}
