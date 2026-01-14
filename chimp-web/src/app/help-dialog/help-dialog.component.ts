import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { AppService } from '../app.service';
import { collection, collectionData } from '@angular/fire/firestore';

@Component({
  standalone: true,
  imports: [MatDialogModule],
  selector: 'help-dialog',
  templateUrl: './help-dialog.component.html',
  styleUrls: ['./help-dialog.component.scss'],
})
export class HelpDialogComponent {
  articles: HelpArticle[] = [];
  article: HelpArticle;

  constructor(public appService: AppService) {
    // Firestore operations must be in constructor for Angular 21 compatibility
    collectionData(collection(this.appService.db, "help-article"), { idField: "id" })
      .subscribe(articles => {
        this.articles = articles as HelpArticle[];
      });
  }

  public setArticle(article): void {
    this.article = article;
  }
}

export class HelpArticle {
  id?: string;
  name: string;
  content: any;
  ordering: number;
  createdAt: any;
  imageUrl?: string;
  videoUrl?: string;
}
