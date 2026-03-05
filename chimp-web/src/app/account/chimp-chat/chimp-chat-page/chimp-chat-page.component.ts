import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChimpChatComponent, ChimpChatMode } from '../chimp-chat.component';
import { ChimpChatService } from '../chimp-chat.service';
import { AccountService } from '../../account.service';

@Component({
  standalone: true,
  selector: 'chimp-chat-page',
  templateUrl: './chimp-chat-page.component.html',
  styleUrls: ['./chimp-chat-page.component.scss'],
  imports: [
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    ChimpChatComponent
  ]
})
export class ChimpChatPageComponent {
  private router = inject(Router);
  private chimpChatService = inject(ChimpChatService);
  private accountService = inject(AccountService);

  switchToMode(mode: 'dialog' | 'sidenav'): void {
    this.chimpChatService.skipNextClear = true;
    this.accountService.openChatInMode.next(mode);
    this.router.navigate(['/account/dashboard']);
  }

  onChatModeChange(mode: ChimpChatMode): void {
    if (mode === 'dialog' || mode === 'sidenav') {
      this.switchToMode(mode);
    }
  }
}
