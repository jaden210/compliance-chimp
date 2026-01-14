import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { AppService } from "../app.service";

declare var gtag: Function;

@Component({
  standalone: true,
  imports: [MatButtonModule],
  selector: "sign-up",
  templateUrl: "./sign-up.component.html",
  styleUrls: ["./sign-up.component.css"]
})
export class SignUpComponent implements OnInit {
  constructor(
    public appService: AppService,
    private router: Router
  ) {}

  ngOnInit() {}

  signUp() {
    this.router.navigate(['/sign-up']);
    gtag("event", "click", {
      event_category: "sign up funnel",
      event_label: "start today guarantee"
    });
  }
}
