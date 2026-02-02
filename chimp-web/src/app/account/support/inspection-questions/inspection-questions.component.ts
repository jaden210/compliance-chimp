import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SupportService } from '../support.service';
import { addDoc, collection, deleteDoc, doc, updateDoc } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

@Component({
  standalone: true,
  selector: 'inspection-questions',
  templateUrl: './inspection-questions.component.html',
  styleUrl: './inspection-questions.component.css',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class InspectionQuestionsComponent implements OnInit, OnDestroy {
  private readonly supportService = inject(SupportService);
  private collectionSub: Subscription | null = null;

  collectionName = 'osha-assesment-template-en';
  readonly list = signal<InspectionCategory[]>([]);
  
  collectionSubject: InspectionCategory = new InspectionCategory();
  newQuestion: InspectionQuestion = new InspectionQuestion();

  ngOnInit(): void {
    this.getCollection();
  }

  ngOnDestroy(): void {
    if (this.collectionSub) {
      this.collectionSub.unsubscribe();
    }
  }
  
  getCollection(): void {
    if (this.collectionSub) {
      this.collectionSub.unsubscribe();
    }
    this.collectionSub = this.supportService.getInspectionCollection(this.collectionName).subscribe(items => {
      this.list.set(items);
    });
  }

  selectDoc(item: InspectionCategory): void {
    this.collectionSubject = item;
  }

  addQuestion(): void {
    this.newQuestion.createdAt = new Date();
    this.collectionSubject.questions.push({ ...this.newQuestion });
    const cleanedSubject = Object.fromEntries(
      Object.entries(this.collectionSubject).filter(([_, v]) => v !== undefined)
    );
    updateDoc(doc(this.supportService.db, `${this.collectionName}/${this.collectionSubject.id}`), cleanedSubject).then(() => {
      this.newQuestion = new InspectionQuestion();
    });
  }

  deleteQuestion(question: InspectionQuestion): void {
    const index = this.collectionSubject.questions.indexOf(question);
    if (index > -1) {
      this.collectionSubject.questions.splice(index, 1);
      this.push();
    }
  }

  push(): void {
    if (this.collectionSubject.id) {
      const cleanedSubject = Object.fromEntries(
        Object.entries(this.collectionSubject).filter(([_, v]) => v !== undefined)
      );
      updateDoc(doc(this.supportService.db, `${this.collectionName}/${this.collectionSubject.id}`), cleanedSubject);
    } else {
      const cleanedSubject = Object.fromEntries(
        Object.entries(this.collectionSubject).filter(([_, v]) => v !== undefined)
      );
      addDoc(collection(this.supportService.db, this.collectionName), cleanedSubject).then(snapshot => {
        this.collectionSubject.id = snapshot.id;
        this.selectDoc(this.collectionSubject);
      });
    }
  }
  
  deleteCategory(): void {
    deleteDoc(doc(this.supportService.db, `${this.collectionName}/${this.collectionSubject.id}`)).then(() => {
      this.collectionSubject = new InspectionCategory();
    });
  }

  createCategory(): void {
    this.collectionSubject = new InspectionCategory();
  }
}

export class InspectionCategory {
  id?: string;
  subject = '';
  questions: InspectionQuestion[] = [];
  order = 0;
}

export class InspectionQuestion {
  id?: string;
  name = '';
  createdAt?: Date;
}