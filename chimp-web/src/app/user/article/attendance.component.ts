import { Component, OnInit, inject, DestroyRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatBottomSheetRef, MatBottomSheetModule, MAT_BOTTOM_SHEET_DATA } from "@angular/material/bottom-sheet";
import { MatDialogModule } from "@angular/material/dialog";
import { MatListModule } from "@angular/material/list";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { UserService } from "../user.service";

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatBottomSheetModule,
    MatDialogModule,
    MatListModule,
    MatCheckboxModule,
    MatButtonModule,
    MatFormFieldModule
  ],
  template: `
    <mat-list>
      <mat-label>Who's in Attendance?</mat-label>
      @for (user of users; track user.id) {
        <mat-list-item>
          <mat-checkbox [(ngModel)]="user.isChecked">{{ user.name }}</mat-checkbox>
        </mat-list-item>
      }
    </mat-list>
    <button mat-raised-button color="primary" style="width: 100%; margin: 24px 0;" [disabled]="Trainees === 0" (click)="startTraining()">
      START TRAINING {{ Trainees }}
    </button>
  `
})
export class AttendanceComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly bsr = inject(MatBottomSheetRef<AttendanceComponent>);
  private readonly data = inject<any>(MAT_BOTTOM_SHEET_DATA);
  private readonly destroyRef = inject(DestroyRef);

  users: any[] = [];

  ngOnInit() {
    const trainees = this.data.trainees || [];
    this.userService.teamMembersObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(users => {
        if (users) {
          this.users = users.map(user => ({
            ...user,
            isChecked: trainees.includes(user.id)
          }));
        }
      });
  }

  public get Trainees(): number {
    return this.users?.filter(user => user.isChecked).length || 0;
  }

  startTraining() {
    const trainees = this.users
      .filter(user => user.isChecked)
      .map(attendee => attendee.id);
    this.bsr.dismiss({ startTraining: true, trainees });
  }

  close() {
    this.bsr.dismiss({ startTraining: false });
  }
}
