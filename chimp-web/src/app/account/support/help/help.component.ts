import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AccountService } from '../../account.service';
import { Observable } from 'rxjs';
import { SupportService } from '../support.service';
import { HelpArticle } from 'src/app/help-dialog/help-dialog.component';

@Component({
  standalone: true,
  selector: 'app-help',
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss'],
  imports: [
    CommonModule,
    MatListModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class HelpComponent implements OnInit {

  articles: Observable<HelpArticle[]>;

  constructor(
    public accountService: AccountService,
    public supportService: SupportService
  ) { }

  ngOnInit() {
    this.articles = this.supportService.getHelpArticles();
  }

  newArticle() {
    this.supportService.makeArticle = true;
  }

  editArticle(article) {
    this.supportService.makeArticle = true;
    this.supportService.article = article;
  }

}