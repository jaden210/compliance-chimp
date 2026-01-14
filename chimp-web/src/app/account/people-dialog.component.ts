import { Component, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialog, MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatListModule } from "@angular/material/list";
import { BehaviorSubject } from "rxjs";
import { User } from "src/app/app.service";
import { AccountService } from "./account.service";

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatListModule],
  template: `
    <h1 mat-dialog-title>Filter</h1>
    <div mat-dialog-content>
      <mat-selection-list dense [(ngModel)]="people" style="outline: none;">
        <mat-list-option *ngFor="let user of (users | async)" [value]="user.id">
          <img
            matListAvatar
            [src]="user.profileUrl"
            onerror="src='/assets/face.png'"
          />
          <h3 matLine>{{ user.name }}</h3>
        </mat-list-option>
      </mat-selection-list>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>CANCEL</button>
      <button mat-button (click)="clear()">CLEAR</button>
      <button mat-button (click)="save()" color="primary">APPLY</button>
    </div>
  `
})
export class PeopleDialogComponent {
  users: BehaviorSubject<User[]>;
  people: string[] = [];
  startDate: Date;
  endDate: Date;

  constructor(
    private accountService: AccountService,
    public dialogRef: MatDialogRef<PeopleDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data
  ) {
    this.users = this.accountService.teamManagersObservable;
    this.people = data.people;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
  }

  clear(): void {
    this.people = [];
    this.startDate = null;
    this.endDate = null;
  }

  save(): void {
    this.dialogRef.close({
      people: this.people,
      startDate: this.startDate,
      endDate: this.endDate
    });
  }
}
