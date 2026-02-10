import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AccountService } from '../../account.service';
import { SupportService } from '../support.service';

@Component({
  standalone: true,
  selector: 'support-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  imports: [
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule
  ]
})
export class HomeComponent {
  readonly accountService = inject(AccountService);
  readonly supportService = inject(SupportService);
}
