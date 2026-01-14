import { Component, OnInit, Pipe, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map, catchError, switchMap } from "rxjs/operators";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable, from, of, throwError } from 'rxjs';

@Component({
  standalone: true,
  templateUrl: "./blog-video-upload.component.html",
  styleUrls: ["./blog-video-upload.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule
  ]
})
export class BlogVideoDialog {
  previewImg;
  image;
  uploadProgress;

  constructor(
    public dialogRef: MatDialogRef<BlogVideoDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private storage: Storage
  ) {
  }

  public getVideo(): void {
    document.getElementById("image-input").click();
  }

  public setVideo(event): void {
    // callback from view
    if (event.target.files && event.target.files[0]) {
      var reader = new FileReader();
      reader.onload = (event: ProgressEvent) => {
        this.previewImg = (<FileReader>event.target).result;
      };
      reader.readAsDataURL(event.target.files[0]);
      this.image = event.target.files[0];
      this.uploadVideo().subscribe(videoUrl => {
        this.data.videoUrl = videoUrl;
      })
    } else {
      this.previewImg = undefined; // broken image
      this.image = undefined;
    }
  }

  public uploadVideo(): Observable<string> {
    const date = new Date().getTime();
    const filePath = `BlogVideos/${date}`;
    const storageRef = ref(this.storage, filePath);
    this.uploadProgress = of(0);
    return from(uploadBytes(storageRef, this.image)).pipe(
      map(() => {
        this.uploadProgress = of(100);
        return true;
      }),
      switchMap(() => from(getDownloadURL(storageRef))),
      catchError(error => {
        console.error(`Error saving image for topic`, error);
        return throwError(() => error);
      })
    );
  }

  close() {
    this.dialogRef.close(this.data);
  }
}