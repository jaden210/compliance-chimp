import { Component, OnInit } from '@angular/core';
import { SignUpComponent } from '../sign-up/sign-up.component';

@Component({
  standalone: true,
  imports: [SignUpComponent],
  selector: 'app-customer-agreement',
  templateUrl: './customer-agreement.component.html',
  styleUrls: ['./customer-agreement.component.css']
})
export class CustomerAgreementComponent implements OnInit {
  constructor() { }

  ngOnInit() { }
}
