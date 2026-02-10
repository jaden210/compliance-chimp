import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";

@Component({
  standalone: true,
  selector: "app-outreach",
  template: `<router-outlet></router-outlet>`,
  imports: [CommonModule, RouterModule],
})
export class OutreachComponent {}
