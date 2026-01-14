import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";

@Component({
  standalone: true,
  selector: "app-surveys",
  templateUrl: "./surveys.component.html",
  styleUrls: ["./surveys.component.css"],
  imports: [CommonModule, RouterModule]
})
export class SurveysComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
