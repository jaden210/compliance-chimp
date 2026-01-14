import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { Observable } from 'rxjs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupportService } from '../../support.service';
import { BlogPhotoDialog } from '../../dialogs/blog-photo-upload/blog-photo-upload.component';
import { BlogVideoDialog } from '../../dialogs/blog-video-upload/blog-video-upload.component';
import { BlogMetaDescriptionDialog } from '../../dialogs/blog-meta-description/blog-meta-description.component';
import { BlogTopicDialog } from '../../dialogs/blog-topic-generator/blog-topic-generator.component';
import { addDoc, collection, doc, docData, setDoc, updateDoc, deleteDoc } from '@angular/fire/firestore';

@Component({
  standalone: true,
  selector: 'app-make-blog',
  templateUrl: './make-blog.component.html',
  styleUrls: ['./make-blog.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    NgxEditorModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule
  ]
})
export class BlogComponent implements OnInit, OnDestroy {

  blog: Blog;
  topics: Observable<any>;
  loading: boolean = false;
  slugError: string;

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
    private supportService: SupportService
  ) { }

  ngOnInit() {
    this.editor = new Editor();
    this.supportService.blog ? this.blog = this.supportService.blog : this.blog = new Blog();
    this.topics = this.supportService.getBlogTopics();
  }

  ngOnDestroy() {
    this.editor.destroy();
  }

  submit() {
    this.slugError = '';
    this.loading = true;
    if (this.blog.createdAt) { //edit
      updateDoc(doc(this.supportService.db, `blog/${this.blog.id}`), { ...this.blog }).then(() => {
        this.supportService.blog = new Blog();
        this.supportService.makeBlog = false;
        this.loading = false;
      })
    } else {
      this.blog.id = this.blog.id ? this.blog.id.split(' ').join('-').toLowerCase() : this.blog.name.split(' ').join('-').toLowerCase();
      docData(doc(this.supportService.db, `blog/${this.blog.id}`)).subscribe(blog => {
        if (!blog) {
          this.blog.createdAt = new Date();
          setDoc(doc(this.supportService.db, `blog/${this.blog.id}`), { ...this.blog }).then(() => {
            this.supportService.blog = new Blog();
            this.supportService.makeBlog = false;
            this.loading = false;
          }, error => console.error(error));
        } else {
          this.slugError = "That name is already taken";
          this.loading = false;
        }
      })
    }
  }

  blogPhoto() {
    this.dialog.open(BlogPhotoDialog, {
      data: this.blog,
      disableClose: true
    });
  }

  blogVideo() {
    this.dialog.open(BlogVideoDialog, {
      data: this.blog,
      disableClose: true
    });
  }

  blogMetaDescription() {
    this.dialog.open(BlogMetaDescriptionDialog, {
      data: this.blog,
      disableClose: true
    });
  }

  newTopic() {
    let dialog = this.dialog.open(BlogTopicDialog)
    dialog.afterClosed().subscribe(data => {
      if (data) {
        let blogTopic = {
          name: data.name,
          createdAt: new Date(),
        }
        let id = data.name.split(' ').join('-').toLowerCase();
        addDoc(collection(this.supportService.db, "blog-topic"), { ...blogTopic }).then(() => {
          this.blog.topic = blogTopic.name;
        }, error => {
          console.error("Topic name is already created.");
          this.blog.topic = blogTopic.name;
        });
      }
    })
  }

  cancel() {
    this.supportService.blog = new Blog();
    this.supportService.makeBlog = false;
  }

  deleteBlog() {
    deleteDoc(doc(this.supportService.db, `blog/${this.blog.id}`)).then(() => {
      this.cancel();
    });
  }

}


export class Blog {
  content: string;
  contentEs: string;
  createdAt: any;
  name: string;
  nameEs: string;
  topic: string;
  id?: string;
  imageUrl: string;
}

