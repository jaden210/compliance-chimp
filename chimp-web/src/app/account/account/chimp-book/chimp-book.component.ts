import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AccountService } from '../../account.service';
import { ConfigureComponent } from './configure/configure.component';

@Component({
  standalone: true,
  selector: 'chimp-book',
  templateUrl: './chimp-book.component.html',
  styleUrls: ['./chimp-book.component.css'],
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class ChimpBookComponent implements AfterViewInit {

  loadingBilling: boolean = false;

  constructor(public accountService: AccountService,
    public dialog: MatDialog
    ) { }

  ngAfterViewInit() {
    
  }

  async getBillingHistory() {
    this.loadingBilling = true;
    const res = await fetch("https://teamlog-2d74c.cloudfunctions.net/getCustomerInvoices", {
      method: 'POST',
      body: JSON.stringify({
        stripeCustomerId: this.accountService.aTeam.stripeCustomerId,
        teamId: this.accountService.aTeam.id
      }),
    });
    const data = await res.json();
    data.body = JSON.parse(data.body);
    return data;
  }

  enterCardInfo() {
    let dialog = this.dialog.open(ConfigureComponent, {
      disableClose: true,
      height: '75vh',
      width: '75vw'
    });
  }

}