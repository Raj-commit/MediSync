import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AdminUser,
  GetAdminUsersParams,
  UserRoleFilter,
  UserStatusFilter,
} from '../../../core/admin/admin.models';
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

  @ViewChild('modalRef') modalRef?: ElementRef<HTMLDivElement>;
  @ViewChild('cancelBtn') cancelBtnRef?: ElementRef<HTMLButtonElement>;

  private triggerElement: HTMLElement | null = null;

  readonly loading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly page = signal<number>(1);
  readonly limit = signal<number>(10);

  // Search and filter state (strictly in-memory, never persisted to storage/URL)
  readonly searchInput = signal<string>('');
  readonly activeSearch = signal<string>('');
  readonly roleFilter = signal<UserRoleFilter>('all');
  readonly statusFilter = signal<UserStatusFilter>('all');

  // Modal confirmation dialog state
  readonly selectedUser = signal<AdminUser | null>(null);
  readonly actionType = signal<'activate' | 'deactivate' | null>(null);
  readonly submittingAction = signal<boolean>(false);
  readonly actionError = signal<string | null>(null);
  readonly actionSuccess = signal<string | null>(null);

  // Status message for screen readers
  readonly liveAnnouncement = signal<string>('');

  // Computed signals from admin service
  readonly users = computed(() => this.adminService.users());
  readonly pagination = computed(() => this.adminService.pagination());

  // Check if any filter or search query is currently applied
  readonly hasActiveFilters = computed(
    () =>
      this.activeSearch().trim().length > 0 ||
      this.roleFilter() !== 'all' ||
      this.statusFilter() !== 'all',
  );

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
    // Strictly clear all in-memory user data, search text, and filters when navigating away
    this.searchInput.set('');
    this.activeSearch.set('');
    this.roleFilter.set('all');
    this.statusFilter.set('all');
    this.page.set(1);
    this.selectedUser.set(null);
    this.actionType.set(null);
    this.actionError.set(null);
    this.actionSuccess.set(null);
    this.triggerElement = null;
    this.adminService.clearMemory();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const params: GetAdminUsersParams = {
      page: this.page(),
      limit: this.limit(),
    };

    const trimmedSearch = this.activeSearch().trim();
    if (trimmedSearch.length > 0) {
      params.search = trimmedSearch;
    }

    if (this.roleFilter() !== 'all') {
      params.role = this.roleFilter() as 'patient' | 'doctor';
    }

    if (this.statusFilter() !== 'all') {
      params.status = this.statusFilter() as 'active' | 'inactive';
    }

    this.adminService.getUsers(params).subscribe({
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

  /**
   * Search button or Enter key trigger: commits the input value and resets to page 1.
   * Prevents issuing duplicate requests if query has not changed.
   */
  onSearchSubmit(): void {
    const query = this.searchInput().trim();
    if (query === this.activeSearch() && this.page() === 1) {
      return; // No duplicate request
    }
    this.activeSearch.set(query);
    this.page.set(1);
    this.loadUsers();
  }

  /**
   * Role dropdown filter change: resets to page 1 and reloads.
   */
  onRoleFilterChange(role: string): void {
    const validRole = role as UserRoleFilter;
    if (validRole === this.roleFilter() && this.page() === 1) {
      return;
    }
    this.roleFilter.set(validRole);
    this.page.set(1);
    this.loadUsers();
  }

  /**
   * Status dropdown filter change: resets to page 1 and reloads.
   */
  onStatusFilterChange(status: string): void {
    const validStatus = status as UserStatusFilter;
    if (validStatus === this.statusFilter() && this.page() === 1) {
      return;
    }
    this.statusFilter.set(validStatus);
    this.page.set(1);
    this.loadUsers();
  }

  /**
   * Clears search input and all dropdown filters, resets to page 1, and reloads.
   */
  clearFilters(): void {
    this.searchInput.set('');
    this.activeSearch.set('');
    this.roleFilter.set('all');
    this.statusFilter.set('all');
    this.page.set(1);
    this.loadUsers();
  }

  goToPage(newPage: number): void {
    const p = this.pagination();
    if (!p || newPage < 1 || newPage > p.totalPages || newPage === this.page()) {
      return;
    }
    this.page.set(newPage);
    this.loadUsers();
  }

  /**
   * Opens the deactivation modal for a specific user.
   * Remembers the triggering element and sets initial focus to Cancel.
   */
  openDeactivateModal(user: AdminUser, event?: Event): void {
    this.triggerElement =
      (event?.target as HTMLElement) || (document.activeElement as HTMLElement) || null;
    this.selectedUser.set(user);
    this.actionType.set('deactivate');
    this.actionError.set(null);
    this.actionSuccess.set(null);
    setTimeout(() => this.cancelBtnRef?.nativeElement?.focus(), 0);
  }

  /**
   * Opens the activation confirmation modal for a specific user.
   * Remembers the triggering element and sets initial focus to Cancel.
   */
  openActivateModal(user: AdminUser, event?: Event): void {
    this.triggerElement =
      (event?.target as HTMLElement) || (document.activeElement as HTMLElement) || null;
    this.selectedUser.set(user);
    this.actionType.set('activate');
    this.actionError.set(null);
    this.actionSuccess.set(null);
    setTimeout(() => this.cancelBtnRef?.nativeElement?.focus(), 0);
  }

  /**
   * Closes the confirmation modal and restores focus to the triggering element.
   */
  closeModal(): void {
    if (this.submittingAction()) {
      return; // Prevent closing while API request is in progress
    }
    this.selectedUser.set(null);
    this.actionType.set(null);
    this.actionError.set(null);
    if (this.triggerElement && typeof this.triggerElement.focus === 'function') {
      this.triggerElement.focus();
    }
    this.triggerElement = null;
  }

  /**
   * Submits the activation/deactivation request via AdminUsersService.
   * On success: updates user in-place, shows success notification, and closes dialog.
   * On error: leaves dialog open and displays error message.
   */
  confirmStatusUpdate(): void {
    const user = this.selectedUser();
    const action = this.actionType();
    if (!user || !action || this.submittingAction()) {
      return;
    }

    const newStatus = action === 'activate';
    this.submittingAction.set(true);
    this.actionError.set(null);

    this.adminService.updateUserStatus(user.id, newStatus).subscribe({
      next: (res) => {
        this.submittingAction.set(false);
        const actionVerb = newStatus ? 'activated' : 'deactivated';
        const msg = `Account for ${res.user.name} has been ${actionVerb}.`;
        this.actionSuccess.set(msg);
        this.liveAnnouncement.set(msg);
        this.closeModal();
      },
      error: (err) => {
        this.submittingAction.set(false);
        if (err.status === 0) {
          this.actionError.set('Cannot reach the server. Please check your connection.');
        } else {
          this.actionError.set(
            err.error?.message || `Failed to ${action} account. Please try again.`,
          );
        }
      },
    });
  }

  /**
   * Handles keyboard focus trap and Escape key within the modal dialog.
   */
  onModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeModal();
      return;
    }

    if (event.key === 'Tab') {
      const focusable = this.modalRef?.nativeElement?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    }
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
