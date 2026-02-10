import { Routes } from "@angular/router";
import { OutreachComponent } from "./outreach.component";
import { OutreachListComponent } from "./outreach-list/outreach-list.component";
import { OutreachDetailComponent } from "./outreach-detail/outreach-detail.component";

export const outreachRoutes: Routes = [
  {
    path: "",
    component: OutreachComponent,
    children: [
      { path: "", component: OutreachListComponent },
      { path: ":jobId", component: OutreachDetailComponent },
      {
        path: ":jobId/campaign",
        loadComponent: () =>
          import("./outreach-detail/email-sequencer/email-sequencer.component").then(
            (m) => m.EmailSequencerComponent
          ),
      },
    ],
  },
];
