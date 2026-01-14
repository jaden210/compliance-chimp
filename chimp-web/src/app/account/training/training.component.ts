import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";

@Component({
  standalone: true,
  selector: "app-training",
  imports: [CommonModule, RouterModule],
  template: `
    <router-outlet></router-outlet>
  `
})
export class TrainingComponent {
  constructor() {}
}
