import { Component } from '@angular/core';

@Component({
  selector: 'app-customer-agreement',
  standalone: true,
  templateUrl: './customer-agreement.component.html',
  styleUrl: './customer-agreement.component.css'
})
export class CustomerAgreementComponent {
  scrollTo(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
