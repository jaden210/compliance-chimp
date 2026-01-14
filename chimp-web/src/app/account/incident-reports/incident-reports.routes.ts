import { Routes } from "@angular/router";
import { IncidentReportsComponent } from "./incident-reports.component";
import { IncidentReportsListComponent } from "./incident-reports-list/incident-reports-list.component";
import { IncidentReportComponent } from "./incident-report/incident-report.component";

export const incidentReportsRoutes: Routes = [
  {
    path: "",
    component: IncidentReportsComponent,
    children: [
      { path: "", component: IncidentReportsListComponent },
      { path: ":reportId", component: IncidentReportComponent },
    ]
  }
];
