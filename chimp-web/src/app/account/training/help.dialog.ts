import { Component, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";

@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <div mat-dialog-content [innerHtml]="data"></div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>GOT IT</button>
    </div>
  `,
  styles: [
    `
      .example-radio-group {
        display: inline-flex;
        flex-direction: column;
        margin: 8px 0;
      }

      .example-radio-button {
        margin: 5px;
      }
    `
  ]
})
export class HelpDialog {
  constructor(
    public dialogRef: MatDialogRef<HelpDialog>,
    @Inject(MAT_DIALOG_DATA) public data
  ) {}
}
