import { Component } from "@angular/core";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";

@Component({
  standalone: true,
  imports: [
    RouterModule,
    MatIconModule
  ],
  selector: "footer",
  templateUrl: "./footer.component.html",
  styleUrls: ["./footer.component.css"]
})
export class FooterComponent {}
