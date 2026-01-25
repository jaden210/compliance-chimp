import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'common-questions',
  templateUrl: './common-questions.component.html',
  styleUrls: ['./common-questions.component.css'],
  imports: [RouterModule, MatButtonModule, MatIconModule]
})
export class CommonQuestionsComponent implements OnInit {
  constructor() { }

  ngOnInit() { }
}
