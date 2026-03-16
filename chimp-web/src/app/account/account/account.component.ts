import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccountService, Team } from '../account.service';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { collection, doc, updateDoc, addDoc } from '@angular/fire/firestore';
import { environment } from 'src/environments/environment';
import { ReferralService, ReferralData } from '../referrals/referral.service';

@Component({
  standalone: true,
  selector: 'app-account',
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatCardModule,
    MatDividerModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatRadioModule,
    MatSnackBarModule,
  ]
})
export class ProfileComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  showCompany: boolean = false;
  loading: boolean = false;
  billingLoading: boolean = false;
  processingCheckout: boolean = false;

  // Referral state
  referralData: ReferralData | null = null;
  referralLoading = true;
  referralError: string | null = null;
  showEmailPreview = false;
  private referralSubs: Subscription[] = [];

  constructor(
    public accountService: AccountService,
    private storage: Storage,
    public router: Router,
    public dialog: MatDialog,
    public referralService: ReferralService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit() {
    this.subscription = this.accountService.teamManagersObservable.subscribe(team => {
      if (team) {
        this.accountService.helper = this.accountService.helperProfiles.account;
        if (this.accountService.aTeam.ownerId == this.accountService.user.id) {
          this.showCompany = true;
        }
      }
    });

    this.referralSubs.push(
      this.referralService.data$.subscribe(d => this.referralData = d),
      this.referralService.loading$.subscribe(l => this.referralLoading = l),
      this.referralService.error$.subscribe(e => this.referralError = e),
    );
    this.referralService.load();
  }

  // Referral helpers
  get referralLink(): string {
    return this.referralData ? this.referralService.getReferralLink(this.referralData.referralCode) : '';
  }

  get monthlyCreditDisplay(): string {
    if (!this.referralData) return '$0';
    return '$' + (this.referralData.stats.monthlyCreditCents / 100).toFixed(0);
  }

  get perReferralDisplay(): string {
    if (!this.referralData) return '$0';
    return '$' + (this.referralData.stats.perReferralCreditCents / 100).toFixed(0);
  }

  get planPriceDisplay(): string {
    if (!this.referralData) return '$0';
    return '$' + (this.referralData.stats.planPriceCents / 100).toFixed(0);
  }

  get referralProgressPercent(): number {
    if (!this.referralData) return 0;
    return Math.min(100, this.referralData.stats.active * 10);
  }

  get referralsToFree(): number {
    if (!this.referralData) return 10;
    return Math.max(0, 10 - this.referralData.stats.active);
  }

  copyReferralLink(): void {
    navigator.clipboard.writeText(this.referralLink).then(() => {
      this.snackBar.open('Link copied', '', { duration: 2000 });
    });
  }

  copyEmailHtml(): void {
    if (!this.referralData) return;
    const html = this.referralService.getEmailFooterHtml(this.referralData.referralCode);
    navigator.clipboard.writeText(html).then(() => {
      this.snackBar.open('HTML copied', '', { duration: 2000 });
    });
  }

  copyEmailPlainText(): void {
    if (!this.referralData) return;
    const text = this.referralService.getEmailFooterPlainText(this.referralData.referralCode);
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('Text copied', '', { duration: 2000 });
    });
  }

  toggleEmailPreview(): void {
    this.showEmailPreview = !this.showEmailPreview;
  }

  get ownerName(): string {
    const owner = this.accountService.teamManagers?.find(
      m => m.id === this.accountService.aTeam?.ownerId
    );
    return owner?.name || 'the account owner';
  }

  upload(): void {
    document.getElementById('upLogoUrl').click();
  }

  uploadLogoImage(event) {
    this.loading = true;
    const file = event.target.files[0];
    if (!file) {
      this.loading = false;
      return;
    }
    const filePath = `${this.accountService.aTeam.id}/logo-image`;
    const storageRef = ref(this.storage, filePath);
    uploadBytes(storageRef, file)
      .then(() => getDownloadURL(storageRef))
      .then((url) => updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}`), { logoUrl: url }))
      .finally(() => this.loading = false);
  }

  saveTeam() {
    const cleanedTeam = Object.fromEntries(
      Object.entries(this.accountService.aTeam).filter(([_, v]) => v !== undefined)
    );
    updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}`), cleanedTeam);
  }

  deleteAccount() {
    let dialog = this.dialog.open(DeleteAccountDialog);
    dialog.afterClosed().subscribe(shouldDelete => {
      if (shouldDelete) {
        let date = new Date();
        addDoc(collection(this.accountService.db, "support"), {
          createdAt: date,
          email: "internal",
          body: `${this.accountService.aTeam.name} has been deleted on ${date}. ${this.accountService.user.name} can be reached at ${this.accountService.user.phone} 
          or ${this.accountService.user.email}. Pause the Stripe account for teamId ${this.accountService.aTeam.id}.`
        });
        updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}`), {
          disabled: true,
          disabledAt: date
        }).then(() => {
          window.location.reload();
        }).catch(error => console.error("cannot delete account at this time, contact us for more help. " + error));
      }
    });
  }

  public get hasActiveSubscription(): boolean {
    return !!this.accountService.aTeam.stripeSubscriptionId;
  }

  // Auto-start trainings - undefined/missing means disabled (grandfather existing teams)
  public get autoStartTrainings(): boolean {
    return this.accountService.aTeam.autoStartTrainings === true;
  }

  public set autoStartTrainings(value: boolean) {
    this.accountService.aTeam.autoStartTrainings = value;
    this.saveTeam();
  }

  // Self-inspection reminders - defaults to true if undefined
  public get selfInspectionRemindersEnabled(): boolean {
    return this.accountService.user?.selfInspectionRemindersEnabled !== false;
  }

  public set selfInspectionRemindersEnabled(value: boolean) {
    if (this.accountService.user) {
      this.accountService.user.selfInspectionRemindersEnabled = value;
      this.saveUser();
    }
  }

  // Self-inspection reminder method - defaults to 'email' if undefined
  public get selfInspectionReminderMethod(): 'email' | 'sms' {
    return this.accountService.user?.selfInspectionReminderMethod || 'email';
  }

  public set selfInspectionReminderMethod(value: 'email' | 'sms') {
    if (this.accountService.user) {
      this.accountService.user.selfInspectionReminderMethod = value;
      this.saveUser();
    }
  }

  saveUser() {
    if (!this.accountService.user?.id) return;
    const cleanedUser = Object.fromEntries(
      Object.entries(this.accountService.user).filter(([_, v]) => v !== undefined)
    );
    updateDoc(doc(this.accountService.db, `user/${this.accountService.user.id}`), cleanedUser);
  }

  public get billingStatus(): string {
    if (this.accountService.aTeam.stripeSubscriptionId) {
      return 'Active';
    }
    return 'No subscription';
  }

  public startCheckout(): void {
    // Use Stripe Payment Link with client_reference_id for team linking
    // Include prefilled_email if available
    const email = this.accountService.user?.email || this.accountService.aTeam?.email;
    let paymentUrl = `${environment.stripe.paymentLink}?client_reference_id=${this.accountService.aTeam.id}`;
    if (email) {
      paymentUrl += `&prefilled_email=${encodeURIComponent(email)}`;
    }
    window.location.href = paymentUrl;
  }

  public manageSubscription(): void {
    // Use Stripe Billing Portal Link with prefilled email
    const email = this.accountService.user?.email || this.accountService.aTeam?.email;
    let portalUrl = environment.stripe.billingPortalLink;
    if (email) {
      portalUrl += `?prefilled_email=${encodeURIComponent(email)}`;
    }
    window.location.href = portalUrl;
  }

  signOut(): void {
    this.accountService.logout();
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    this.referralSubs.forEach(s => s.unsubscribe());
  }
}


@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
  <h2 mat-dialog-title>Are you sure?</h2>
  <mat-dialog-content>By clicking DELETE, you are removing access and making your account inactive.<br>
  We'll hold your data for 30 days, and then it will be purged from our system.</mat-dialog-content>
  <mat-dialog-actions style="margin-top:12px" align="end"><button mat-button color="primary" style="margin-right:8px" (click)="close(false)">CANCEL</button>
  <button mat-flat-button color="warn" (click)="close(true)">DELETE</button>
  </mat-dialog-actions>
  `
})
export class DeleteAccountDialog {
  constructor(
    public dialogRef: MatDialogRef<DeleteAccountDialog>
  ) {}

  close(shouldDelete) {
    this.dialogRef.close(shouldDelete);
  }
}
