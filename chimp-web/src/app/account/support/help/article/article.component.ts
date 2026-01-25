import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupportService } from '../../support.service';
import { HelpArticle } from 'src/app/help-dialog/help-dialog.component';
import { doc, docData, setDoc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-article',
  templateUrl: './article.component.html',
  styleUrl: './article.component.scss',
  imports: [
    FormsModule,
    NgxEditorModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ]
})
export class ArticleComponent implements OnInit, OnDestroy {
  private readonly supportService = inject(SupportService);
  private readonly snackbar = inject(MatSnackBar);

  article: HelpArticle = new HelpArticle();
  readonly loading = signal(false);

  editor!: Editor;
  readonly toolbar: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code'],
    ['ordered_list', 'bullet_list'],
    [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
    ['link', 'image'],
    ['text_color', 'background_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
    ['undo', 'redo']
  ];

  ngOnInit(): void {
    this.editor = new Editor();
    const existingArticle = this.supportService.article();
    if (existingArticle) {
      this.article = existingArticle;
    }
  }

  ngOnDestroy(): void {
    this.editor.destroy();
  }

  submit(): void {
    this.loading.set(true);
    
    if (this.article.createdAt) {
      // Edit existing article
      const cleanedArticle = Object.fromEntries(
        Object.entries(this.article).filter(([_, v]) => v !== undefined)
      );
      updateDoc(doc(this.supportService.db, `help-article/${this.article.id}`), cleanedArticle).then(() => {
        this.close();
      });
    } else {
      // Create new article
      this.article.id = this.article.id 
        ? this.article.id.split(' ').join('-').toLowerCase() 
        : this.article.name.split(' ').join('-').toLowerCase();
      
      docData(doc(this.supportService.db, `help-article/${this.article.id}`))
        .pipe(take(1))
        .subscribe(existingArticle => {
          if (!existingArticle) {
            this.article.createdAt = new Date();
            const cleanedArticle = Object.fromEntries(
              Object.entries(this.article).filter(([_, v]) => v !== undefined)
            );
            setDoc(doc(this.supportService.db, `help-article/${this.article.id}`), cleanedArticle).then(() => {
              this.close();
            }).catch(error => console.error(error));
          } else {
            this.snackbar.open('Name is already taken', '', { duration: 4000 });
            this.loading.set(false);
          }
        });
    }
  }

  cancel(): void {
    this.close();
  }

  deleteArticle(): void {
    deleteDoc(doc(this.supportService.db, `help-article/${this.article.id}`)).then(() => {
      this.close();
    });
  }

  private close(): void {
    this.supportService.article.set(null);
    this.supportService.makeArticle.set(false);
    this.loading.set(false);
  }
}

