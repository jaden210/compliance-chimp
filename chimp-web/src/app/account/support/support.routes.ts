import { Routes } from "@angular/router";
import { HomeComponent } from "./home/home.component";
import { SupportService } from "./support.service";

export const supportRoutes: Routes = [
  { path: "", component: HomeComponent, providers: [SupportService] }
];
