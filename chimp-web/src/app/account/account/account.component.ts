import { Component, OnInit , OnDestroy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccountService, User, Team, TeamMember } from '../account.service';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';
import { ChimpBookComponent } from './chimp-book/chimp-book.component';
import { Subscription } from 'rxjs';
import { Industry } from 'src/app/get-started/step2/step2.component';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { collection, collectionData, doc, updateDoc, addDoc } from '@angular/fire/firestore';

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
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressBarModule,
    MatListModule,
    ChimpBookComponent
  ]
})
export class ProfileComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  public industries: Industry[] = [];
  showCompany: boolean = false;
  loading: boolean = false;

  constructor(
    public accountService: AccountService,
    private storage: Storage,
    private functions: Functions,
    public router: Router,
    public dialog: MatDialog
  ) {
    const industryRef = collection(this.accountService.db, "industry");
    collectionData(industryRef, { idField: "id" }).subscribe((industries) => {
      this.industries = industries as Industry[];
    });
  }

  ngOnInit() {
    this.subscription = this.accountService.teamManagersObservable.subscribe(team => {
      if (team) {
        this.accountService.helper = this.accountService.helperProfiles.account;
        if (this.accountService.aTeam.ownerId == this.accountService.user.id) {
          this.showCompany = true;
        }
      }
    });
  }

  upload(profile): void { // this will call the file input from our custom button
    profile ?
    document.getElementById('upProfileUrl').click() :
    document.getElementById('upLogoUrl').click();
  }

  uploadProfileImage(event) {
    this.loading = true;
    const file = event.target.files[0];
    if (!file) {
      this.loading = false;
      return;
    }
    const filePath = `users/${this.accountService.user.id}`;
    const storageRef = ref(this.storage, filePath);
    uploadBytes(storageRef, file)
      .then(() => getDownloadURL(storageRef))
      .then((url) => updateDoc(doc(this.accountService.db, `user/${this.accountService.user.id}`), { profileUrl: url }))
      .finally(() => this.loading = false);
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

  saveProfile() {
    updateDoc(doc(this.accountService.db, `user/${this.accountService.user.id}`), { ...this.accountService.user });
  }

  saveTeam() {
    updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}`), { ...this.accountService.aTeam });
  }

  deleteAccount() {
    let dialog = this.dialog.open(DeleteAccountDialog);
    dialog.afterClosed().subscribe(shouldDelete => {
      if (shouldDelete) { // disable the team
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
          window.location.reload(); // easiest way to repull the data
        }).catch(error => console.error("cannot delete account at this time, contact us for more help. " + error));
      }
    });
  }

  public isIndustryChecked(id: string): boolean {
    return this.accountService.aTeam.industries.some(i => i == id);
  }

  public get TeamMembers(): TeamMember[] {
    return this.accountService.teamMembers || [];
  }

  public toggleIndustry(id: string): void {
    if (this.isIndustryChecked(id)) {
      this.accountService.aTeam.industries = this.accountService.aTeam.industries.filter(i => i !== id);
    } else {
      this.accountService.aTeam.industries.push(id);
    }
    this.saveTeam();
  }

  public navInvoices(): void {
    if (this.accountService.aTeam.stripeCustomerId) {
      const getCustomerInvoices = httpsCallable(this.functions, 'getCustomerInvoices');
      getCustomerInvoices({ stripeCustomerId: this.accountService.aTeam.stripeCustomerId}).then((resp: any) => {
        window.open(resp.data);
      });
    } else {
      this.router.navigate(['/account']);
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
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
  <button mat-raised-button color="warn" (click)="close(true)">DELETE</button>
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