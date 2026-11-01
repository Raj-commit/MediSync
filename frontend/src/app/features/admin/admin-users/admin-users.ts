import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AdminUser } from '../../../core/admin/admin.models';
import { AdminUsersService } from '../../../core/admin/admin.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.css',
})
export class AdminUsers implements OnInit, OnDestroy {
  protected readonly adminService = inject(AdminUsersService);

  readonly loading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly page = signal<number>(1);
  readonly limit = signal<number>(10);

  // Status message for screen readers
  readonly liveAnnouncement = signal<string>('');

  // Computed signals from admin service
  readonly users = computed(() => this.adminService.users());
  readonly pagination = computed(() => this.adminService.pagination());

  // Count summary, e.g. "Showing 1 to 10 of 42 accounts"
  readonly countSummary = computed(() => {
    const p = this.pagination();
    if (!p || p.total === 0) {
      return '0 accounts';
    }
    const start = (p.page - 1) * p.limit + 1;
    const end = Math.min(p.page * p.limit, p.total);
    return `Showing ${start} to ${end} of ${p.total} accounts`;
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  ngOnDestroy(): void {
    // Strictly clear all in-memory user data when navigating away
    this.adminService.clearMemory();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.adminService
      .getUsers({
        page: this.page(),
        limit: this.limit(),
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.liveAnnouncement.set(`Loaded ${res.users.length} accounts. ${this.countSummary()}`);
        },
        error: (err) => {
          this.loading.set(false);
          if (err.status === 0) {
            this.errorMessage.set('Cannot reach the server. Please try again.');
          } else {
            this.errorMessage.set(
              err.error?.message || 'Failed to load user accounts. Please try again.',
            );
          }
          this.liveAnnouncement.set('Error loading accounts.');
        },
      });
  }

  goToPage(newPage: number): void {
    const p = this.pagination();
    if (!p || newPage < 1 || newPage > p.totalPages || newPage === this.page()) {
      return;
    }
    this.page.set(newPage);
    this.loadUsers();
  }

  formatDate(dateString: string): string {
    if (!dateString) return '—';
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  }

  doctorDetails(user: AdminUser): string {
    if (user.role !== 'doctor') return '';
    const parts: string[] = [];
    if (user.qualification) {
      parts.push(user.qualification);
    }
    if (user.specialisations && user.specialisations.length > 0) {
      parts.push(user.specialisations.join(', '));
    }
    return parts.join(' • ');
  }
}
