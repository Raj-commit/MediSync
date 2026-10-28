import { Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { AuthService } from './core/auth/auth.service';
import { NotificationsService } from './core/notifications/notifications.service';
import { Navbar } from './shared/navbar/navbar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly notificationsService = inject(NotificationsService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const role = this.auth.role();
      if (role === 'patient' || role === 'doctor') {
        this.notificationsService.startPolling();
      } else {
        this.notificationsService.clear();
      }
    });
  }

  protected onLogout(): void {
    this.notificationsService.clear();
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
