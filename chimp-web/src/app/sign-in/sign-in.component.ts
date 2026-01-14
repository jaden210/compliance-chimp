import { Component } from "@angular/core";
import { Router, RouterModule } from "@angular/router";
import { FormControl, Validators, ReactiveFormsModule } from "@angular/forms";
import { Auth } from "@angular/fire/auth";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatSnackBar } from "@angular/material/snack-bar";
import { AppService } from "../app.service";

declare var gtag: Function;

@Component({
  standalone: true,
  imports: [
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  selector: "sign-in",
  templateUrl: "./sign-in.component.html",
  styleUrls: ["./sign-in.component.css"]
})
export class SignInComponent {
  email: FormControl;
  password: FormControl;
  signinError: string;
  showResetPassword: boolean;

  constructor(
    private router: Router,
    private auth: Auth,
    private appService: AppService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    let emailStr = this.appService.email || "";
    this.email = new FormControl(emailStr, [
      Validators.required,
      Validators.email
    ]);
    this.password = new FormControl("", [Validators.required]);
  }

  getEmailErrorMessage() {
    return this.email.hasError("required")
      ? "email required"
      : this.email.hasError("email")
      ? "not a valid email"
      : "";
  }

  signIn(): void {
    this.signinError = null;
    signInWithEmailAndPassword(this.auth, this.email.value, this.password.value)
      .then(
        () => this.router.navigate(["/account"]),
        error => {
          console.error(error);
          if (error.code == "auth/user-not-found") {
            this.signinError =
              "No users found matching this email address, create a team or ask your employer to add you to their team";
          } else if (error.code == "auth/wrong-password") {
            this.showResetPassword = true;
            this.signinError = "Your password is invalid";
          } else this.signinError = error.message;
        }
      );
  }

  resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email)
      .then(() => {
        this.signinError = null;
        this.snackBar.open(`Reset password email sent to ${email}`, null, {
          duration: 6000
        });
        this.password.setValue(null);
        this.password.markAsPristine();
        gtag("event", "password_reset", {
          event_category: "password",
          event_label: `${this.email.value} reset a password`
        });
        console.log("sent Password Reset Email!");
      })
      .catch(error => console.log(error));
  }
}
