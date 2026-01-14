import { TestBed, inject } from '@angular/core/testing';

import { AccountService } from './account.service';
import { BehaviorSubject } from 'rxjs';
import { Firestore } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Storage } from '@angular/fire/storage';
import { MatDialogModule } from '@angular/material';

describe('AccountService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AccountService,
        { provide: Firestore, useValue: FirestoreStub },
        { provide: Auth, useValue: FirestoreStub },
        { provide: Storage, useValue: FirestoreStub },
      ],
      imports: [
        MatDialogModule
      ]
    });
  });

  it('should be created', inject([AccountService], (service: AccountService) => {
    expect(service).toBeTruthy();
  }));
});

const FirestoreStub = {};
