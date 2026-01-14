import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatLabel } from '@angular/material/form-field';
import { SupportService } from '../support.service';
import { addDoc, collection, deleteDoc, doc, updateDoc } from '@angular/fire/firestore';

@Component({
  standalone: true,
  selector: 'inspection-questions',
  templateUrl: './inspection-questions.component.html',
  styleUrls: ['./inspection-questions.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ]
})
export class InspectionQuestionsComponent implements OnInit {

 
  collection: string = 'osha-assesment-template-en';
  list;

  collectionSubject: collectionSubject = new collectionSubject();
  newQuestion: NewQ = new NewQ();


  constructor(
    private supportService: SupportService
  ) { }

  ngOnInit() {
    this.getCollection();
  }
  
  getCollection() {
    this.supportService.getInspectionCollection(this.collection).subscribe(collection => {
      this.list = collection;
    });
  }

  selectDoc(item) {
    this.collectionSubject = item;
  }

  addQuestion() {
    this.newQuestion.createdAt = new Date();
    this.collectionSubject.questions.push({...this.newQuestion});
    updateDoc(doc(this.supportService.db, `${this.collection}/${this.collectionSubject.id}`), { ...this.collectionSubject }).then(() => {
      this.newQuestion = new NewQ();
    });
  }

  deleteQ(q) {
    this.collectionSubject.questions.splice(this.collectionSubject.questions.indexOf(q),1);
    this.push();
  }

  push() {
    if (this.collectionSubject.id) {
      updateDoc(doc(this.supportService.db, `${this.collection}/${this.collectionSubject.id}`), { ...this.collectionSubject });
    } else {
      addDoc(collection(this.supportService.db, this.collection), { ...this.collectionSubject }).then(snapshot => {
        this.collectionSubject.id = snapshot.id;
        this.selectDoc(this.collectionSubject);
      });
    }
  }
  
  deleteDoc() {
    deleteDoc(doc(this.supportService.db, `${this.collection}/${this.collectionSubject.id}`)).then(() => {
    this.collectionSubject = new collectionSubject();
    });
  }

  createDoc() {
    this.collectionSubject = new collectionSubject();
  }

}

export class collectionSubject {
  id?: string;
  subject: string;
  questions: any = [];
  order: number = 0;
}

export class NewQ {
  id?: string;
  name: string;
  createdAt: Date;
}