import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'app-images-dialog',
  templateUrl: './images-dialog.component.html',
  styleUrls: ['./images-dialog.component.css'],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class ImagesDialogComponent {

  active = 0;

  constructor(public dialogRef: MatDialogRef<ImagesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any) {
      
    }

    slide(int) {
      let imageLen = this.data.length -1;
      if (imageLen < this.active + int) { // hit top
        this.active = 0;
      } else if (0 > this.active + int) { // hit bottom
        this.active = imageLen;
      } else {
        this.active = this.active + int;
      }
    }

}
