import { Component, OnInit, HostListener, OnDestroy, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { NgxEditorModule, Editor, Toolbar, toHTML, toDoc, schema } from "ngx-editor";
import { ActivatedRoute, ParamMap } from "@angular/router";
import { TrainingService, Article, Topic, LibraryItem } from "../../training.service";
import { CreateEditArticleService } from "./create-edit-article.service";
import { Observable, Subscription } from "rxjs";
import { Location } from "@angular/common";
import { ComponentCanDeactivate } from "./pending-changes.guard";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatToolbarModule } from "@angular/material/toolbar";
import { AccountService } from "../../../account.service";
import { ArticleMetaDescriptionDialog } from "./article-meta-description/article-meta-description.component";
import { ArticlePhotoDialog } from "./article-photo-upload/article-photo-upload.component";
import { TopicDialogComponent } from "../../topics/topic-dialog/topic-dialog.component";
import { VoiceArticleDialog } from "./voice-article-dialog/voice-article-dialog.component";

@Component({
  standalone: true,
  selector: "app-create-edit-article",
  templateUrl: "./create-edit-article.component.html",
  styleUrls: ["./create-edit-article.component.css"],
  providers: [CreateEditArticleService],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    NgxEditorModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatToolbarModule
  ]
})
export class CreateEditArticleComponent
  implements OnInit, ComponentCanDeactivate, OnDestroy {

    @Input() articleId: string;
    @Output() closed = new EventEmitter();
    private teamId: string;
    private originalArticle: LibraryItem;
    private deactivate: boolean;
    private userSubscription: Subscription;
    public article = new LibraryItem();
    public isEdit: boolean;
    public submitButton: string = "CREATE ARTICLE";
    public loading: boolean;
    public topics: Observable<Topic[]>;
    public isDev: boolean;
    public slugNameError: string;
    private industryId: string;
    public title: string = "Create Custom Article";
    
    // NgxEditor setup
    public editor: Editor;
    public editorContent: any; // ProseMirror doc for the editor
    public toolbar: Toolbar = [
      ['bold', 'italic', 'underline', 'strike'],
      ['blockquote', 'code'],
      ['ordered_list', 'bullet_list'],
      [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
      ['link', 'image'],
      ['text_color', 'background_color'],
      ['align_left', 'align_center', 'align_right', 'align_justify'],
      ['undo', 'redo']
    ];

  constructor(
    private route: ActivatedRoute,
    private service: CreateEditArticleService,
    private trainingService: TrainingService,
    private location: Location,
    private snackbar: MatSnackBar,
    private accountService: AccountService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.editor = new Editor();
    
    this.accountService.aTeamObservable.subscribe(team => {
      if (team) {
        this.teamId = team.id;
        this.getIsDev();
        // this.topics = this.trainingService.getTopics(this.industryId, team.id);
        if (this.articleId) { // edit
          this.isEdit = true;
          this.getArticle();
          this.submitButton = "UPDATE ARTICLE";
          this.title = "Edit Article";
        }
      }
    });
  }

  private getArticle(): void {
    this.service.getArticle(this.articleId).subscribe(article => {
      this.originalArticle = { ...article };
      this.article = article;
      // Convert HTML content to ProseMirror doc for editing
      if (article.content && typeof article.content === 'string') {
        this.editorContent = toDoc(article.content, schema);
      } else {
        this.editorContent = article.content;
      }
    });
  }

  private getIsDev(): void {
    this.userSubscription = this.accountService.userObservable.subscribe(
      user => {
        if (user) this.isDev = user.isDev;
      }
    );
  }

  public submit(): void {
    this.isEdit && !this.loading ? this.updateArticle() : this.createArticle();
    this.loading = true;
  }

  private updateArticle(): void {
    // Convert editor content (ProseMirror doc) to HTML before saving
    if (this.editorContent && typeof this.editorContent === 'object') {
      this.article.content = toHTML(this.editorContent, schema);
    }
    
    this.service.updateArticle(this.article).then(() => {
      this.deactivate = true;
      this.popSnackbar("Updated", this.article.name);
      this.trainingService.wipeArticles();
      this.goBack();
    });
  }

  private createArticle(): void {
    this.article.industry = "Custom";
    this.article.topic = "User Generated";
    this.article.addedBy = this.accountService.user.id;
    this.article.teamId = this.accountService.aTeam.id;
    this.service.createArticle(this.article, this.teamId).then(id => {
      this.deactivate = true;
      this.popSnackbar("Created", this.article.name);
      this.trainingService.wipeArticles();
      this.goBack();
    });
  }

  createTopic() {
    this.dialog
      .open(TopicDialogComponent, {
        data: {
          topic: new Topic(),
          industryId: this.industryId,
          teamId: this.teamId,
          isDev: this.isDev
        }
      })
      .afterClosed()
      .subscribe(topic => {
        if (topic) {
          this.topics = this.trainingService.getTopics(this.industryId, this.teamId, true);
          this.article.topic = topic.name;
        };
      });
    
  }

  public launchTopicDialog(topic: Topic): void {
  }

  addMetaDescription() {
    this.dialog.open(ArticleMetaDescriptionDialog, {
      data: this.article,
      disableClose: true
    });
  }

  addPhoto() {
    this.dialog.open(ArticlePhotoDialog, {
      data: this.article,
      disableClose: true
    }).afterClosed().subscribe(data => {
      this.article = data;
    });
  }

  openAIGenerator() {
    this.dialog.open(VoiceArticleDialog, {
      data: { industry: this.article.industry },
      disableClose: true,
      width: '600px'
    }).afterClosed().subscribe((result: { title: string; content: string } | undefined) => {
      if (result?.title && result?.content) {
        this.article.name = result.title;
        this.article.content = result.content;
        this.snackbar.open('Article generated! Review and edit as needed.', null, {
          duration: 4000
        });
      }
    });
  }

  private popSnackbar(verb, articleName): void {
    this.snackbar.open(`${verb} Article ${articleName}`, null, {
      duration: 3000
    });
  }

  public goBack(): void {
    this.closed.emit(true);
  }

  public deleteArticle(): void {
    let deleteArticle = true;
    let snackbar = this.snackbar.open("Deleting Article", "UNDO", {
      duration: 3000
    });
    snackbar.onAction().subscribe(() => (deleteArticle = false));
    snackbar.afterDismissed().subscribe(() => {
      if (deleteArticle) {
        this.service
          .deleteArticle(this.article.id, this.teamId)
          .then(() => {
            this.loading = false;
            this.deactivate = true;
            this.trainingService.wipeArticles();
            /* go back two pages */
            this.location.back();
            this.location.back();
          })
          .catch(() => alert("Unable to delete article"));
      }
    });
  }

  canDeactivate(): Observable<boolean> | boolean {
    // insert logic to check if there are pending changes here;
    // returning true will navigate without confirmation
    // returning false will show a confirm dialog before navigating away
    if (this.deactivate) return true;
    else if (!this.article.id && (this.article.name || this.article.content))
      return false;
    else if (this.article.id) {
      if (
        this.article.name.localeCompare(this.originalArticle.name) > 0 ||
        this.article.content.localeCompare(this.originalArticle.content) > 0 ||
        this.article.topic !== this.originalArticle.topic
      )
        return false;
      else return true;
    } else return true;
  }

  ngOnDestroy() {
    this.editor.destroy();
    this.userSubscription.unsubscribe();
  }
}
