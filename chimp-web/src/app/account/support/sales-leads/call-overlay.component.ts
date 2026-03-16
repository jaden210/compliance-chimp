import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TwilioPhoneService } from './twilio-phone.service';

@Component({
  selector: 'app-call-overlay',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    @if (phone.incomingCall(); as incoming) {
      <div class="call-banner incoming">
        <div class="call-pulse"></div>
        <div class="call-info">
          <mat-icon>phone_callback</mat-icon>
          <div class="caller-details">
            <span class="caller-name">
              {{ incoming.businessName || incoming.callerName || 'Incoming Call' }}
            </span>
            <span class="caller-number">{{ incoming.callerNumber }}</span>
          </div>
        </div>
        <div class="call-actions">
          <button mat-flat-button class="accept-btn" (click)="phone.acceptIncoming()">
            <mat-icon>call</mat-icon> Accept
          </button>
          <button mat-flat-button class="decline-btn" (click)="phone.declineIncoming()">
            <mat-icon>call_end</mat-icon> Decline
          </button>
        </div>
      </div>
    }

    @if (phone.callActive()) {
      <div class="call-banner active">
        <div class="call-info">
          <mat-icon class="pulse-icon">phone_in_talk</mat-icon>
          <span class="active-label">Call in progress</span>
        </div>
        <div class="call-actions">
          <button mat-flat-button class="mute-btn" [class.muted]="phone.callMuted()" (click)="phone.toggleMute()">
            <mat-icon>{{ phone.callMuted() ? 'mic_off' : 'mic' }}</mat-icon>
            {{ phone.callMuted() ? 'Unmute' : 'Mute' }}
          </button>
          <button mat-flat-button class="hangup-btn" (click)="phone.hangUp()">
            <mat-icon>call_end</mat-icon> Hang Up
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .call-banner {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2000;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 22px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
      min-width: 380px;
      max-width: 560px;
      color: white;
    }

    .call-banner.incoming {
      background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%);
      animation: slideDown 0.3s ease;
    }

    .call-banner.active {
      background: linear-gradient(135deg, #054d8a 0%, #1565c0 100%);
    }

    @keyframes slideDown {
      from { transform: translateX(-50%) translateY(-120%); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }

    .call-pulse {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #69f0ae;
      animation: pulse 1s infinite;
      flex-shrink: 0;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.4); }
    }

    .call-info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
    }

    .caller-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .caller-name {
      font-weight: 700;
      font-size: 15px;
      line-height: 1.2;
    }

    .caller-number {
      font-size: 12px;
      opacity: 0.75;
    }

    .pulse-icon {
      animation: pulse 2s infinite;
    }

    .active-label {
      font-weight: 600;
      font-size: 14px;
    }

    .call-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .accept-btn {
      background: #4caf50 !important;
      color: white !important;
    }

    .decline-btn,
    .hangup-btn {
      background: #d32f2f !important;
      color: white !important;
    }

    .mute-btn {
      background: rgba(255, 255, 255, 0.2) !important;
      color: white !important;
    }

    .mute-btn.muted {
      background: #f57c00 !important;
    }
  `],
})
export class CallOverlayComponent {
  readonly phone = inject(TwilioPhoneService);
}
