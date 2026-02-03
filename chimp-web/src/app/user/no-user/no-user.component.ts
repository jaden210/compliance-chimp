import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { AppService } from "../../app.service";

@Component({
  standalone: true,
  selector: "no-user",
  templateUrl: "./no-user.component.html",
  styleUrls: ["./no-user.component.scss"],
  imports: [CommonModule, RouterModule, MatIconModule]
})
export class NoUserComponent {
  private readonly router = inject(Router);
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);
}
