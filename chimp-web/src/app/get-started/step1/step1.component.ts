import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { GetStartedService } from "../get-started.service";
declare var gtag: Function;

@Component({
  standalone: true,
  selector: "step1",
  templateUrl: "./step1.component.html",
  styleUrls: ["./step1.component.css"],
  imports: [CommonModule, FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule]
})
export class Step1Component implements OnInit {
  error: string;
  name: string;
  companyName: string;
  jobTitle: string;

  constructor(
    private router: Router,
    private getStartedService: GetStartedService
  ) {}

  ngOnInit() {
    if (!this.getStartedService.Email) this.router.navigate(["/sign-up"]);
    this.companyName = this.getStartedService.companyName;
    this.name = this.getStartedService.name;
    this.jobTitle = this.getStartedService.jobTitle;
  }

  next(): void {
    this.error =
      !this.companyName || !this.name ? "Please enter the required items" : "";
    if (!this.error) {
      gtag("event", "click", {
        event_category: "sign up funnel",
        event_label: "step 1"
      });
      this.getStartedService.companyName = this.companyName;
      this.getStartedService.name = this.name;
      this.getStartedService.jobTitle = this.jobTitle;
      this.router.navigate(["/get-started/step2"]);
    }
  }
}
