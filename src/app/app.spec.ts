import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { Firestore } from '@angular/fire/firestore';

describe('App', () => {
  beforeEach(async () => {
    // Create a mock for Firestore
    const firestoreMock = {
      // Mock methods used in FirestoreDemoComponent if any
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: Firestore, useValue: firestoreMock }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges(); // This triggers effect/signals updates
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Welcome to Angular 21 + Firebase App!');
  });
});
