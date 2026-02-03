import { Component, Inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatListModule } from "@angular/material/list";
import { MatIconModule } from "@angular/material/icon";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { AccountService, User } from "src/app/account/account.service";

interface FilterUser {
  id: string;
  name: string;
  isChimp?: boolean;
}

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
  users: Observable<FilterUser[]>;

  constructor(
    private accountService: AccountService,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<EventsFilterDialog>
  ) {}

  ngOnInit() {
    // Add "the Chimp" as the first option, then all team managers and members
    this.users = this.accountService.teamManagersObservable.pipe(
      map(managers => {
        const chimpUser: FilterUser = {
          id: 'chimp',
          name: 'the Chimp',
          isChimp: true
        };
        const teamUsers: FilterUser[] = [
          ...managers.map(u => ({ id: u.id, name: u.name })),
          ...this.accountService.teamMembers.map(u => ({ id: u.id, name: u.name }))
        ];
        return [chimpUser, ...teamUsers];
      })
    );
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
      case 'training':
      case 'custom training': return 'school';
      default: return 'event';
    }
  }

  getTypeClass(type: string): string {
    switch (type.toLowerCase()) {
      case 'log': return 'type-log';
      case 'training':
      case 'custom training': return 'type-training';
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
