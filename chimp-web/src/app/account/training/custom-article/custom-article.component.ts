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

import { TrainingService, LibraryItem, TrainingExpiration } from '../training.service';
import { AccountService, User } from '../../account.service';
import { AttendanceDialog } from '../article/attendance.dialog';
import { SurveysService } from '../../surveys/surveys.service';
import { Survey } from '../../survey/survey';
import { BlasterDialog } from '../../../blaster/blaster.component';
import { CreateEditArticleComponent } from '../library/create-edit-article/create-edit-article.component';

@Component({
  standalone: true,
  selector: 'app-custom-article',
  templateUrl: './custom-article.component.html',
  styleUrls: ['./custom-article.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SurveysService],
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

  // Input signals for when component is used embedded
  articleInput = input<LibraryItem | null>(null, { alias: 'article' });

  // Output event for when article is closed (embedded mode)
  closed = output<void>();

  // Reactive signals
  article = signal<LibraryItem | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  isFavorited = signal(false);
  isEditing = signal(false);

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
    const user = this.accountService.user;
    if (!article || !user) return false;
    return article.addedBy === user.id || user.isDev;
  });

  trainingExpirations = Object.values(TrainingExpiration);

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

  startTraining(): void {
    const article = this.article();
    if (!article) return;

    this.dialog.open(BlasterDialog, {
      data: { libraryItem: article }
    });
  }

  startClassroomTraining(): void {
    const article = this.article();
    if (!article || !this.teamId) return;

    const dialogRef = this.dialog.open(AttendanceDialog);
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
      }
    });
  }

  editArticle(): void {
    this.isEditing.set(true);
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

  toggleFavorite(): void {
    this.isFavorited.update(val => !val);
    const article = this.article();
    if (article) {
      const action = this.isFavorited() ? 'Added to' : 'Removed from';
      this.snackbar.open(`${action} favorites`, 'OK', { duration: 2000 });
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

  goBack(): void {
    if (this.articleInput()) {
      this.closed.emit();
    } else {
      this.router.navigate(['account', 'training', 'library']);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
