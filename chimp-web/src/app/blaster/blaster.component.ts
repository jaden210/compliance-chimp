import { Component, Inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { User } from "src/app/app.service";
import { AccountService } from "../account/account.service";
import { LibraryItem } from "../account/training/training.service";
import { BlasterService } from "./blaster.service";

@Component({
  standalone: true,
  templateUrl: "./blaster.component.html",
  styleUrls: ["./blaster.component.scss"],
  imports: [
    CommonModule, 
    FormsModule, 
    MatDialogModule, 
    MatButtonModule, 
    MatIconModule
  ]
})
export class BlasterDialog implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  userGroups: any;
  srt: string[] = [];
  searchTerm: string = '';

  constructor(
    private accountService: AccountService,
    private _bService: BlasterService,
    public dialogRef: MatDialogRef<BlasterDialog>,
    @Inject(MAT_DIALOG_DATA) public data: {
      libraryItem: LibraryItem
    }
  ) {}

  ngOnInit(): void {
    this.accountService.teamMembersObservable.subscribe(users => {
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
    return this.srt.includes(userId);
  }

  toggleUser(user: User): void {
    const index = this.srt.indexOf(user.id);
    if (index > -1) {
      this.srt.splice(index, 1);
    } else {
      this.srt.push(user.id);
    }
  }

  get allSelected(): boolean {
    return this.filteredUsers.length > 0 && 
           this.filteredUsers.every(user => this.srt.includes(user.id));
  }

  toggleSelectAll(): void {
    if (this.allSelected) {
      // Deselect all filtered users
      this.filteredUsers.forEach(user => {
        const index = this.srt.indexOf(user.id);
        if (index > -1) {
          this.srt.splice(index, 1);
        }
      });
    } else {
      // Select all filtered users
      this.filteredUsers.forEach(user => {
        if (!this.srt.includes(user.id)) {
          this.srt.push(user.id);
        }
      });
    }
  }

  public setUsersByGroupId(id: string): void {
    this.users.forEach(u => {
      if (u.teams && u.teams.includes(id)) {
        if (!this.srt.includes(u.id)) {
          this.srt.push(u.id);
        }
      }
    });
  }

  save(): void {
    this._bService.createSurvey(this.data.libraryItem, this.srt).then(() => {
      this.dialogRef.close(this.srt);
    });
  }
}
