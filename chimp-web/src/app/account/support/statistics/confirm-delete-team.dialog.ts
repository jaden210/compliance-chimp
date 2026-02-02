import { Component, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

export interface ConfirmDeleteTeamData {
  teamName: string;
  teamEmail?: string;
}

@Component({
  standalone: true,
  selector: 'confirm-delete-team-dialog',
  template: `
    <h2 mat-dialog-title>Delete Team</h2>
    <mat-dialog-content>
      <p class="warning-text">
        <strong>Warning:</strong> This action is permanent and cannot be undone.
      </p>
      <p>You are about to delete:</p>
      <ul>
        <li><strong>Team:</strong> {{ data.teamName }}</li>
        @if (data.teamEmail) {
          <li><strong>Email:</strong> {{ data.teamEmail }}</li>
        }
      </ul>
      <p>This will permanently delete:</p>
      <ul>
        <li>The team and all its data</li>
        <li>All team members</li>
        <li>All managers/users associated with this team</li>
        <li>All logs, files, surveys, and inspections</li>
        <li>The owner's authentication account</li>
      </ul>
      <mat-form-field class="full-width" appearance="outline">
        <mat-label>Type "DELETE" to confirm</mat-label>
        <input matInput [(ngModel)]="confirmText" placeholder="DELETE">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-flat-button color="warn" [disabled]="confirmText !== 'DELETE'" (click)="onConfirm()">
        Delete Team
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .warning-text {
      color: var(--mat-sys-error);
      background-color: var(--mat-sys-error-container);
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    ul {
      margin: 8px 0;
      padding-left: 24px;
    }
    li {
      margin: 4px 0;
    }
    .full-width {
      width: 100%;
      margin-top: 16px;
    }
    mat-dialog-content {
      min-width: 350px;
    }
  `],
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule
  ]
})
export class ConfirmDeleteTeamDialog {
  private readonly dialogRef = inject(MatDialogRef<ConfirmDeleteTeamDialog>);
  readonly data: ConfirmDeleteTeamData = inject(MAT_DIALOG_DATA);

  confirmText = '';

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
