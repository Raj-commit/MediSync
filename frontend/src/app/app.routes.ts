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
    path: 'patient/doctors',
    canActivate: [roleGuard('patient')],
    loadComponent: () =>
      import('./features/appointments/doctor-search/doctor-search').then(
        (m) => m.DoctorSearch,
      ),
    title: 'Find a doctor | MediSync',
  },
  {
    path: 'patient/doctors/:id',
    canActivate: [roleGuard('patient')],
    loadComponent: () =>
      import('./features/appointments/doctor-booking/doctor-booking').then(
        (m) => m.DoctorBooking,
      ),
    title: 'Book appointment | MediSync',
  },
  {
    path: 'patient/appointments',
    canActivate: [roleGuard('patient')],
    loadComponent: () =>
      import('./features/patient/patient-appointments/patient-appointments').then(
        (m) => m.PatientAppointments,
      ),
    title: 'My appointments | MediSync',
  },
  {
    path: 'patient/profile',
    canActivate: [roleGuard('patient')],
    loadComponent: () =>
      import('./features/patient/patient-profile/patient-profile').then(
        (m) => m.PatientProfile,
      ),
    title: 'Patient profile | MediSync',
  },
  {
    path: 'patient/records',
    canActivate: [roleGuard('patient')],
    loadComponent: () =>
      import('./features/patient/patient-records/patient-records').then(
        (m) => m.PatientRecords,
      ),
    title: 'My medical records | MediSync',
  },
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
    path: 'doctor/appointments',
    canActivate: [roleGuard('doctor')],
    loadComponent: () =>
      import('./features/doctor/doctor-appointments/doctor-appointments').then(
        (m) => m.DoctorAppointments,
      ),
    title: 'My appointments | MediSync',
  },
  {
    path: 'doctor/availability',
    canActivate: [roleGuard('doctor')],
    loadComponent: () =>
      import('./features/doctor/availability/availability').then((m) => m.Availability),
    title: 'Doctor availability | MediSync',
  },
  {
    path: 'doctor/profile',
    canActivate: [roleGuard('doctor')],
    loadComponent: () =>
      import('./features/doctor/doctor-profile/doctor-profile').then(
        (m) => m.DoctorProfile,
      ),
    title: 'Doctor profile | MediSync',
  },
  {
    path: 'doctor',
    canActivate: [roleGuard('doctor')],
    loadComponent: () =>
      import('./features/doctor/doctor-dashboard/doctor-dashboard').then((m) => m.DoctorDashboard),
    title: 'Doctor dashboard | MediSync',
  },
  {
    path: 'notifications',
    canActivate: [roleGuard('patient', 'doctor')],
    loadComponent: () =>
      import('./features/notifications/notifications').then((m) => m.NotificationsPage),
    title: 'Notifications | MediSync',
  },
  {
    path: 'appointments/:id/chat',
    canActivate: [roleGuard('patient', 'doctor')],
    loadComponent: () => import('./features/chat/chat').then((m) => m.ChatPage),
    title: 'Consultation chat | MediSync',
  },
  {
    path: 'appointments/:id/video',
    canActivate: [roleGuard('patient', 'doctor')],
    loadComponent: () => import('./features/video/video').then((m) => m.VideoPage),
    title: 'Video consultation | MediSync',
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
