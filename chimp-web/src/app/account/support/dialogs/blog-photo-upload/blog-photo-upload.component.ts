import { Component, OnInit, Pipe, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { catchError, switchMap } from "rxjs/operators";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable, from, throwError } from 'rxjs';

@Component({
  standalone: true,
  templateUrl: "./blog-photo-upload.component.html",
  styleUrls: ["./blog-photo-upload.component.css"],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class BlogPhotoDialog {
  previewImg;
  image;

  constructor(
    public dialogRef: MatDialogRef<BlogPhotoDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private storage: Storage
  ) {
    this.previewImg = this.data.imageUrl || null;
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

  public uploadImage(): Observable<string> {
    const date = new Date().getTime();
    const filePath = `BlogImages/${date}`;
    const storageRef = ref(this.storage, filePath);
    return from(uploadBytes(storageRef, this.image)).pipe(
      switchMap(() => from(getDownloadURL(storageRef))),
      catchError(error => {
        console.error(`Error saving image for topic`, error);
        return throwError(() => error);
      })
    );
  }

  close() {
    this.uploadImage().subscribe(imageUrl => {
      this.data.imageUrl = imageUrl;
    })
    this.dialogRef.close(this.data);
  }
}