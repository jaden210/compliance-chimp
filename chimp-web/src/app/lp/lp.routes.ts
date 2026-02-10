import { Routes } from '@angular/router';
import { OshaComplianceLpComponent } from './osha-compliance/osha-compliance-lp.component';
import { RoofingContractorsLpComponent } from './roofing-contractors/roofing-contractors-lp.component';
import { OutreachLandingPageComponent } from './outreach/outreach-lp.component';

export const lpRoutes: Routes = [
  { path: 'osha-compliance', component: OshaComplianceLpComponent },
  { path: 'roofing-contractors', component: RoofingContractorsLpComponent },
  { path: 'o/:slug', component: OutreachLandingPageComponent },
];
