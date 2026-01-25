import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AppService } from '../app.service';
import { addDoc, collection } from '@angular/fire/firestore';

@Component({
  standalone: true,
  selector: 'app-support',
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.css'],
  imports: [CommonModule, FormsModule, MatButtonModule]
})
export class SupportComponent implements OnInit {

  support: Support = new Support();
  submitted: boolean = false;

  constructor(public appService: AppService) { }

  ngOnInit() {
  }

  submit() {
    this.support.createdAt = new Date();
    const cleanedSupport = Object.fromEntries(
      Object.entries(this.support).filter(([_, v]) => v !== undefined)
    );
    addDoc(collection(this.appService.db, "support"), cleanedSupport).then(() => {
      this.submitted = true;
      this.support = new Support();
    });
  }

}


export class Support {
  email: string;
  body: string;
  createdAt: Date;
}