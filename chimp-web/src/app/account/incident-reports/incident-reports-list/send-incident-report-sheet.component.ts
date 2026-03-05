import { Component, OnInit, inject, DestroyRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatBottomSheetRef, MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { AccountService, TeamMember } from "../../account.service";

interface TeamMemberWithSelection extends TeamMember {
  isSelected: boolean;
}

@Component({
  standalone: true,
  selector: "app-send-incident-report-sheet",
  imports: [
    CommonModule,
    FormsModule,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="sheet">
      <div class="sheet-body">
        <div class="sheet-header">
          <mat-icon class="header-icon">assignment_late</mat-icon>
          <div class="header-text">
            <h2>Who needs to file a report?</h2>
            <p>They'll receive a link via text or email to fill it out</p>
          </div>
        </div>

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

        @if (filteredUsers.length === 0) {
          <div class="empty-list-state">
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
                <div class="user-avatar" [class.selected]="user.isSelected">
                  {{ user.name?.charAt(0)?.toUpperCase() || '?' }}
                </div>
                <div class="user-info">
                  <div class="user-name">{{ user.name }}</div>
                  @if (user.preferEmail && user.email) {
                    <div class="user-contact">
                      <mat-icon>email</mat-icon>
                      {{ user.email }}
                    </div>
                  } @else if (user.phone) {
                    <div class="user-contact">
                      <mat-icon>sms</mat-icon>
                      {{ user.phone }}
                    </div>
                  } @else {
                    <div class="user-contact no-contact">No contact info on file</div>
                  }
                </div>
                @if (user.isSelected) {
                  <mat-icon class="selected-check">check_circle</mat-icon>
                }
              </div>
            }
          </div>
        }
      </div>

      <div class="sheet-footer">
        <button mat-stroked-button class="cancel-btn" (click)="close()">Cancel</button>
        <button
          mat-flat-button
          color="accent"
          class="send-btn"
          [disabled]="selectedCount === 0"
          (click)="send()">
          <mat-icon>send</mat-icon>
          Send Report{{ selectedCount > 1 ? ' (' + selectedCount + ')' : '' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      margin: -16px -16px 0;
    }

    .sheet {
      display: flex;
      flex-direction: column;
      height: 80vh;
      max-height: 80vh;
      background: #fff;
    }

    .sheet-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      -webkit-overflow-scrolling: touch;
    }

    .sheet-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--chimp-border-light, #e5e7eb);
    }

    .header-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: var(--chimp-accent, #ff9100);
      flex-shrink: 0;
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
      background: #fff;
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

    .empty-list-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 16px;
      text-align: center;
    }

    .empty-list-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--chimp-text-hint, #9ca3af);
      opacity: 0.5;
      margin-bottom: 12px;
    }

    .empty-list-state p {
      margin: 0;
      font-size: 14px;
      color: var(--chimp-text-secondary, #6b7280);
    }

    .users-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .user-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: #fff;
      border: 1px solid var(--chimp-border-light, #e5e7eb);
      border-radius: 12px;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .user-card:active {
      background: var(--chimp-gray-50, #fafafa);
    }

    .user-card.selected {
      border-color: var(--chimp-accent, #ff9100);
      background: rgba(255, 145, 0, 0.04);
    }

    .user-avatar {
      flex-shrink: 0;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--chimp-gray-100, #f3f4f6);
      color: var(--chimp-text-secondary, #6b7280);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 700;
      transition: all 150ms ease;
    }

    .user-avatar.selected {
      background: rgba(255, 145, 0, 0.15);
      color: var(--chimp-accent, #ff9100);
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
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--chimp-text-hint, #9ca3af);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-contact mat-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
      flex-shrink: 0;
    }

    .user-contact.no-contact {
      color: var(--chimp-error, #ef4444);
      font-style: italic;
    }

    .selected-check {
      flex-shrink: 0;
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: var(--chimp-accent, #ff9100);
    }

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

    .send-btn {
      flex: 2;
      height: 44px;
      border-radius: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .send-btn mat-icon {
      margin-right: 4px;
    }
  `]
})
export class SendIncidentReportSheetComponent implements OnInit {
  private readonly accountService = inject(AccountService);
  private readonly bsr = inject(MatBottomSheetRef<SendIncidentReportSheetComponent>);
  private readonly destroyRef = inject(DestroyRef);

  users: TeamMemberWithSelection[] = [];
  filteredUsers: TeamMemberWithSelection[] = [];
  searchTerm = '';

  ngOnInit() {
    this.accountService.teamMembersObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(members => {
        if (members) {
          this.users = members.map(m => ({ ...m, isSelected: false }));
          this.filteredUsers = [...this.users];
        }
      });
  }

  get selectedCount(): number {
    return this.users.filter(u => u.isSelected).length;
  }

  filterUsers(): void {
    if (!this.searchTerm.trim()) {
      this.filteredUsers = [...this.users];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredUsers = this.users.filter(user =>
        user.name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.phone?.includes(term)
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

  send(): void {
    const recipients = this.users.filter(u => u.isSelected);
    this.bsr.dismiss({ sent: true, recipients });
  }

  close(): void {
    this.bsr.dismiss({ sent: false });
  }
}
