import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Role } from './auth.models';
import { AuthService } from './auth.service';
import { dashboardPathFor } from './dashboard-path';

// This only decides what the screen shows. The API checks the role again on every request.
export function roleGuard(...allowedRoles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.role();

    if (!role) {
      return router.createUrlTree(['/login']);
    }
    // Logged in with the wrong role: send the user to their own dashboard.
    return allowedRoles.includes(role) ? true : router.createUrlTree([dashboardPathFor(role)]);
  };
}
