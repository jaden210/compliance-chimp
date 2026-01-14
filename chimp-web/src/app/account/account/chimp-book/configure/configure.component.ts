import { Component, Input, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import moment from "moment";
import { AccountService } from 'src/app/account/account.service';
import { collection, collectionData, doc, updateDoc } from '@angular/fire/firestore';
import { environment } from 'src/environments/environment';
declare var Stripe: Function;
declare var elements: any;

@Component({
  standalone: true,
  templateUrl: './configure.component.html',
  styleUrls: ['./configure.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatTabsModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCheckboxModule,
    MatButtonModule
  ]
})
export class ConfigureComponent implements AfterViewInit {
  @ViewChild('payElement') payElement;
  stripe: any;
  elements: any;
  card: any;
  isValid: boolean = false;

  book: Book = new Book();

  constructor(private accountService: AccountService, public dialogRef: MatDialogRef<ConfigureComponent>) { }

  ngAfterViewInit() {
    this.getPageCounts();
  }

  tabChange(event) {
    if (event.index == 2) {
      this.mount();
    }
  }

  mount() {
    this.stripe = Stripe(environment.stripe.publishable);
    this.elements = this.stripe.elements()  
    // Create an instance of the card Element.
    this.card = this.elements.create('card');
    // Add an instance of the card Element into the `card-element` <div>.
    this.card.mount('#card-element');

    this.card.addEventListener('change', event => {
      var displayError = document.getElementById('card-errors');
      if (event.error) {
        displayError.textContent = event.error.message;
      } else {
        displayError.textContent = '';
      }
      this.isValid = event.complete;
    });
  }
  
  formSubmit() {
    event.preventDefault();
    this.stripe.createToken(this.card).then(result => {
      if (result.error) {
        // Inform the customer that there was an error.
        var errorElement = document.getElementById('card-errors');
        errorElement.textContent = result.error.message;
      } else {
        updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}`), { cardToken: result.token }).then(() => {
          this.dialogRef.close();
        }).catch(() => errorElement.textContent = "error saving card details, try again later.")
      }
    });
  }

  getPageCounts() { // big call
    collectionData(collection(this.accountService.db, `team/${this.accountService.aTeam.id}/logs`)).subscribe(logs => {
      this.book.sections.logs.pages = (logs.length / 50);
    });
  }


  setSchedule(time) {
    this.book.schedule = time;
    if (time == 'monthly') {
      this.book.startDate = moment().startOf('month').format('MM-DD-YYYY');
      this.book.endDate = moment().endOf('month').format('MM-DD-YYYY');
    } else if (time == 'quarterly') {
      this.book.startDate = moment().startOf('quarter').format('MM-DD-YYYY');
      this.book.endDate = moment().endOf('quarter').format('MM-DD-YYYY');
    } else if (time == 'anually') {
      this.book.startDate = moment().startOf('year').format('MM-DD-YYYY');
      this.book.endDate = moment().endOf('year').format('MM-DD-YYYY');
    } else if (time == 'custom') {
      this.book.startDate ? this.book.startDate = moment(this.book.startDate).format('MM-DD-YYYY') : null;
      this.book.endDate ? this.book.endDate = moment(this.book.endDate).format('MM-DD-YYYY'): null; 
    }
  }

  cancel() {
    this.dialogRef.close();
  }

}

export class Book { 
  sections = {
    logs: {
      selected: true,
      pages: 0
    },
    timeclocks: {
      selected: true,
      pages: 0
    },
    incidentReports: {
      selected: true,
      pages: 0
    }
  };
  name: 'test';
  schedule: 'monthly';
  startDate;
  endDate;
}

export class BookPrice {
  monthly = {
    price: 59,
    pages: 30
  };
  quarterly = {
    price: 199,
    pages: 90
  };
  anually = {
    price: 299,
    pages: 30
  };
  custom = {
    price: 100,
    pages: 30
  };
  page: .3;
}