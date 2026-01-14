import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { Title, Meta } from '@angular/platform-browser';
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { AppService, SubscriptionPlan } from "../app.service";

@Component({
  standalone: true,
  templateUrl: "./plans.component.html",
  styleUrls: ["./plans.component.scss"],
  imports: [CommonModule, RouterModule, MatButtonModule]
})
export class PlansComponent implements OnInit {

  public plans: SubscriptionPlan[] = [];

  constructor(
    private titleService: Title,
    private metaTagService: Meta,
    private _router: Router,
    private _appService: AppService
    ) {
    }

    ngOnInit() {
      this._appService.getSubscriptionPlans().subscribe(plans => {
        this.plans = plans;
      });
    }

    public selectPlan(plan: SubscriptionPlan) {
      this._router.navigate(['billing']);
    }
}
