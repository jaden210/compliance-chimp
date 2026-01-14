import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FirestoreDemoComponent } from './firestore-demo';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FirestoreDemoComponent],
  template: `
    <h1>Welcome to {{ title() }}!</h1>
    <app-firestore-demo></app-firestore-demo>
    <router-outlet></router-outlet>
  `,
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('Angular 21 + Firebase App');
}
