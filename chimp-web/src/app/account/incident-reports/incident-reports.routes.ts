import { Routes } from "@angular/router";
import { IncidentReportsComponent } from "./incident-reports.component";
import { IncidentReportsListComponent } from "./incident-reports-list/incident-reports-list.component";
import { IncidentReportComponent } from "./incident-report/incident-report.component";
import { Osha300LogComponent } from "./osha-300-log/osha-300-log.component";
import { Osha300ASummaryComponent } from "./osha-300a-summary/osha-300a-summary.component";

export const incidentReportsRoutes: Routes = [
  {
    path: "",
    component: IncidentReportsComponent,
    children: [
      { path: "", component: IncidentReportsListComponent },
      { path: "osha-300", component: Osha300LogComponent },
      { path: "osha-300a", component: Osha300ASummaryComponent },
      { path: ":reportId", component: IncidentReportComponent },
    ]
  }
];
