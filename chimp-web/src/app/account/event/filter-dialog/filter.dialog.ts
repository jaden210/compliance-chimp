import { Component, Inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatListModule } from "@angular/material/list";
import { MatSelectionList } from "@angular/material/list";
import { BehaviorSubject } from "rxjs";
import { AccountService, User } from "src/app/account/account.service";

@Component({
  standalone: true,
  templateUrl: "./filter.dialog.html",
  styleUrls: ["filter.dialog.css"],
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatListModule]
})
export class EventsFilterDialog implements OnInit {
  users: BehaviorSubject<User[]>;
  title: string = "Filter History Results";

  constructor(
    private accountService: AccountService,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<EventsFilterDialog>
  ) {}

  ngOnInit() {
    this.users = this.accountService.teamManagersObservable;
  }  

  public clear(): void {
    this.data.filterUsers = [];
    this.data.filterTypes = [];
  }

  public apply(): void {
    this.dialogRef.close(this.data);
  }
}
