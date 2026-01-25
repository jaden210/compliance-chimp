import { Component, Inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatListModule } from "@angular/material/list";
import { MatIconModule } from "@angular/material/icon";
import { BehaviorSubject } from "rxjs";
import { AccountService, User } from "src/app/account/account.service";

@Component({
  standalone: true,
  templateUrl: "./filter.dialog.html",
  styleUrls: ["filter.dialog.css"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatListModule,
    MatIconModule
  ]
})
export class EventsFilterDialog implements OnInit {
  users: BehaviorSubject<User[]>;

  constructor(
    private accountService: AccountService,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<EventsFilterDialog>
  ) {}

  ngOnInit() {
    this.users = this.accountService.teamManagersObservable;
  }

  getTypeIcon(type: string): string {
    switch (type.toLowerCase()) {
      case 'log': return 'description';
      case 'timeclock': return 'schedule';
      case 'member': return 'person';
      case 'incident report': return 'warning';
      case 'self inspection': return 'checklist';
      case 'survey': return 'poll';
      case 'survey response': return 'how_to_vote';
      case 'training': return 'school';
      default: return 'event';
    }
  }

  getTypeClass(type: string): string {
    switch (type.toLowerCase()) {
      case 'log': return 'type-log';
      case 'training': return 'type-training';
      case 'survey': 
      case 'survey response': return 'type-survey';
      case 'member': return 'type-member';
      case 'timeclock': return 'type-timeclock';
      case 'incident report': return 'type-incident';
      case 'self inspection': return 'type-inspection';
      default: return 'type-log';
    }
  }

  public clear(): void {
    this.data.filterUsers = [];
    this.data.filterTypes = [];
  }

  public apply(): void {
    this.dialogRef.close(this.data);
  }
}
