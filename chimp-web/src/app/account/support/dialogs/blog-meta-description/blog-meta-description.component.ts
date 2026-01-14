import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';


@Component({
  standalone: true,
  templateUrl: "./blog-meta-description.component.html",
  styleUrls: ["./blog-meta-description.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ]
})
export class BlogMetaDescriptionDialog {
  constructor(
    public dialogRef: MatDialogRef<BlogMetaDescriptionDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  close() {
    this.dialogRef.close(this.data);
  }
}