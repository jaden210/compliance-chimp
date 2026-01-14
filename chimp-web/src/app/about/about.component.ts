import { Component } from '@angular/core';
import { SignUpComponent } from '../sign-up/sign-up.component';

@Component({
  standalone: true,
  imports: [SignUpComponent],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.css']
})
export class AboutComponent {}
