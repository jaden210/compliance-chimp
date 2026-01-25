import { Component, Inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from "@angular/fire/storage";
import { catchError, switchMap } from "rxjs/operators";
import { Observable, of, throwError, from } from "rxjs";
import { Firestore, collection, addDoc, doc, updateDoc, deleteDoc } from "@angular/fire/firestore";

@Component({
  standalone: true,
  templateUrl: "./topic-dialog.component.html",
  styleUrls: ["topic-dialog.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule
  ]
})
export class TopicDialogComponent implements OnInit {
  private industryId: string;
  private oshaManual: string;
  public topic: Topic;
  public image: any;
  public isEdit: boolean;
  public errorMessage: string;
  public previewImg: any;
  public loading: boolean;

  constructor(
    public dialogRef: MatDialogRef<TopicDialogComponent>,
    private storage: Storage,
    public db: Firestore,
    @Inject(MAT_DIALOG_DATA) private data: any
  ) {}

  ngOnInit() {
    this.topic = this.data.topic;
    this.industryId = this.data.industryId;
    this.oshaManual = this.data.oshaManual;
    this.isEdit = this.topic.id ? true : false;
  }

  public getImage(): void {
    document.getElementById("image-input").click();
  }

  public setImage(event): void {
    // callback from view
    if (event.target.files && event.target.files[0]) {
      var reader = new FileReader();
      reader.onload = (event: ProgressEvent) => {
        this.previewImg = (<FileReader>event.target).result;
      };
      reader.readAsDataURL(event.target.files[0]);
      this.image = event.target.files[0];
    } else {
      this.previewImg = undefined; // broken image
      this.image = undefined;
    }
  }

  public createTopic(): void {
    this.uploadImage().subscribe(imageUrl => {
      this.topic.imageUrl = imageUrl;
      const cleanedTopic = Object.fromEntries(
        Object.entries(this.topic).filter(([_, v]) => v !== undefined)
      );
      addDoc(collection(this.db, `${this.oshaManual}/${this.industryId}/topics`), cleanedTopic)
        .then(
          document => this.dialogRef.close(document.id),
          error => {
            this.loading = false;
            console.error(
              `Error creating topic ${this.topic.name}`,
              this.topic,
              error
            );
            this.errorMessage = `Error creating topic`;
          }
        );
    });
  }

  public editTopic(): void {
    if (this.topic.imageUrl)
      deleteObject(ref(this.storage, this.topic.imageUrl));
    this.uploadImage().subscribe(imageUrl => {
      this.topic.imageUrl = imageUrl;
      const cleanedTopic = Object.fromEntries(
        Object.entries(this.topic).filter(([_, v]) => v !== undefined)
      );
      updateDoc(doc(this.db, `${this.oshaManual}/${this.industryId}/topics/${this.topic.id}`), cleanedTopic)
        .then(
          () => this.dialogRef.close(this.topic.id),
          error => {
            this.loading = false;
            console.error(
              `Error updating topic ${this.topic.name}`,
              this.topic,
              error
            );
            this.errorMessage = `Error updating topic`;
          }
        );
    });
  }

  public deleteTopic(): void {
    if (
      window.confirm(
        `Are you sure you want to delete topic ${this.topic.name}?`
      )
    ) {
      if (this.topic.imageUrl)
        deleteObject(ref(this.storage, this.topic.imageUrl));
      deleteDoc(doc(this.db, `${this.oshaManual}/${this.industryId}/topics/${this.topic.id}`))
        .then(
          () => this.dialogRef.close("deleted"),
          error => {
            this.loading = false;
            console.error(
              `Error deleting topic ${this.topic.name}`,
              this.topic,
              error
            );
            this.errorMessage = `Error deleting topic`;
          }
        );
    }
  }

  private uploadImage(): Observable<string> {
    this.loading = true;
    if (this.image) {
      const filePath = `${this.oshaManual}/${this.industryId}/topicImage/${this.topic.name}`;
      const storageRef = ref(this.storage, filePath);
      return from(uploadBytes(storageRef, this.image)).pipe(
        switchMap(() => getDownloadURL(storageRef)),
        catchError(error => {
          console.error(
            `Error saving image for topic ${this.topic.name}`,
            this.topic,
            error
          );
          this.errorMessage = `Error saving image`;
          return throwError(error);
        })
      );
    } else return of(null);
  }

  public deleteImage(): void {
    this.image = undefined;
    this.previewImg = undefined;
  }
}

export class Topic {
  name: string;
  imageUrl: string;
  id?: string;
}
