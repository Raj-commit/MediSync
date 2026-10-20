import { Routes } from '@angular/router';

import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';
import { Home } from './features/home/home';
import { NotFound } from './shared/not-found/not-found';

export const routes: Routes = [
  { path: '', component: Home, title: 'MediSync' },
  { path: 'login', component: Login, title: 'Login | MediSync' },
  { path: 'register', component: Register, title: 'Register | MediSync' },
  { path: '**', component: NotFound, title: 'Page not found | MediSync' },
];
