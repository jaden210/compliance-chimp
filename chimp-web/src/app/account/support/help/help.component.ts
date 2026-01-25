import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SupportService } from '../support.service';
import { HelpArticle } from 'src/app/help-dialog/help-dialog.component';

@Component({
  selector: 'app-help',
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
  imports: [
    MatListModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class HelpComponent {
  private readonly supportService = inject(SupportService);

  readonly articles = toSignal(this.supportService.getHelpArticles(), { initialValue: [] });

  newArticle(): void {
    this.supportService.makeArticle.set(true);
  }

  editArticle(article: HelpArticle): void {
    this.supportService.article.set(article);
    this.supportService.makeArticle.set(true);
  }
}