import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { dashboardPathFor } from './dashboard-path';

/**
 * Prevents logged-in users from accessing guest-only routes (/login, /register),
 * redirecting them directly to their role-specific dashboard.
 */
export const noAuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const role = auth.role();

  if (role) {
    return router.createUrlTree([dashboardPathFor(role)]);
  }

  return true;
};
