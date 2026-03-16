import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReferralService, ReferralData } from './referral.service';
import { AccountService } from '../account.service';

@Component({
  standalone: true,
  selector: 'app-referrals',
  templateUrl: './referrals.component.html',
  styleUrls: ['./referrals.component.css'],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatTabsModule,
  ],
})
export class ReferralsComponent implements OnInit, OnDestroy {
  data: ReferralData | null = null;
  loading = true;
  error: string | null = null;
  showEmailPreview = false;
  private subs: Subscription[] = [];

  constructor(
    public referralService: ReferralService,
    public accountService: AccountService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.referralService.data$.subscribe(d => this.data = d),
      this.referralService.loading$.subscribe(l => this.loading = l),
      this.referralService.error$.subscribe(e => this.error = e),
    );
    this.referralService.load();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  get referralLink(): string {
    return this.data ? this.referralService.getReferralLink(this.data.referralCode) : '';
  }

  get monthlyCreditDisplay(): string {
    if (!this.data) return '$0';
    return '$' + (this.data.stats.monthlyCreditCents / 100).toFixed(0);
  }

  get perReferralDisplay(): string {
    if (!this.data) return '$0';
    return '$' + (this.data.stats.perReferralCreditCents / 100).toFixed(0);
  }

  get planPriceDisplay(): string {
    if (!this.data) return '$0';
    return '$' + (this.data.stats.planPriceCents / 100).toFixed(0);
  }

  get progressPercent(): number {
    if (!this.data) return 0;
    return Math.min(100, this.data.stats.active * 10);
  }

  get referralsToFree(): number {
    if (!this.data) return 10;
    return Math.max(0, 10 - this.data.stats.active);
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.referralLink).then(() => {
      this.snackBar.open('Link copied', '', { duration: 2000 });
    });
  }

  copyEmailHtml(): void {
    if (!this.data) return;
    const html = this.referralService.getEmailFooterHtml(this.data.referralCode);
    navigator.clipboard.writeText(html).then(() => {
      this.snackBar.open('HTML copied', '', { duration: 2000 });
    });
  }

  copyEmailPlainText(): void {
    if (!this.data) return;
    const text = this.referralService.getEmailFooterPlainText(this.data.referralCode);
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('Text copied', '', { duration: 2000 });
    });
  }

  toggleEmailPreview(): void {
    this.showEmailPreview = !this.showEmailPreview;
  }
}
