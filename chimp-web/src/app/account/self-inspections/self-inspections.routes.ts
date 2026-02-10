import { Routes } from "@angular/router";
import { SelfInspectionsComponent } from "./self-inspections.component";
import { SelfInspectionComponent } from "./self-inspection/self-inspection.component";
import { SelfInspectionsService } from "./self-inspections.service";
import { SelfInspectionsListComponent } from "./self-inspections-list/self-inspections-list.component";
import { TakeSelfInspectionComponent } from "./take-self-inspection/take-self-inspection.component";
import { GuideComponent } from "./guide/guide.component";

export const selfInspectionsRoutes: Routes = [
  {
    path: "",
    component: SelfInspectionsComponent,
    providers: [SelfInspectionsService],
    children: [
      { path: "", component: SelfInspectionsListComponent },
      { path: "smart-builder", component: GuideComponent },
      // Keep legacy "guide" route redirecting to smart-builder
      { path: "guide", redirectTo: "smart-builder", pathMatch: "full" },
      // "new" also uses the smart builder in scratch mode
      { path: "new", component: GuideComponent, data: { mode: 'scratch' } },
      { path: ":selfInspectionId", component: SelfInspectionComponent },
      { path: ":selfInspectionId/edit", component: GuideComponent, data: { mode: 'edit' } },
      { path: ":selfInspectionId/:inspectionId", component: TakeSelfInspectionComponent },
    ]
  }
];
