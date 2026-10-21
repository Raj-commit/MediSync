import { Role } from './auth.models';

const DASHBOARD_PATHS: Record<Role, string> = {
  patient: '/patient',
  doctor: '/doctor',
  admin: '/admin',
};

export function dashboardPathFor(role: Role): string {
  return DASHBOARD_PATHS[role];
}
