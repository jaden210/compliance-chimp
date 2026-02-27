import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { SeoService } from '../shared/seo.service';

@Component({
  standalone: true,
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.css'],
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ]
})
export class ContactComponent implements OnInit {
  private fb = inject(FormBuilder);
  private functions = inject(Functions);
  private seoService = inject(SeoService);

  contactForm: FormGroup;
  isSubmitting = false;
  submitted = false;
  errorMessage = '';

  constructor() {
    this.contactForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      company: [''],
      message: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    // Set custom SEO for contact page with structured data
    this.seoService.setCustomSeo({
      title: 'Contact Us | Compliance Chimp - OSHA Compliance Support',
      description: 'Get in touch with the Compliance Chimp team. Call (801) 477-5113 or email support@compliancechimp.com for help with OSHA compliance and safety training.',
      keywords: 'contact compliance chimp, OSHA compliance support, safety software help, compliance chimp phone number, compliance chimp email',
      url: 'https://compliancechimp.com/contact'
    });
  }

  async onSubmit(): Promise<void> {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      const sendContactMessage = httpsCallable(this.functions, 'sendContactMessage');
      await sendContactMessage({
        name: this.contactForm.value.name,
        email: this.contactForm.value.email,
        phone: this.contactForm.value.phone || '',
        company: this.contactForm.value.company || '',
        message: this.contactForm.value.message
      });

      this.submitted = true;
    } catch (error: any) {
      console.error('Error sending contact message:', error);
      this.errorMessage = 'There was a problem sending your message. Please try again or email us directly at support@compliancechimp.com.';
    } finally {
      this.isSubmitting = false;
    }
  }

  resetForm(): void {
    this.submitted = false;
    this.contactForm.reset();
    this.errorMessage = '';
  }
}
