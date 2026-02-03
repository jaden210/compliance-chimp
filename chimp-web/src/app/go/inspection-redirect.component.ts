import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  standalone: true,
  selector: 'app-inspection-redirect',
  template: `
    <div class="redirect-container">
      <mat-spinner diameter="48"></mat-spinner>
      <p>Loading inspection...</p>
    </div>
  `,
  styles: [`
    .redirect-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      gap: 16px;
      background: #f9fafb;
    }

    p {
      color: #6b7280;
      font-size: 14px;
      margin: 0;
    }
  `],
  imports: [CommonModule, MatProgressSpinnerModule]
})
export class InspectionRedirectComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);

  ngOnInit(): void {
    const selfInspectionId = this.route.snapshot.paramMap.get('selfInspectionId');
    const inspectionId = this.route.snapshot.paramMap.get('inspectionId');
    const memberId = this.route.snapshot.queryParamMap.get('member-id');

    // Check if mobile (viewport width <= 768px or mobile user agent)
    const isMobile = this.isMobileDevice();

    if (isMobile) {
      // Mobile always goes to user module
      this.navigateToUserModule(selfInspectionId, inspectionId, memberId);
    } else {
      // Desktop: check auth status
      this.checkAuthAndRedirect(selfInspectionId, inspectionId, memberId);
    }
  }

  private isMobileDevice(): boolean {
    // Check viewport width
    const viewportWidth = window.innerWidth;
    if (viewportWidth <= 768) {
      return true;
    }

    // Check user agent for mobile devices
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileKeywords = [
      'android',
      'webos',
      'iphone',
      'ipad',
      'ipod',
      'blackberry',
      'windows phone',
      'mobile'
    ];

    return mobileKeywords.some(keyword => userAgent.includes(keyword));
  }

  private checkAuthAndRedirect(
    selfInspectionId: string | null,
    inspectionId: string | null,
    memberId: string | null
  ): void {
    const unsubscribe = onAuthStateChanged(this.auth, (user) => {
      unsubscribe();

      if (user) {
        // Authenticated on desktop -> account module
        this.navigateToAccountModule(selfInspectionId, inspectionId);
      } else {
        // Not authenticated on desktop -> user module
        this.navigateToUserModule(selfInspectionId, inspectionId, memberId);
      }
    });
  }

  private navigateToUserModule(
    selfInspectionId: string | null,
    inspectionId: string | null,
    memberId: string | null
  ): void {
    const queryParams = memberId ? { 'member-id': memberId } : {};
    this.router.navigate(
      ['/user/self-inspections', selfInspectionId, inspectionId],
      { queryParams, queryParamsHandling: 'merge' }
    );
  }

  private navigateToAccountModule(
    selfInspectionId: string | null,
    inspectionId: string | null
  ): void {
    this.router.navigate([
      '/account/self-inspections',
      selfInspectionId,
      inspectionId
    ]);
  }
}
