import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { Observable } from 'rxjs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupportService } from '../../support.service';
import { HelpArticle } from 'src/app/help-dialog/help-dialog.component';
import { BlogPhotoDialog } from '../../dialogs/blog-photo-upload/blog-photo-upload.component';
import { BlogVideoDialog } from '../../dialogs/blog-video-upload/blog-video-upload.component';
import { doc, docData, setDoc, updateDoc, deleteDoc } from '@angular/fire/firestore';

@Component({
  standalone: true,
  selector: 'app-article',
  templateUrl: './article.component.html',
  styleUrls: ['./article.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    NgxEditorModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule
  ]
})
export class ArticleComponent implements OnInit, OnDestroy {

  article: HelpArticle;
  loading: boolean = false;

  // NgxEditor setup
  public editor: Editor;
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
    public dialog: MatDialog,
    private supportService: SupportService,
    private _snackbar: MatSnackBar
  ) { }

  ngOnInit() {
    this.editor = new Editor();
    this.supportService.article ? this.article = this.supportService.article : this.article = new HelpArticle();
  }

  ngOnDestroy() {
    this.editor.destroy();
  }

  submit() {
    this.loading = true;
    if (this.article.createdAt) { //edit
      updateDoc(doc(this.supportService.db, `help-article/${this.article.id}`), { ...this.article }).then(() => {
        this.supportService.article = new HelpArticle();
        this.supportService.makeArticle = false;
        this.loading = false;
      })
    } else {
      this.article.id = this.article.id ? this.article.id.split(' ').join('-').toLowerCase() : this.article.name.split(' ').join('-').toLowerCase();
      docData(doc(this.supportService.db, `help-article/${this.article.id}`)).subscribe(article => {
        if (!article) {
          this.article.createdAt = new Date();
          setDoc(doc(this.supportService.db, `help-article/${this.article.id}`), { ...this.article }).then(() => {
            this.supportService.article = new HelpArticle();
            this.supportService.makeArticle = false;
            this.loading = false;
          }, error => console.error(error));
        } else {
          this._snackbar.open("name is taken", "", {duration: 4000});
          this.loading = false;
        }
      })
    }
  }

  articlePhoto() {
    this.dialog.open(BlogPhotoDialog, {
      data: this.article,
      disableClose: true
    });
  }

  articleVideo() {
    this.dialog.open(BlogVideoDialog, {
      data: this.article,
      disableClose: true
    });
  }

  cancel() {
    this.supportService.article = new HelpArticle();
    this.supportService.makeArticle = false;
  }

  deleteArticle() {
    deleteDoc(doc(this.supportService.db, `help-article/${this.article.id}`)).then(() => {
      this.cancel();
    });
  }

}

