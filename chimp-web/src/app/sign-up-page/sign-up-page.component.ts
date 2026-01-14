import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatInputModule } from "@angular/material/input";
import { MatFormFieldModule } from "@angular/material/form-field";
import { Router } from "@angular/router";
import { AppService } from "../app.service";

@Component({
  standalone: true,
  selector: "app-sign-up-page",
  templateUrl: "./sign-up-page.component.html",
  styleUrls: ["./sign-up-page.component.css"],
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, MatButtonModule, MatInputModule, MatFormFieldModule]
})
export class SignUpPageComponent {
  loginErrorStr: string;
  email: string;

  constructor(public router: Router, public appService: AppService) {}

  createAccount(): void {
    this.loginErrorStr = !this.email ? "email required" : null;
    if (!this.loginErrorStr) {
      this.appService.email = this.email;
      this.appService.checkForExistingUser(this.email).then(
        isExistingUser => {
          if (isExistingUser) {
            this.router.navigate(["/sign-in"]);
          } else {
            this.router.navigate(["/get-started"]);
          }
        },
        error => (this.loginErrorStr = error)
      );
    }
  }
}
