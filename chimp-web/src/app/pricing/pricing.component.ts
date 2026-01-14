import { Component, OnInit } from '@angular/core';
import { SignUpComponent } from '../sign-up/sign-up.component';
import { CommonQuestionsComponent } from '../common-questions/common-questions.component';

@Component({
  standalone: true,
  imports: [SignUpComponent, CommonQuestionsComponent],
  selector: 'app-pricing',
  templateUrl: './pricing.component.html',
  styleUrls: ['./pricing.component.css']
})
export class PricingComponent implements OnInit {
  constructor() { }

  ngOnInit() { }
}
