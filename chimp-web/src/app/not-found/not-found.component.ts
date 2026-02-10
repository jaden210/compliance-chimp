import { Component } from "@angular/core";
import { RouterModule } from "@angular/router";

@Component({
  standalone: true,
  selector: "app-not-found",
  imports: [RouterModule],
  templateUrl: "./not-found.component.html",
  styleUrls: ["./not-found.component.css"]
})
export class NotFoundComponent {}
