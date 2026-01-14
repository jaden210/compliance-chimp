import { TestBed, inject } from '@angular/core/testing';

import { AppService } from './app.service';
import { BehaviorSubject } from 'rxjs';
import { Firestore } from '@angular/fire/firestore';

describe('AppService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AppService, 
        { provide: Firestore, useValue: FirestoreStub },
      ]
    });
  });

  it('should be created', inject([AppService], (service: AppService) => {
    expect(service).toBeTruthy();
  }));
});

const FirestoreStub = {};
