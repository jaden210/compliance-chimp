import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AppService } from '../app.service';
import { addDoc, collection } from '@angular/fire/firestore';
import { SignUpComponent } from '../sign-up/sign-up.component';

@Component({
  standalone: true,
  selector: 'app-support',
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.css'],
  imports: [CommonModule, FormsModule, MatButtonModule, SignUpComponent]
})
export class SupportComponent implements OnInit {

  support: Support = new Support();
  submitted: boolean = false;

  constructor(public appService: AppService) { }

  ngOnInit() {
  }

  submit() {
    this.support.createdAt = new Date();
    addDoc(collection(this.appService.db, "support"), { ...this.support }).then(() => {
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