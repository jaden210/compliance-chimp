import { Component, Inject, OnInit } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatListModule } from "@angular/material/list";
import { MatIconModule } from "@angular/material/icon";
import { User } from "src/app/app.service";
import { AccountService } from "../../account.service";

@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatListModule, MatIconModule],
  providers: [DatePipe],
  template: `
    <h1 mat-dialog-title>Training Status</h1>
    <div mat-dialog-content style="padding: 0;">
      <mat-list dense style="outline: none;">
        <mat-list-item *ngFor="let user of srt">
          <img
            matListAvatar
            [src]="user.profileUrl"
            onerror="src='/assets/face.png'"
          />
          <h3 matLine>{{ user.name }}</h3>
          <span matLine>
            <mat-icon *ngIf="user.isExpired">error_outline</mat-icon>
            <ng-template #good>
              <mat-icon id="good">check_circle_outline</mat-icon>
            </ng-template>
            {{ user.lastTrained }}
          </span>
        </mat-list-item>
      </mat-list>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>CANCEL</button>
      <button mat-button (click)="seeHistory()" color="primary">
        SEE HISTORY
      </button>
    </div>
  `,
  styles: [
    `
      span {
        display: flex !important;
        align-items: center;
      }
      mat-icon {
        height: 14px;
        width: 14px;
        font-size: 14px;
        color: #e91e63 !important;
        margin-right: 4px;
      }
      .good {
        color: #4caf50 !important;
      }
    `
  ]
})
export class TrainingStatusDialog implements OnInit {
  users: User[];
  srt: any[] = [];

  constructor(
    private accountService: AccountService,
    private dialogRef: MatDialogRef<TrainingStatusDialog>,
    private dataPipe: DatePipe,
    @Inject(MAT_DIALOG_DATA) public data
  ) {}

  ngOnInit() {
    this.users = this.accountService.teamManagers || [];
    const srtObj = this.data.srtObj;
    const needsTraining: string[] = this.data.needsTraining || [];
    for (let srt in srtObj) {
      const user = this.users.find(user => user.id == srt);
      const msLastTrained = srtObj[srt];
      const isExpired = needsTraining.includes(srt);
      const lastTrained = !msLastTrained
        ? "Hasn't received training on this article"
        : `Last trained on ${this.dataPipe.transform(new Date(srtObj[srt]))}`;
      this.srt.push({ ...user, lastTrained, isExpired });
    }
  }

  seeHistory(): void {
    this.dialogRef.close(true);
  }
}
