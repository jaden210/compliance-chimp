import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

@Component({
  standalone: true,
  selector: "checkout-success-dialog",
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  styleUrls: ["./account.component.css"],
  template: `
    <div class="checkout-success-dialog">
      <div class="dialog-layout">
        <div class="dialog-image celebrate">
          <img src="assets/chimpCelebrate.png" alt="Chimp celebrating" />
        </div>

        <div class="dialog-content">
          <h2 mat-dialog-title>Good call.</h2>

          <p class="dialog-message">
            Your account is live. I'm already keeping an eye on your compliance program, so you can focus on running your business.
          </p>

          <div class="benefits">
            <div class="benefit">
              <mat-icon>check_circle</mat-icon>
              <span>Everything is unlocked, nothing held back</span>
            </div>
            <div class="benefit">
              <mat-icon>check_circle</mat-icon>
              <span>Cancel whenever you want, no questions asked</span>
            </div>
            <div class="benefit">
              <mat-icon>check_circle</mat-icon>
              <span>Add as many team members as you need</span>
            </div>
          </div>

          <div class="chimpchat-tip">
            <mat-icon>chat</mat-icon>
            <span>If you need anything, open <strong>ChimpChat</strong>. I don't take days off.</span>
          </div>

          <mat-dialog-actions>
            <button mat-flat-button color="accent" (click)="close()">
              Go to Dashboard
            </button>
          </mat-dialog-actions>
        </div>
      </div>
    </div>
  `
})
export class CheckoutSuccessDialog {
  constructor(public dialogRef: MatDialogRef<CheckoutSuccessDialog>) {}

  close(): void {
    this.dialogRef.close();
  }
}
