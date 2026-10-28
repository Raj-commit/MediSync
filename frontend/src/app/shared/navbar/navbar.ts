import { Component, computed, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Role } from '../../core/auth/auth.models';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  readonly isLoggedIn = input(false);
  readonly role = input<Role | null>(null);
  readonly unreadCount = input<number>(0);
  readonly logout = output<void>();

  readonly canShowBell = computed(() => {
    const r = this.role();
    return this.isLoggedIn() && (r === 'patient' || r === 'doctor');
  });

  readonly badgeText = computed(() => {
    const count = this.unreadCount();
    if (count <= 0) {
      return '';
    }
    if (count > 99) {
      return '99+';
    }
    return count.toString();
  });

  readonly bellAriaLabel = computed(() => {
    const count = this.unreadCount();
    if (count <= 0) {
      return 'Notifications';
    }
    return `Notifications, ${count} unread`;
  });
}
