import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatTooltipModule } from "@angular/material/tooltip";

export interface WelcomeFeature {
  icon: string;
  title: string;
  description: string;
  action?: string; // Optional action identifier for click handling
}

@Component({
  standalone: true,
  selector: "app-welcome-banner",
  template: `
    <div class="welcome-banner">
      <div class="banner-header">
        <div class="header-left">
          <mat-icon class="header-icon">{{ icon }}</mat-icon>
          <h3>{{ title }}</h3>
          <span class="subtitle" *ngIf="subtitle">{{ subtitle }}</span>
        </div>
        <button mat-icon-button class="close-btn" (click)="onClose()" matTooltip="Close">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="features-grid">
        @for (feature of features; track $index) {
          <div 
            class="feature-card" 
            [class.clickable]="feature.action"
            (click)="onFeatureClick(feature)">
            <mat-icon class="feature-icon">{{ feature.icon }}</mat-icon>
            <div class="feature-title">{{ feature.title }}</div>
            <div class="feature-description">{{ feature.description }}</div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .welcome-banner {
      background: linear-gradient(135deg, #ff9800, #f57c00);
      border-radius: 12px;
      margin-bottom: 20px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(255, 152, 0, 0.25);
    }

    .banner-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: white;
    }

    .banner-header h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: white;
    }

    .banner-header .subtitle {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.85);
      margin-left: 8px;
    }

    .close-btn {
      color: rgba(255, 255, 255, 0.8);
      margin: -8px -8px -8px 0;
    }

    .close-btn:hover {
      color: white;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1px;
      background: rgba(0, 0, 0, 0.1);
      margin: 0 1px 1px;
      border-radius: 0 0 11px 11px;
      overflow: hidden;
    }

    .feature-card {
      background: white;
      padding: 14px 16px;
      transition: background-color 0.15s ease;
    }

    .feature-card.clickable {
      cursor: pointer;
    }

    .feature-card.clickable:hover {
      background: #fff8e1;
    }

    .feature-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #f57c00;
      margin-bottom: 6px;
    }

    .feature-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--chimp-on-surface);
      margin-bottom: 4px;
    }

    .feature-description {
      font-size: 12px;
      line-height: 1.4;
      color: var(--chimp-on-surface-variant);
    }

    @media (max-width: 600px) {
      .welcome-banner {
        margin-bottom: 16px;
      }

      .banner-header .subtitle {
        display: none;
      }

      .features-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .feature-card {
        padding: 12px;
      }

      .feature-description {
        font-size: 11px;
      }
    }
  `],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatTooltipModule
  ]
})
export class WelcomeBannerComponent {
  @Input() icon: string = 'lightbulb';
  @Input() title: string = 'Welcome';
  @Input() subtitle: string = '';
  @Input() features: WelcomeFeature[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() featureClicked = new EventEmitter<string>();

  onClose(): void {
    this.closed.emit();
  }

  onFeatureClick(feature: WelcomeFeature): void {
    if (feature.action) {
      this.featureClicked.emit(feature.action);
    }
  }
}
