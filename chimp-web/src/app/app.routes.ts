import { Routes } from "@angular/router";
import { HomeComponent } from "./home/home.component";
import { ContactComponent } from "./contact/contact.component";
import { SignUpPageComponent } from "./sign-up-page/sign-up-page.component";
import { SignInComponent } from "./sign-in/sign-in.component";
import { HowComponent } from "./how/how.component";
import { TermsOfUseComponent } from "./terms-of-use/terms-of-use.component";
import { PrivacyPolicyComponent } from "./privacy-policy/privacy-policy.component";
import { CustomerAgreementComponent } from "./customer-agreement/customer-agreement.component";
import { AuthGuard } from "./auth.gaurd";
import { JoinTeamComponent } from "./join-team/join-team.component";
import { CommonQuestionsComponent } from "./common-questions/common-questions.component";
import { PlansComponent } from "./plans/plans.component";

export const appRoutes: Routes = [
  { path: "", redirectTo: "home", pathMatch: "full" },
  { path: "home", component: HomeComponent },
  { path: "contact", component: ContactComponent },
  { path: "how-it-works", component: HowComponent },
  { path: "common-questions", component: CommonQuestionsComponent },
  { path: "plans", component: PlansComponent },
  { path: "sign-up", component: SignUpPageComponent },
  { path: "sign-in", component: SignInComponent },
  {
    path: "blog",
    loadChildren: () => import('./blog/blog.routes').then(m => m.blogRoutes)
  },
  {
    path: "get-started",
    loadChildren: () => import('./challenge/challenge.routes').then(m => m.challengeRoutes)
  },
  {
    path: "challenge",
    redirectTo: "get-started",
    pathMatch: "prefix"
  },
  { path: "terms-of-service", component: TermsOfUseComponent },
  { path: "privacy-policy", component: PrivacyPolicyComponent },
  { path: "customer-agreement", component: CustomerAgreementComponent },
  { path: "join-team", component: JoinTeamComponent },
  {
    path: "account",
    loadChildren: () =>
    import("./account/account.routes").then((m) => m.accountRoutes),
    canActivate:  [AuthGuard]
  },
  {
    path: "user",
    loadChildren: () =>
    import("./user/user.routes").then((m) => m.userRoutes),
  },
];
