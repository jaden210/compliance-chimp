import { Routes } from "@angular/router";
import { SelfInspectionsComponent } from "./self-inspections.component";
import { SelfInspectionComponent } from "./self-inspection/self-inspection.component";
import { SelfInspectionsService } from "./self-inspections.service";
import { CreateEditSelfInspectionComponent } from "./create-edit-self-inspection/create-edit-self-inspection.component";
import { SelfInspectionsListComponent } from "./self-inspections-list/self-inspections-list.component";
import { TakeSelfInspectionComponent } from "./take-self-inspection/take-self-inspection.component";

export const selfInspectionsRoutes: Routes = [
  {
    path: "",
    component: SelfInspectionsComponent,
    providers: [SelfInspectionsService],
    children: [
      { path: "", component: SelfInspectionsListComponent },
      { path: "new", component: CreateEditSelfInspectionComponent },
      { path: ":selfInspectionId", component: SelfInspectionComponent },
      { path: ":selfInspectionId/edit", component: CreateEditSelfInspectionComponent },
      { path: ":selfInspectionId/:inspectionId", component: TakeSelfInspectionComponent },
    ]
  }
];
