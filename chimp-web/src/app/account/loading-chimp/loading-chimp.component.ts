import { Component, OnInit } from '@angular/core';
import { animate, state, style, transition, trigger } from "@angular/animations";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatButtonModule } from "@angular/material/button";
import { AppService } from '../../app.service';
import { AccountService } from '../account.service';

@Component({
  standalone: true,
  imports: [
    MatCheckboxModule,
    MatButtonModule
  ],
  selector: 'loading-chimp',
  templateUrl: './loading-chimp.component.html',
  styleUrls: ['./loading-chimp.component.scss'],
  animations: [
    trigger("fade", [
      state("void", style({ opacity: 0, transform: 'scale(.8)' })),
      transition("void <=> *", animate("250ms 500ms ease-in-out"))
    ]),
    trigger("catch", [
      state("void", style({ opacity: 0 })),
      transition("void <=> *", animate("250ms 500ms ease-in-out"))
    ]),
  ]
})
export class LoadingChimpComponent implements OnInit {
  hints = [
    "Team members access their trainings through the SMS/email that was sent to them. If they lost their message, resend it from the Team page."
  ];
  hint;

  private readonly PERMANENTLY_HIDDEN_KEY = 'ccld';
  private readonly LAST_SHOWN_DATE_KEY = 'ccld-date';

  constructor(
    public appService: AppService,
    private _accountService: AccountService
  ) { }

  ngOnInit() {
    this.hint = this.hints[Math.floor(Math.random() * this.hints.length)];
  }

  public get ShouldShow(): boolean {
    if (!this._accountService.showLD) return false;
    
    // Check if permanently hidden
    if (JSON.parse(localStorage.getItem(this.PERMANENTLY_HIDDEN_KEY))) return false;
    
    // Check if already shown today
    const lastShownDate = localStorage.getItem(this.LAST_SHOWN_DATE_KEY);
    const today = new Date().toDateString();
    if (lastShownDate === today) return false;
    
    return true;
  }

  public close(block: boolean = false): void {
    if (block) {
      localStorage.setItem(this.PERMANENTLY_HIDDEN_KEY, 'true');
    } else {
      // Mark as shown today so it won't show again until tomorrow
      localStorage.setItem(this.LAST_SHOWN_DATE_KEY, new Date().toDateString());
    }
    this._accountService.showLD = false;
  }
}
