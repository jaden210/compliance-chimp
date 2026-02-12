import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { AccountService, TeamMember } from "../account.service";

@Component({
  standalone: true,
  selector: "app-contact-info-banner",
  template: `
    @if (missingCount > 0) {
      <div class="contact-info-banner">
        <div class="banner-title-row">
          <mat-icon class="banner-icon">contact_phone</mat-icon>
          <strong>{{ missingCount }} team member{{ missingCount === 1 ? ' is' : 's are' }} missing contact info</strong>
        </div>
        <div class="banner-text">
          <p *ngIf="context === 'team'">
            Surveys and messages can't be sent until you add a phone number or email. Click on a member's row to edit.
          </p>
          <p *ngIf="context !== 'team'">
            Surveys and messages can't be sent until you add a phone number or email.
          </p>
        </div>
        <a
          *ngIf="context !== 'team'"
          mat-stroked-button
          class="banner-action"
          routerLink="/account/team"
        >
          <mat-icon>group</mat-icon>
          Go to Team
        </a>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .contact-info-banner {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      background: rgba(255, 145, 0, 0.1);
      border: 1px solid rgba(255, 145, 0, 0.35);
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 16px;
    }

    .banner-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .banner-icon {
      color: #f57c00;
      font-size: 24px;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }

    .banner-title-row strong {
      font-size: 14px;
      font-weight: 600;
      color: var(--chimp-text-primary);
    }

    .banner-text {
      flex: 1;
      min-width: 0;

      p {
        font-size: 13px;
        color: var(--chimp-text-secondary);
        margin: 4px 0 0 0;
        line-height: 1.4;
      }
    }

    .banner-action {
      flex-shrink: 0;
      border-color: rgba(255, 145, 0, 0.5);
      color: #e65100;
      font-size: 13px;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        margin-right: 4px;
      }

      &:hover {
        background: rgba(255, 145, 0, 0.08);
      }
    }

    @media (max-width: 600px) {
      .contact-info-banner {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
        padding: 12px 14px;
      }

      .banner-title-row strong {
        white-space: normal;
      }

      .banner-action {
        width: 100%;
        text-align: center;
      }
    }
  `],
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class ContactInfoBannerComponent {
  @Input() context: 'dashboard' | 'training' | 'team' = 'dashboard';

  constructor(public accountService: AccountService) {}

  get missingCount(): number {
    if (!this.accountService.teamMembersLoaded || !this.accountService.teamMembers) {
      return 0;
    }
    return this.accountService.teamMembers.filter(
      (m: TeamMember) => !m.phone && !m.email
    ).length;
  }
}
