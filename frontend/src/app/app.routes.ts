import { Routes } from '@angular/router';

import { roleGuard } from './core/auth/role.guard';
import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';
import { Home } from './features/home/home';
import { NotFound } from './shared/not-found/not-found';

export const routes: Routes = [
  { path: '', component: Home, title: 'MediSync' },
  { path: 'login', component: Login, title: 'Login | MediSync' },
  { path: 'register', component: Register, title: 'Register | MediSync' },
  {
    path: 'patient',
    canActivate: [roleGuard('patient')],
    loadComponent: () =>
      import('./features/patient/patient-dashboard/patient-dashboard').then(
        (m) => m.PatientDashboard,
      ),
    title: 'Patient dashboard | MediSync',
  },
  {
    path: 'doctor',
    canActivate: [roleGuard('doctor')],
    loadComponent: () =>
      import('./features/doctor/doctor-dashboard/doctor-dashboard').then((m) => m.DoctorDashboard),
    title: 'Doctor dashboard | MediSync',
  },
  {
    path: 'admin',
    canActivate: [roleGuard('admin')],
    loadComponent: () =>
      import('./features/admin/admin-dashboard/admin-dashboard').then((m) => m.AdminDashboard),
    title: 'Admin dashboard | MediSync',
  },
  { path: '**', component: NotFound, title: 'Page not found | MediSync' },
];
