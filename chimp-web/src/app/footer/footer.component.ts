import { Component, OnInit } from "@angular/core";
import { RouterModule } from "@angular/router";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatIconModule } from "@angular/material/icon";
import { AppService } from "../app.service";

@Component({
  standalone: true,
  imports: [
    RouterModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule
  ],
  selector: "footer",
  templateUrl: "./footer.component.html",
  styleUrls: ["./footer.component.css"]
})
export class FooterComponent implements OnInit {
  routes;
  constructor(
    public appService: AppService
  ) {}

  ngOnInit() {}
}
