import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";

@Component({
  standalone: true,
  selector: "app-self-inspections",
  templateUrl: "./self-inspections.component.html",
  styleUrls: ["./self-inspections.component.css"],
  imports: [CommonModule, RouterModule]
})
export class SelfInspectionsComponent {}
