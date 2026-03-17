import { Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { BehaviorSubject } from 'rxjs';

export interface Referral {
  id: string;
  referredTeamName: string;
  status: 'pending' | 'active' | 'churned';
  createdAt: string | null;
  statusUpdatedAt: string | null;
}

export interface ReferralStats {
  total: number;
  active: number;
  pending: number;
  churned: number;
  monthlyCreditCents: number;
  planPriceCents: number;
  perReferralCreditCents: number;
}

export interface ReferralData {
  referralCode: string;
  referrals: Referral[];
  stats: ReferralStats;
}

@Injectable({ providedIn: 'root' })
export class ReferralService {
  data$ = new BehaviorSubject<ReferralData | null>(null);
  loading$ = new BehaviorSubject<boolean>(false);
  error$ = new BehaviorSubject<string | null>(null);

  constructor(private functions: Functions) {}

  async load(): Promise<void> {
    this.loading$.next(true);
    this.error$.next(null);

    try {
      const fn = httpsCallable<void, ReferralData>(this.functions, 'getReferralData');
      const result = await fn();
      this.data$.next(result.data);
    } catch (e: any) {
      console.error('Error loading referral data:', e);
      this.error$.next(e.message || 'Failed to load referral data');
    } finally {
      this.loading$.next(false);
    }
  }

  getReferralLink(code: string): string {
    return `https://compliancechimp.com?ref=${code}`;
  }

  getEmailFooterHtml(code: string): string {
    const link = this.getReferralLink(code);
    return [
      '<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; margin-top: 16px;">',
      '  <tr>',
      '    <td style="border-top: 3px solid #ff9100; padding-top: 12px;">',
      '      <p style="margin: 0 0 6px 0; font-size: 13px; color: #333333; line-height: 18px;">',
      '        We use <strong>Compliance Chimp</strong> for OSHA safety compliance.',
      '        Training, inspections, and incident reporting, all in one place.',
      '      </p>',
      '      <p style="margin: 0;">',
      `        <a href="${link}" style="display: inline-block; background-color: #054d8a; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 8px 20px; border-radius: 6px;">Try It Free for 14 Days</a>`,
      '      </p>',
      '    </td>',
      '  </tr>',
      '</table>',
    ].join('\n');
  }

  getEmailFooterPlainText(code: string): string {
    const link = this.getReferralLink(code);
    return `We use Compliance Chimp for OSHA safety compliance. Training, inspections, and incident reporting, all in one place. Try it free for 14 days: ${link}`;
  }
}
