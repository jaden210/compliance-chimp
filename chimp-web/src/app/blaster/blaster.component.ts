import { Component, Inject, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { User } from "src/app/app.service";
import { AccountService, TeamMember } from "../account/account.service";
import { LibraryItem } from "../account/training/training.service";
import { BlasterService } from "./blaster.service";
import { getTagColor } from "../shared/tag-colors";
import { Subscription } from "rxjs";

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
export class BlasterDialog implements OnInit, OnDestroy {
  users: User[] = [];
  teamMembers: TeamMember[] = [];
  filteredUsers: User[] = [];
  userGroups: any;
  srt: string[] = [];
  selectedTags: string[] = [];
  searchTerm: string = '';
  private teamMembersSub: Subscription | null = null;
  

  constructor(
    private accountService: AccountService,
    private _bService: BlasterService,
    public dialogRef: MatDialogRef<BlasterDialog>,
    @Inject(MAT_DIALOG_DATA) public data: {
      libraryItem: LibraryItem
    }
  ) {}

  ngOnInit(): void {
    // Pre-select tags from the library item
    if (this.data?.libraryItem?.assignedTags?.length > 0) {
      this.selectedTags = [...this.data.libraryItem.assignedTags];
    }
    
    this.teamMembersSub = this.accountService.teamMembersObservable.subscribe(users => {
      this.users = users || [];
      this.teamMembers = users || [];
      this.filteredUsers = [...this.users];
      
      // Apply pre-selected tags after users load
      this.applyPreselectedTags();
    });
  }

  ngOnDestroy(): void {
    if (this.teamMembersSub) {
      this.teamMembersSub.unsubscribe();
    }
  }
  
  private applyPreselectedTags(): void {
    // Select all members from pre-selected tags
    this.selectedTags.forEach(tag => {
      const memberIds = this.getMemberIdsForTag(tag);
      memberIds.forEach(id => {
        if (!this.srt.includes(id)) {
          this.srt.push(id);
        }
      });
    });
  }
  
  // Get all unique tags from team members
  get allTags(): string[] {
    const tagsSet = new Set<string>();
    this.teamMembers.forEach(tm => {
      (tm.tags || []).forEach(tag => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }
  
  // Use shared tag color utility
  getTagColor = getTagColor;
  
  getMemberCountForTag(tag: string): number {
    return this.teamMembers.filter(tm => tm.tags?.includes(tag)).length;
  }
  
  getMemberIdsForTag(tag: string): string[] {
    return this.teamMembers
      .filter(tm => tm.tags?.includes(tag) && tm.id)
      .map(tm => tm.id);
  }
  
  isTagSelected(tag: string): boolean {
    return this.selectedTags.includes(tag);
  }
  
  toggleTag(tag: string): void {
    const memberIds = this.getMemberIdsForTag(tag);
    
    if (this.isTagSelected(tag)) {
      this.selectedTags = this.selectedTags.filter(t => t !== tag);
      memberIds.forEach(id => {
        const stillSelectedByTag = this.selectedTags.some(t => 
          this.getMemberIdsForTag(t).includes(id)
        );
        if (!stillSelectedByTag) {
          this.srt = this.srt.filter(u => u !== id);
        }
      });
    } else {
      this.selectedTags.push(tag);
      memberIds.forEach(id => {
        if (!this.srt.includes(id)) {
          this.srt.push(id);
        }
      });
    }
  }
  
  isSelectedViaTag(userId: string): boolean {
    return this.selectedTags.some(tag => 
      this.getMemberIdsForTag(tag).includes(userId)
    );
  }
  
  getTagsForUser(userId: string): string[] {
    const member = this.teamMembers.find(tm => tm.id === userId);
    return member?.tags || [];
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

  /** Count of currently selected trainees who have no phone and no email. */
  get selectedMissingContactCount(): number {
    return this.srt.filter(id => {
      const member = this.teamMembers.find(tm => tm.id === id);
      return member && !member.phone && !member.email;
    }).length;
  }

  save(): void {
    this._bService.createSurvey(this.data.libraryItem, this.srt).then(() => {
      this.dialogRef.close(this.srt);
    });
  }
}
