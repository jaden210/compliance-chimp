import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { TrainingService, Industry } from "../training.service";
import { Router, ActivatedRoute } from "@angular/router";
import { Observable } from "rxjs";
import { Location } from "@angular/common";

@Component({
  standalone: true,
  selector: "app-industries",
  templateUrl: "./industries.component.html",
  styleUrls: ["./industries.component.css"],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule
  ]
})
export class IndustriesComponent implements OnInit {
  public industries: Observable<Industry[]>;

  constructor(
    private service: TrainingService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location
  ) {}

  ngOnInit() {
    this.industries = this.service.getIndustries();
  }

  public routeTo(industry): void {
    this.router.navigate(["account/training", industry.id]);
  }

  public goBack(): void {
    this.router.navigate(["account/training"]);
  }
}
