import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { GetStartedService } from "./get-started.service";

@Component({
  standalone: true,
  selector: "get-started",
  templateUrl: "./get-started.component.html",
  styleUrls: ["./get-started.component.css"],
  imports: [CommonModule, RouterModule, MatToolbarModule]
})
export class GetStartedComponent implements OnInit {
  constructor(private getStartedService: GetStartedService) {}

  ngOnInit() {
    this.getStartedService.setIndustries();
  }
}
