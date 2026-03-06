import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'report/:token',
    loadComponent: () =>
      import('./report/report-page').then(m => m.ReportPageComponent),
    title: 'OSHA Compliance Report — ComplianceChimp',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/lead-gen-dashboard').then(m => m.LeadGenDashboardComponent),
    title: 'Lead Gen Dashboard — ComplianceChimp',
  },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: '/dashboard' },
];
