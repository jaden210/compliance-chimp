import { Component, OnInit, OnDestroy, Pipe, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AppService } from "../app.service";
import {
  map,
  tap,
  catchError,
  share,
  mergeMap,
  concatMap,
  take
} from "rxjs/operators";
import { NgxEditorModule, Editor, Toolbar } from "ngx-editor";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatDialog } from "@angular/material/dialog";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatListModule } from "@angular/material/list";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { Location } from "@angular/common";
import { PreviewDialogComponent } from "./preview-dialog/preview-dialog.component";
import { Firestore, collection, collectionData, doc, docData, query, orderBy, where, addDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import {
  DomSanitizer,
  SafeHtml,
  SafeStyle,
  SafeUrl,
  SafeScript,
  SafeResourceUrl
} from "@angular/platform-browser";
import { Observable, of } from "rxjs";
import {
  TopicDialogComponent,
  Topic
} from "./topic-dialog/topic-dialog.component";

@Component({
  standalone: true,
  selector: "app-make-osha",
  templateUrl: "./make-osha.component.html",
  styleUrls: ["./make-osha.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    NgxEditorModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ]
})
export class MakeOSHAComponent implements OnInit, OnDestroy {
  private oshaManual: string = "osha-manual-en";
  public topics: Observable<any[]>;
  public articles: any[];
  public activeArticle = new Article();
  private originalActiveArticle: Article;
  public industries: Observable<any[]>;
  public industry;

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
    private appService: AppService,
    private snackbar: MatSnackBar,
    private location: Location,
    private dialog: MatDialog,
    private db: Firestore
  ) {}

  ngOnInit() {
    this.editor = new Editor();
    this.getIndustries();
    this.getIndustries1();
  }

  ngOnDestroy() {
    this.editor.destroy();
  }

  public goBack(): void {
    if (this.confirmNavigation()) {
      this.location.back();
    }
  }

  private getIndustries(): void {
    this.industries = collectionData(
      query(collection(this.appService.db, "industries"), orderBy("name", "asc")),
      { idField: "id" }
    ).pipe(
        map((actions: any[]) => actions.map((data) => ({ ...data }))),
        tap(industries => {
          this.getArticles(industries[0]);
          this.getTopics(industries[0]);
        }),
        catchError(error => {
          console.error(`Error loading industries collection. ${error}`);
          alert(`Error loading industries collection for ${this.oshaManual}`);
          return of([]);
        })
      );
  }

  public setIndustry(industry): void {
    if (this.confirmNavigation()) {
      this.newArticle();
      this.getArticles(industry);
      this.getTopics(industry);
    }
  }

  private getArticles(industry): void {
    this.industry = industry;
    collectionData(collection(this.appService.db, "article"), { idField: "id" })
      .pipe(
        map((actions: any[]) =>
          actions.map((data) => {
            const missingTopicId = data.topicId ? false : true;
            return { ...data, missingTopicId };
          })
        ),
        map(articles => {
          return articles.sort((a, b) =>
            a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
          );
        }),
        map(articles => articles.filter(article => !article.topicId)),
        catchError(error => {
          console.error(`Error loading articles collection. ${error}`);
          alert(
            `Error loading articles collection for ${this.oshaManual}/${
              industry.id
            }`
          );
          return of([]);
        })
      )
      .subscribe(articles => (this.articles = articles));
  }

  private getTopics(industry): void {
    this.topics = collectionData(
      query(collection(this.appService.db, "topic"), where("industryId", "==", industry.id)),
      { idField: "id" }
    ).pipe(
        map((actions: any[]) => actions.map((data) => ({ ...data }))),
        map(topics => {
          return topics.sort((a, b) =>
            a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
          );
        }),
        catchError(error => {
          console.error(`Error loading topics collection. ${error}`);
          alert(
            `Error loading topics collection for ${this.oshaManual}/${
              industry.id
            }`
          );
          return of([]);
        }),
        share()
      );
  }

  currentIndex = 0;
  public setActiveArticle(article = new Article()): void {
    this.currentIndex = this.articles.findIndex(a => a.id == article.id);
    if (this.confirmNavigation()) {
      this.activeArticle = { ...article };
      this.originalActiveArticle = { ...article };
    }
  }

  private confirmNavigation(): boolean {
    return true;
    // if (
    //   !this.activeArticle.id &&
    //   (this.activeArticle.name || this.activeArticle.content)
    // ) {
    //   return window.confirm(
    //     "You have unsaved changes, are you sure you want to exit?"
    //   );
    // } else if (this.activeArticle.id) {
    //   if (
    //     this.activeArticle.name.localeCompare(this.originalActiveArticle.name) >
    //       0 ||
    //     this.activeArticle.content.localeCompare(
    //       this.originalActiveArticle.content
    //     ) > 0 ||
    //     this.activeArticle.topicId !== this.originalActiveArticle.topicId
    //   )
    //     return window.confirm(
    //       "You have unsaved changes, are you sure you want to exit?"
    //     );
    //   else return true;
    // } else return true;
  }

  public editTopic(): void {
    docData(
      doc(this.appService.db, `${this.oshaManual}/${this.industry.id}/topics/${this.activeArticle.topicId}`),
      { idField: "id" }
    ).pipe(
      map((data: any) => ({ ...data }) as Topic)
    ).subscribe(topic => this.launchTopicDialog(topic));
  }

  public createTopic(): void {
    this.launchTopicDialog(new Topic());
  }

  private launchTopicDialog(topic: Topic): void {
    this.dialog
      .open(TopicDialogComponent, {
        data: {
          industryId: this.industry.id,
          oshaManual: this.oshaManual,
          topic
        }
      })
      .afterClosed()
      .subscribe(topicId => {
        console.log(topicId);
        this.getTopics(this.industry);
        if (topicId == "deleted") {
          this.activeArticle.topicId = null;
        } else if (topicId) this.activeArticle.topicId = topicId; // save it
      });
  }

  public createArticle(): void {
    addDoc(collection(this.appService.db, `${this.oshaManual}/${this.industry.id}/articles`), { ...this.activeArticle })
      .then(
        () => {
          this.originalActiveArticle = this.activeArticle;
          this.snackbar
            .open(`Created Article ${this.activeArticle.name}`, null, {
              duration: 2000
            })
            .afterDismissed()
            .subscribe(() => this.newArticle());
        },
        error => {
          console.error(
            `Error creating article ${this.activeArticle.name}`,
            this.activeArticle,
            error
          );
          alert(`Error creating article ${this.activeArticle.name}`);
        }
      );
  }

  currentTopicId: string;
  public updateArticle(): void {
    this.activeArticle.topicId = this.currentTopicId;
    const id = this.activeArticle.id;
    delete this.activeArticle.id;
    delete this.activeArticle["missingTopicId"];
    updateDoc(doc(this.appService.db, `article/${id}`), { ...this.activeArticle })
      .then(
        () => {
          this.originalActiveArticle = this.activeArticle;
          this.setActiveArticle(this.articles[this.currentIndex]);
          this.snackbar
            .open(`Updated Article ${this.activeArticle.name}`, null, {
              duration: 2000
            })
            .afterDismissed()
            .subscribe(() => {});
        },
        error => {
          console.error(
            `Error updating article ${this.activeArticle.name}`,
            this.activeArticle,
            error
          );
          alert(
            `Error updating article ${
              this.activeArticle.name
            }, falling back to original`
          );
        }
      );
  }

  public previewArticle(): void {
    this.dialog.open(PreviewDialogComponent, {
      data: { ...this.activeArticle }
    });
  }

  public startANewArticle(): void {
    if (this.confirmNavigation()) {
      this.newArticle();
    }
  }

  public resetForm(): void {
    if (this.confirmNavigation()) {
      if (this.activeArticle.id) {
        this.activeArticle = { ...this.originalActiveArticle };
      } else this.newArticle();
    }
  }

  private newArticle(): void {
    setTimeout(() => {
      this.activeArticle = new Article();
      this.originalActiveArticle = new Article();
    }, 100);
  }

  public deleteArticle(): void {
    let deletedArticle = { ...this.activeArticle };
    this.newArticle();
    let deleteArticle = true;
    let snackbarRef = this.snackbar.open(
      `Deleted Article ${deletedArticle.name}`,
      "UNDO",
      { duration: 4000 }
    );
    snackbarRef.onAction().subscribe(() => (deleteArticle = false));
    snackbarRef.afterDismissed().subscribe(() => {
      if (deleteArticle) {
        deleteDoc(
          doc(this.appService.db, `${this.oshaManual}/${this.industry.id}/articles/${deletedArticle.id}`)
        )
          .then(
            () => {},
            error => {
              console.error(
                `Error deleting article ${deletedArticle.name}`,
                deletedArticle,
                error
              );
              alert(`Error deleting article ${deletedArticle.name}`);
              this.activeArticle = deletedArticle;
            }
          );
      } else {
        this.activeArticle = deletedArticle;
      }
    });
  }

  industries1;
  private getIndustries1(): void {
    this.industries1 = collectionData(
      query(collection(this.db, "industries"), orderBy("name", "asc")),
      { idField: "id" }
    ).pipe(
        map((actions: any[]) =>
          actions.map((data) => {
            const topics = this.getTopics1(data.id);
            return { ...data, topics };
          })
        ),
        catchError(error => {
          console.error(`Error loading industries collection. ${error}`);
          alert(`Error loading industries collection for ${this.oshaManual}`);
          return of([]);
        })
      );
  }

  private getTopics1(industryId): Observable<any> {
    return collectionData(
      query(collection(this.db, "topics"), where("industryIds", "array-contains", industryId)),
      { idField: "id" }
    ).pipe(
        map((actions: any[]) =>
          actions.map((data) => {
            const articles = this.getArticles1(data.id);
            return { ...data };
          })
        ),
        // map(topics => {
        //   return topics.sort(
        //     (a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1)
        //   );
        // }),
        catchError(error => {
          console.error(`Error loading topics collection. ${error}`);
          alert(
            `Error loading topics collection for ${
              this.oshaManual
            }/${industryId}`
          );
          return of([]);
        })
      );
  }

  migrate() {
    collectionData(collection(this.db, "article"), { idField: "id" })
      .pipe(
        take(1),
        map((actions: any[]) =>
          actions.map((data) => {
            data["topicId"] = null;
            updateDoc(doc(this.db, `article/${data.id}`), { ...data });
          })
        )
      )
      .subscribe();
  }

  private getArticles1(topicId): Observable<any> {
    return collectionData(collection(this.db, "articles"), { idField: "id" }).pipe(
        map((actions: any[]) => actions.map((data) => ({ ...data }))),
        catchError(error => {
          console.error(`Error loading articles collection. ${error}`);
          alert(`Error loading articles collection for ${topicId}`);
          return of([]);
        })
      );
  }
}

export class Article {
  name: string;
  content: string;
  order: number;
  topicId: string;
  id?: string;
}

@Pipe({
  standalone: true,
  name: "safeHtml"
})
export class Safe {
  constructor(protected _sanitizer: DomSanitizer) {}

  public transform(
    value: string,
    type: string = "html"
  ): SafeHtml | SafeStyle | SafeScript | SafeUrl | SafeResourceUrl {
    switch (type) {
      case "html":
        return this._sanitizer.bypassSecurityTrustHtml(value);
      case "style":
        return this._sanitizer.bypassSecurityTrustStyle(value);
      case "script":
        return this._sanitizer.bypassSecurityTrustScript(value);
      case "url":
        return this._sanitizer.bypassSecurityTrustUrl(value);
      case "resourceUrl":
        return this._sanitizer.bypassSecurityTrustResourceUrl(value);
      default:
        throw new Error(`Invalid safe type specified: ${type}`);
    }
  }
}
