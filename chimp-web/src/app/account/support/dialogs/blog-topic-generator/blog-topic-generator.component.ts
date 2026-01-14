import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  standalone: true,
  templateUrl: "./blog-topic-generator.component.html",
  styleUrls: ["./blog-topic-generator.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ]
})
export class BlogTopicDialog {
  topic = new BlogTopic();
  constructor(
    public dialogRef: MatDialogRef<BlogTopicDialog>
  ) {}

  close(topic) {
    this.dialogRef.close(topic);
  }
}

export class BlogTopic {
  name?: string;
  createdAt?: any;
}