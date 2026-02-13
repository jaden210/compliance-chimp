import { Component, OnInit, inject, DestroyRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatBottomSheetRef, MatBottomSheetModule, MAT_BOTTOM_SHEET_DATA } from "@angular/material/bottom-sheet";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { UserService } from "../user.service";
import { getTagColor } from "src/app/shared/tag-colors";
import { ALL_TEAM_TAG } from "../../account/training/training.service";

interface TeamMemberWithSelection {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  preferEmail?: boolean;
  tags?: string[];
  isSelected: boolean;
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="attendance-sheet">
      <!-- Scrollable Content -->
      <div class="sheet-body">
        <!-- Header - scrolls with content -->
        <div class="sheet-header">
          <mat-icon class="header-icon">groups</mat-icon>
          <div class="header-text">
            <h2>Select Attendees</h2>
            <p>Choose who receives this training</p>
          </div>
        </div>
        <!-- Tags Section -->
        @if (allTags.length > 0) {
          <div class="section">
            <div class="section-label">
              <mat-icon>sell</mat-icon>
              <span>Select by Tag</span>
            </div>
            <div class="tags-grid">
              @for (tag of allTags; track tag) {
                <div 
                  class="tag-card" 
                  [class.selected]="isTagSelected(tag)"
                  [style.borderColor]="isTagSelected(tag) ? getTagColor(tag).text : getTagColor(tag).border"
                  [style.backgroundColor]="isTagSelected(tag) ? getTagColor(tag).bg : 'transparent'"
                  (click)="toggleTag(tag)">
                  <span class="tag-dot" [style.backgroundColor]="getTagColor(tag).text"></span>
                  <span class="tag-name">{{ tag }}</span>
                  <span class="tag-count" [style.color]="getTagColor(tag).text">{{ getMemberCountForTag(tag) }}</span>
                  @if (isTagSelected(tag)) {
                    <mat-icon class="tag-check" [style.color]="getTagColor(tag).text">check_circle</mat-icon>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Team Members Section -->
        <div class="section">
          <div class="section-label">
            <mat-icon>person</mat-icon>
            <span>{{ allTags.length > 0 ? 'Or Select Individuals' : 'Select Team Members' }}</span>
          </div>

          <!-- Search -->
          <div class="search-bar">
            <mat-icon>search</mat-icon>
            <input 
              type="text" 
              placeholder="Search team members..." 
              [(ngModel)]="searchTerm"
              (input)="filterUsers()">
            @if (searchTerm) {
              <button mat-icon-button class="clear-btn" (click)="clearSearch()">
                <mat-icon>close</mat-icon>
              </button>
            }
          </div>

          <!-- Select All / Count -->
          <div class="selection-controls">
            <button class="select-all-btn" (click)="toggleSelectAll()">
              <mat-icon>{{ allSelected ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
              {{ allSelected ? 'Deselect All' : 'Select All' }}
            </button>
            <div class="selection-count">
              <span class="count-badge" [class.has-selection]="selectedCount > 0">{{ selectedCount }}</span>
              <span>selected</span>
            </div>
          </div>

          <!-- Users List -->
          @if (filteredUsers.length === 0) {
            <div class="empty-state">
              <mat-icon>person_search</mat-icon>
              <p>No team members found</p>
            </div>
          } @else {
            <div class="users-list">
              @for (user of filteredUsers; track user.id) {
                <div 
                  class="user-card" 
                  [class.selected]="user.isSelected"
                  (click)="toggleUser(user)">
                  <div class="user-checkbox">
                    @if (user.isSelected) {
                      <mat-icon class="checked">check_box</mat-icon>
                    } @else {
                      <mat-icon>check_box_outline_blank</mat-icon>
                    }
                  </div>
                  <div class="user-info">
                    <div class="user-name">{{ user.name }}</div>
                    @if (user.preferEmail && user.email) {
                      <div class="user-contact">{{ user.email }}</div>
                    } @else if (user.phone) {
                      <div class="user-contact">{{ user.phone }}</div>
                    }
                    @if (user.tags?.length) {
                      <div class="user-tags">
                        @for (tag of user.tags; track tag) {
                          <span 
                            class="user-tag"
                            [style.backgroundColor]="getTagColor(tag).bg"
                            [style.color]="getTagColor(tag).text"
                            [style.borderColor]="getTagColor(tag).border">
                            {{ tag }}
                          </span>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Fixed Footer -->
      <div class="sheet-footer">
        <button mat-stroked-button class="cancel-btn" (click)="close()">Cancel</button>
        <button 
          mat-flat-button 
          color="accent" 
          class="start-btn"
          [disabled]="selectedCount === 0"
          (click)="startTraining()">
          <mat-icon>play_circle</mat-icon>
          Start ({{ selectedCount }})
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      /* Remove default bottom sheet padding */
      margin: -16px -16px 0;
    }

    .attendance-sheet {
      display: flex;
      flex-direction: column;
      height: 80vh;
      max-height: 80vh;
      background: #fff;
    }

    /* Body - scrollable, includes header */
    .sheet-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      -webkit-overflow-scrolling: touch;
    }

    /* Header - compact, scrolls with content */
    .sheet-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--chimp-border-light, #e5e7eb);
      margin-bottom: 4px;
    }

    .header-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: var(--chimp-success, #4caf50);
      flex-shrink: 0;
    }

    .header-text {
      flex: 1;
      min-width: 0;
    }

    .header-text h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--chimp-text-primary, #1f2937);
    }

    .header-text p {
      margin: 0;
      font-size: 12px;
      color: var(--chimp-text-secondary, #6b7280);
    }

    /* Section */
    .section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .section-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--chimp-text-hint, #9ca3af);
    }

    .section-label mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* Tags Grid - matches desktop */
    .tags-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tag-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1.5px solid;
      border-radius: 20px;
      cursor: pointer;
      transition: all 150ms ease;
      background: var(--chimp-bg-primary, #fff);
    }

    .tag-card:active {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.15);
    }

    .tag-card.selected {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.15);
    }

    .tag-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .tag-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--chimp-text-primary, #1f2937);
    }

    .tag-count {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.06);
    }

    .tag-check {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-left: -4px;
    }

    /* Search Bar - matches desktop */
    .search-bar {
      display: flex;
      align-items: center;
      background: var(--chimp-gray-50, #fafafa);
      border: 1px solid var(--chimp-border-light, #e5e7eb);
      border-radius: 12px;
      padding: 10px 14px;
      transition: all 150ms ease;
    }

    .search-bar:focus-within {
      border-color: var(--chimp-primary, #054d8a);
      background: var(--chimp-bg-primary, #fff);
      box-shadow: 0 0 0 3px rgba(5, 77, 138, 0.1);
    }

    .search-bar mat-icon {
      color: var(--chimp-text-hint, #9ca3af);
      margin-right: 10px;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .search-bar input {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 14px;
      color: var(--chimp-text-primary, #1f2937);
    }

    .search-bar input::placeholder {
      color: var(--chimp-text-hint, #9ca3af);
    }

    .clear-btn {
      margin: -6px -6px -6px 4px;
      width: 28px;
      height: 28px;
    }

    .clear-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin: 0;
    }

    /* Selection Controls - matches desktop */
    .selection-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .select-all-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 16px;
      height: 36px;
      border: 1px solid var(--chimp-border-light, #e5e7eb);
      border-radius: 20px;
      background: #fff;
      font-size: 13px;
      font-weight: 500;
      color: var(--chimp-text-secondary, #6b7280);
      cursor: pointer;
    }

    .select-all-btn:active {
      background: var(--chimp-gray-50, #fafafa);
    }

    .select-all-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 6px;
    }

    .selection-count {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 8px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      background: var(--chimp-gray-100, #f5f5f5);
      color: var(--chimp-text-hint, #9ca3af);
    }

    .count-badge.has-selection {
      background: rgba(76, 175, 80, 0.15);
      color: var(--chimp-success, #4caf50);
    }

    .count-label {
      font-size: 13px;
      color: var(--chimp-text-secondary, #6b7280);
    }

    /* Empty State - matches desktop */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px;
      text-align: center;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--chimp-text-hint, #9ca3af);
      opacity: 0.5;
      margin-bottom: 12px;
    }

    .empty-state p {
      margin: 0;
      font-size: 14px;
      color: var(--chimp-text-secondary, #6b7280);
    }

    /* Users List - matches desktop */
    .users-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .user-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: var(--chimp-bg-primary, #fff);
      border: 1px solid var(--chimp-border-light, #e5e7eb);
      border-radius: 10px;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .user-card:active {
      border-color: var(--chimp-primary, #054d8a);
      background: var(--chimp-gray-50, #fafafa);
    }

    .user-card.selected {
      border-color: var(--chimp-success, #4caf50);
      background: rgba(76, 175, 80, 0.04);
    }

    .user-checkbox {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--chimp-text-hint, #9ca3af);
    }

    .user-checkbox mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    .user-checkbox mat-icon.checked {
      color: var(--chimp-success, #4caf50);
    }

    .user-info {
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--chimp-text-primary, #1f2937);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-contact {
      font-size: 12px;
      color: var(--chimp-text-hint, #9ca3af);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }

    .user-tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 500;
      border: 1px solid;
      white-space: nowrap;
    }

    /* Footer - fixed at bottom */
    .sheet-footer {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-top: 1px solid var(--chimp-border-light, #e5e7eb);
      background: #fff;
      padding-bottom: max(12px, env(safe-area-inset-bottom));
    }

    .cancel-btn {
      flex: 1;
      height: 44px;
      border-radius: 22px;
    }

    .start-btn {
      flex: 2;
      height: 44px;
      border-radius: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .start-btn mat-icon {
      margin-right: 4px;
    }
  `]
})
export class AttendanceComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly bsr = inject(MatBottomSheetRef<AttendanceComponent>);
  private readonly data = inject<any>(MAT_BOTTOM_SHEET_DATA);
  private readonly destroyRef = inject(DestroyRef);

  users: TeamMemberWithSelection[] = [];
  filteredUsers: TeamMemberWithSelection[] = [];
  selectedTags: string[] = [];
  searchTerm: string = '';

  // Expose getTagColor to template
  getTagColor = getTagColor;

  ngOnInit() {
    // Pre-select tags from article (empty = All for team-wide)
    const tags = this.data?.assignedTags?.filter(Boolean) || [];
    if (tags.length > 0) {
      this.selectedTags = [...tags];
    } else {
      this.selectedTags = [ALL_TEAM_TAG];
    }

    this.userService.teamMembersObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(members => {
        if (members) {
          this.users = members.map(m => ({
            id: m.id,
            name: m.name,
            email: m.email,
            phone: m.phone,
            preferEmail: m.preferEmail,
            tags: m.tags || [],
            isSelected: false
          }));
          this.filteredUsers = [...this.users];
          
          // Apply pre-selected tags after users load
          this.applyPreselectedTags();
        }
      });
  }

  private applyPreselectedTags(): void {
    this.selectedTags.forEach(tag => {
      if (tag === ALL_TEAM_TAG) {
        this.users.forEach(user => { user.isSelected = true; });
      } else {
        this.users.forEach(user => {
          if (user.tags?.includes(tag)) {
            user.isSelected = true;
          }
        });
      }
    });
    // Update filtered users to reflect selection
    this.filteredUsers = [...this.users];
  }

  get allTags(): string[] {
    const tagsSet = new Set<string>([ALL_TEAM_TAG]);
    this.users.forEach(u => {
      (u.tags || []).forEach(tag => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }

  get selectedCount(): number {
    return this.users.filter(u => u.isSelected).length;
  }

  get allSelected(): boolean {
    return this.filteredUsers.length > 0 && 
           this.filteredUsers.every(u => u.isSelected);
  }

  getMemberCountForTag(tag: string): number {
    if (tag === ALL_TEAM_TAG) return this.users.length;
    return this.users.filter(u => u.tags?.includes(tag)).length;
  }

  isTagSelected(tag: string): boolean {
    return this.selectedTags.includes(tag);
  }

  toggleTag(tag: string): void {
    if (tag === ALL_TEAM_TAG) {
      if (this.isTagSelected(tag)) {
        this.selectedTags = this.selectedTags.filter(t => t !== tag);
        this.users.forEach(u => { u.isSelected = false; });
      } else {
        this.selectedTags.push(tag);
        this.users.forEach(u => { u.isSelected = true; });
      }
      return;
    }
    if (this.isTagSelected(tag)) {
      this.selectedTags = this.selectedTags.filter(t => t !== tag);
      this.users.forEach(user => {
        if (user.tags?.includes(tag)) {
          const hasOtherSelectedTag = this.selectedTags.some(t => t === ALL_TEAM_TAG || user.tags?.includes(t));
          if (!hasOtherSelectedTag) {
            user.isSelected = false;
          }
        }
      });
    } else {
      this.selectedTags.push(tag);
      this.users.forEach(user => {
        if (user.tags?.includes(tag)) {
          user.isSelected = true;
        }
      });
    }
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

  toggleUser(user: TeamMemberWithSelection): void {
    user.isSelected = !user.isSelected;
  }

  toggleSelectAll(): void {
    const shouldSelect = !this.allSelected;
    this.filteredUsers.forEach(user => {
      user.isSelected = shouldSelect;
    });
  }

  startTraining(): void {
    const trainees = this.users
      .filter(u => u.isSelected)
      .map(u => u.id);
    this.bsr.dismiss({ startTraining: true, trainees });
  }

  close(): void {
    this.bsr.dismiss({ startTraining: false });
  }
}
