import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { Clipboard } from "@angular/cdk/clipboard";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

@Component({
  standalone: true,
  selector: "timeout-dialog",
  template: `
    <div class="timeout-dialog">
      <h2>Time's up!</h2>
      
      <p class="quote">
        "I made this challenge because I thought I could get your entire compliance suite 
        setup in 6 minutes or less, but I couldn't. But why should you pay for my mistake?"
      </p>
      <p class="attribution">— The Chimp</p>
      
      <div class="coupon-section">
        <p class="coupon-label">Your consolation prize:</p>
        <div class="coupon-box">
          <span class="coupon-code">ONEMONTHOFCHIMP</span>
          <button mat-icon-button (click)="copyCoupon()" class="copy-btn">
            <mat-icon>content_copy</mat-icon>
          </button>
        </div>
        <p class="coupon-value">1 month free</p>
      </div>
      
      <div class="actions">
        <button mat-flat-button color="accent" (click)="close()">
          Thanks, Chimp!
        </button>
      </div>
    </div>
  `,
  styles: [`
    .timeout-dialog {
      padding: 32px;
      text-align: center;
      max-width: 400px;
    }
    
    h2 {
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 16px 0;
      color: var(--chimp-text-primary);
    }
    
    .quote {
      font-size: 16px;
      font-style: italic;
      color: var(--chimp-text-primary);
      line-height: 1.6;
      margin: 0 0 8px 0;
    }
    
    .attribution {
      font-size: 14px;
      color: var(--chimp-text-secondary);
      margin: 0 0 24px 0;
    }
    
    .coupon-section {
      background: var(--chimp-bg-secondary);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    
    .coupon-label {
      font-size: 14px;
      color: var(--chimp-text-secondary);
      margin: 0 0 12px 0;
    }
    
    .coupon-box {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--chimp-bg-primary);
      border: 2px dashed var(--chimp-accent);
      border-radius: 8px;
      padding: 8px 12px;
    }
    
    .coupon-code {
      font-size: 18px;
      font-weight: 700;
      font-family: 'Monaco', 'Consolas', monospace;
      color: var(--chimp-text-primary);
      letter-spacing: 1px;
    }
    
    .copy-btn {
      color: var(--chimp-accent);
    }
    
    .coupon-value {
      font-size: 16px;
      font-weight: 600;
      color: var(--chimp-accent);
      margin: 12px 0 0 0;
    }
    
    .actions button {
      height: 48px;
      padding: 0 32px;
      font-size: 16px;
      border-radius: 24px;
    }
  `],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule
  ]
})
export class TimeoutDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<TimeoutDialogComponent>,
    private clipboard: Clipboard,
    private snackBar: MatSnackBar
  ) {}

  copyCoupon(): void {
    this.clipboard.copy('ONEMONTHOFCHIMP');
    this.snackBar.open('Coupon code copied!', 'OK', {
      duration: 2000,
      horizontalPosition: 'center'
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
