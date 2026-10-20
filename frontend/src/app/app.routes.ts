import { Routes } from '@angular/router';

import { Home } from './features/home/home';
import { NotFound } from './shared/not-found/not-found';

export const routes: Routes = [
  { path: '', component: Home, title: 'MediSync' },
  { path: '**', component: NotFound, title: 'Page not found | MediSync' },
];
