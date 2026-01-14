import { Component, Inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { User } from "src/app/app.service";
import { AccountService } from "../../account.service";

@Component({
  standalone: true,
  selector: "app-attendance-dialog",
  templateUrl: "./attendance.dialog.html",
  styleUrls: ["./attendance.dialog.css"],
  imports: [
    CommonModule, 
    FormsModule, 
    MatDialogModule, 
    MatButtonModule,
    MatIconModule
  ]
})
export class AttendanceDialog implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  selectedUsers: string[] = [];
  searchTerm: string = '';

  constructor(
    private accountService: AccountService,
    public dialogRef: MatDialogRef<AttendanceDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit(): void {
    this.accountService.teamManagersObservable.subscribe(users => {
      this.users = users || [];
      this.filteredUsers = [...this.users];
    });
  }

  filterUsers(): void {
    if (!this.searchTerm.trim()) {
      this.filteredUsers = [...this.users];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredUsers = this.users.filter(user => 
        user.name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term)
      );
    }
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.filterUsers();
  }

  isSelected(userId: string): boolean {
    return this.selectedUsers.includes(userId);
  }

  toggleUser(user: User): void {
    const index = this.selectedUsers.indexOf(user.id);
    if (index > -1) {
      this.selectedUsers.splice(index, 1);
    } else {
      this.selectedUsers.push(user.id);
    }
  }

  get allSelected(): boolean {
    return this.filteredUsers.length > 0 && 
           this.filteredUsers.every(user => this.selectedUsers.includes(user.id));
  }

  toggleSelectAll(): void {
    if (this.allSelected) {
      // Deselect all filtered users
      this.filteredUsers.forEach(user => {
        const index = this.selectedUsers.indexOf(user.id);
        if (index > -1) {
          this.selectedUsers.splice(index, 1);
        }
      });
    } else {
      // Select all filtered users
      this.filteredUsers.forEach(user => {
        if (!this.selectedUsers.includes(user.id)) {
          this.selectedUsers.push(user.id);
        }
      });
    }
  }

  public setUsersByGroupId(id: string): void {
    this.users.forEach(u => {
      if (u.teams && u.teams.includes(id)) {
        if (!this.selectedUsers.includes(u.id)) {
          this.selectedUsers.push(u.id);
        }
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  save(): void {
    this.dialogRef.close(this.selectedUsers);
  }
}
