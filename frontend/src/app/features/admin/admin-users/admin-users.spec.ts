import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { AdminUsersService } from '../../../core/admin/admin.service';
import { fakeJwt } from '../../../core/auth/testing';
import { AdminUsers } from './admin-users';

const ADMIN_USERS_URL = `${environment.apiUrl}/admin/users`;

describe('AdminUsers Component (FR-19)', () => {
  let fixture: ComponentFixture<AdminUsers>;
  let component: AdminUsers;
  let page: HTMLElement;
  let http: HttpTestingController;
  let adminService: AdminUsersService;

  const mockUsersResponse = {
    users: [
      {
        id: 'usr-pat-1',
        name: 'Alice Patient',
        email: 'alice@example.com',
        phone: '+1 555-0101',
        role: 'patient' as const,
        isActive: true,
        createdAt: '2026-01-15T10:00:00.000Z',
      },
      {
        id: 'usr-doc-2',
        name: 'Dr. Robert Smith',
        email: 'robert@example.com',
        phone: '+1 555-0102',
        role: 'doctor' as const,
        isActive: false,
        createdAt: '2026-02-20T14:30:00.000Z',
        specialisations: ['Cardiology', 'Internal Medicine'],
        qualification: 'MBBS, MD',
      },
    ],
    pagination: {
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    },
  };

  beforeEach(async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({
        id: 'admin-1',
        name: 'Admin Asha',
        email: 'asha@example.com',
        role: 'admin',
      }),
    );

    await TestBed.configureTestingModule({
      imports: [AdminUsers],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminUsers);
    component = fixture.componentInstance;
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
    adminService = TestBed.inject(AdminUsersService);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('fetches users on init and renders desktop semantic table and user details', async () => {
    fixture.detectChanges();

    const req = http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`);
    expect(req.request.method).toBe('GET');
    req.flush(mockUsersResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // Semantic table structure
    const table = page.querySelector('.users-table');
    expect(table).toBeTruthy();
    expect(table?.querySelector('caption')).toBeTruthy();

    const colHeaders = page.querySelectorAll('th[scope="col"]');
    expect(colHeaders.length).toBe(6);

    const rows = page.querySelectorAll('tbody .user-row');
    expect(rows.length).toBe(2);

    // Patient row checks
    const firstRow = rows[0];
    expect(firstRow.querySelector('.user-name')?.textContent).toContain(
      'Alice Patient',
    );
    expect(firstRow.querySelector('.contact-email')?.textContent).toContain(
      'alice@example.com',
    );
    expect(firstRow.querySelector('.contact-phone')?.textContent).toContain(
      '+1 555-0101',
    );
    expect(firstRow.querySelector('.role-badge')?.textContent?.trim()).toBe(
      'Patient',
    );
    expect(firstRow.querySelector('.status-text')?.textContent?.trim()).toBe(
      'Active',
    );
    expect(firstRow.querySelector('.status-icon')?.textContent?.trim()).toBe(
      '✓',
    );
    expect(firstRow.querySelector('.doctor-meta')).toBeNull();

    // Doctor row checks (qualification and specialisations)
    const secondRow = rows[1];
    expect(secondRow.querySelector('.user-name')?.textContent).toContain(
      'Dr. Robert Smith',
    );
    expect(secondRow.querySelector('.doctor-meta')?.textContent).toContain(
      'MBBS, MD • Cardiology, Internal Medicine',
    );
    expect(secondRow.querySelector('.role-badge')?.textContent?.trim()).toBe(
      'Doctor',
    );
    expect(secondRow.querySelector('.status-text')?.textContent?.trim()).toBe(
      'Inactive',
    );
    expect(secondRow.querySelector('.status-icon')?.textContent?.trim()).toBe(
      '⊘',
    );

    // Responsive data-label attributes for mobile cards
    const nameCell = firstRow.querySelector('.cell-name');
    expect(nameCell?.getAttribute('data-label')).toBe('Name');
    const contactCell = firstRow.querySelector('.cell-contact');
    expect(contactCell?.getAttribute('data-label')).toBe('Contact');
    const roleCell = firstRow.querySelector('.cell-role');
    expect(roleCell?.getAttribute('data-label')).toBe('Role');
    const statusCell = firstRow.querySelector('.cell-status');
    expect(statusCell?.getAttribute('data-label')).toBe('Status');
  });

  it('does not send API request while typing, and searches only on explicit button click or submit', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    const searchInput = page.querySelector<HTMLInputElement>('.input-search')!;
    searchInput.value = 'Alice';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // No request issued while typing
    http.expectNone(`${ADMIN_USERS_URL}?page=1&limit=10&search=Alice`);

    // Click search button
    const searchBtn = page.querySelector<HTMLButtonElement>('.button-search')!;
    searchBtn.click();
    fixture.detectChanges();

    const searchReq = http.expectOne(
      `${ADMIN_USERS_URL}?search=Alice&page=1&limit=10`,
    );
    expect(searchReq.request.method).toBe('GET');
    searchReq.flush({
      users: [mockUsersResponse.users[0]],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('tbody .user-row').length).toBe(1);
    expect(page.querySelector('.user-name')?.textContent).toContain(
      'Alice Patient',
    );

    // Clicking search again with identical text does not send a duplicate request
    searchBtn.click();
    http.expectNone(`${ADMIN_USERS_URL}?search=Alice&page=1&limit=10`);
  });

  it('filters by role and resets to page 1', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    const roleSelect = page.querySelector<HTMLSelectElement>('#admin-role-filter')!;
    roleSelect.value = 'doctor';
    roleSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const roleReq = http.expectOne(
      `${ADMIN_USERS_URL}?role=doctor&page=1&limit=10`,
    );
    expect(roleReq.request.method).toBe('GET');
    roleReq.flush({
      users: [mockUsersResponse.users[1]],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('tbody .user-row').length).toBe(1);
    expect(page.querySelector('.user-name')?.textContent).toContain(
      'Dr. Robert Smith',
    );
  });

  it('filters by status and resets to page 1', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    const statusSelect = page.querySelector<HTMLSelectElement>(
      '#admin-status-filter',
    )!;
    statusSelect.value = 'inactive';
    statusSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const statusReq = http.expectOne(
      `${ADMIN_USERS_URL}?status=inactive&page=1&limit=10`,
    );
    expect(statusReq.request.method).toBe('GET');
    statusReq.flush({
      users: [mockUsersResponse.users[1]],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('tbody .user-row').length).toBe(1);
    expect(page.querySelector('.status-text')?.textContent?.trim()).toBe(
      'Inactive',
    );
  });

  it('clears all filters and resets search and dropdowns', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    // Set a role filter
    component.roleFilter.set('doctor');
    component.searchInput.set('Smith');
    component.activeSearch.set('Smith');
    fixture.detectChanges();

    const clearBtn = page.querySelector<HTMLButtonElement>('.button-clear');
    expect(clearBtn).toBeTruthy();
    clearBtn?.click();
    fixture.detectChanges();

    const reloadReq = http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`);
    expect(reloadReq.request.method).toBe('GET');
    reloadReq.flush(mockUsersResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.roleFilter()).toBe('all');
    expect(component.statusFilter()).toBe('all');
    expect(component.searchInput()).toBe('');
    expect(component.activeSearch()).toBe('');
  });

  it('handles pagination navigation correctly', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush({
      users: mockUsersResponse.users,
      pagination: { page: 1, limit: 10, total: 25, totalPages: 3 },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const paginationNav = page.querySelector('.pagination-nav');
    expect(paginationNav).toBeTruthy();
    expect(page.querySelector('.pagination-info')?.textContent).toContain(
      'Page 1 of 3',
    );

    const prevBtn = paginationNav?.querySelectorAll('button')[0]!;
    const nextBtn = paginationNav?.querySelectorAll('button')[1]!;

    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);

    // Click Next
    nextBtn.click();
    fixture.detectChanges();

    const page2Req = http.expectOne(`${ADMIN_USERS_URL}?page=2&limit=10`);
    expect(page2Req.request.method).toBe('GET');
    page2Req.flush({
      users: mockUsersResponse.users,
      pagination: { page: 2, limit: 10, total: 25, totalPages: 3 },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelector('.pagination-info')?.textContent).toContain(
      'Page 2 of 3',
    );
    const updatedPrevBtn = page.querySelectorAll<HTMLButtonElement>('.pagination-nav button')[0]!;
    expect(updatedPrevBtn.disabled).toBe(false);
  });

  it('opens deactivation modal with accessible attributes and warning notice', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    // Click Deactivate button on first active user (Alice Patient)
    const deactivateBtn = page.querySelector<HTMLButtonElement>(
      'tbody tr:first-child .button-danger',
    )!;
    deactivateBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const modal = page.querySelector<HTMLElement>('.modal-dialog');
    expect(modal).toBeTruthy();
    expect(modal?.getAttribute('role')).toBe('dialog');
    expect(modal?.getAttribute('aria-modal')).toBe('true');
    expect(modal?.getAttribute('aria-labelledby')).toBe(
      'deactivate-dialog-title',
    );

    // Title and user name
    expect(modal?.querySelector('h2')?.textContent).toContain(
      'Deactivate Account',
    );
    expect(modal?.textContent).toContain('Alice Patient');
    expect(modal?.textContent).toContain('alice@example.com');

    // Warning notices
    expect(modal?.textContent).toContain(
      'Deactivation takes effect immediately',
    );
    expect(modal?.textContent).toContain(
      'Existing appointments will not be cancelled automatically',
    );

    // Cancel button initial focus check
    const cancelBtn = modal?.querySelector<HTMLButtonElement>(
      '.modal-actions button.button-outline',
    )!;
    expect(cancelBtn).toBeTruthy();
    expect(cancelBtn.textContent?.trim()).toBe('Cancel');
  });

  it('confirms deactivation, sends PATCH, updates user in-place to Inactive, and closes dialog', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    // Open modal for Alice Patient
    const deactivateBtn = page.querySelector<HTMLButtonElement>(
      'tbody tr:first-child .button-danger',
    )!;
    deactivateBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Click Confirm Deactivation
    const confirmBtn = page.querySelector<HTMLButtonElement>(
      '.modal-actions .button-danger',
    )!;
    expect(confirmBtn.textContent).toContain('Confirm Deactivation');
    confirmBtn.click();
    fixture.detectChanges();

    const patchReq = http.expectOne(`${ADMIN_USERS_URL}/usr-pat-1`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ isActive: false });

    // Respond with updated user
    patchReq.flush({
      user: {
        ...mockUsersResponse.users[0],
        isActive: false,
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Modal is closed
    expect(page.querySelector('.modal-dialog')).toBeNull();

    // Success banner is displayed
    const successBanner = page.querySelector('.success-banner');
    expect(successBanner).toBeTruthy();
    expect(successBanner?.textContent).toContain(
      'Account for Alice Patient has been deactivated.',
    );

    // First user is now inactive in table without full page reload
    const firstRowStatus = page.querySelector(
      'tbody tr:first-child .status-text',
    );
    expect(firstRowStatus?.textContent?.trim()).toBe('Inactive');
    const firstRowAction = page.querySelector(
      'tbody tr:first-child .cell-actions button',
    );
    expect(firstRowAction?.textContent?.trim()).toBe('Activate');
  });

  it('keeps deactivation modal open and shows error when PATCH fails', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    // Open modal
    const deactivateBtn = page.querySelector<HTMLButtonElement>(
      'tbody tr:first-child .button-danger',
    )!;
    deactivateBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Confirm
    const confirmBtn = page.querySelector<HTMLButtonElement>(
      '.modal-actions .button-danger',
    )!;
    confirmBtn.click();
    fixture.detectChanges();

    const patchReq = http.expectOne(`${ADMIN_USERS_URL}/usr-pat-1`);
    patchReq.flush(
      { message: 'You cannot deactivate your own account.', code: 'FORBIDDEN' },
      { status: 403, statusText: 'Forbidden' },
    );

    await fixture.whenStable();
    fixture.detectChanges();

    // Modal stays open and displays error
    const modal = page.querySelector('.modal-dialog');
    expect(modal).toBeTruthy();
    const errorBanner = modal?.querySelector('.modal-error-banner');
    expect(errorBanner).toBeTruthy();
    expect(errorBanner?.textContent).toContain(
      'You cannot deactivate your own account.',
    );

    // Status remains unchanged
    expect(component.users()[0].isActive).toBe(true);
  });

  it('opens activation modal and reactivates inactive user account', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    // Click Activate button on second inactive user (Dr. Robert Smith)
    const activateBtn = page.querySelector<HTMLButtonElement>(
      'tbody tr:nth-child(2) .button-secondary',
    )!;
    activateBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const modal = page.querySelector<HTMLElement>('.modal-dialog');
    expect(modal).toBeTruthy();
    expect(modal?.getAttribute('aria-labelledby')).toBe('activate-dialog-title');
    expect(modal?.querySelector('h2')?.textContent).toContain(
      'Reactivate Account',
    );
    expect(modal?.textContent).toContain('Dr. Robert Smith');

    // Confirm Activation
    const confirmBtn = modal?.querySelector<HTMLButtonElement>(
      '.modal-actions .button-primary',
    )!;
    expect(confirmBtn.textContent).toContain('Confirm Activation');
    confirmBtn.click();
    fixture.detectChanges();

    const patchReq = http.expectOne(`${ADMIN_USERS_URL}/usr-doc-2`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ isActive: true });

    patchReq.flush({
      user: {
        ...mockUsersResponse.users[1],
        isActive: true,
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Modal closed and status updated
    expect(page.querySelector('.modal-dialog')).toBeNull();
    const secondRowStatus = page.querySelector(
      'tbody tr:nth-child(2) .status-text',
    );
    expect(secondRowStatus?.textContent?.trim()).toBe('Active');
  });

  it('cancels modal when Cancel button is clicked or Escape key is pressed', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    // Open modal
    page
      .querySelector<HTMLButtonElement>('tbody tr:first-child .button-danger')!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(page.querySelector('.modal-dialog')).toBeTruthy();

    // Click Cancel
    page
      .querySelector<HTMLButtonElement>('.modal-actions .button-outline')!
      .click();
    fixture.detectChanges();
    expect(page.querySelector('.modal-dialog')).toBeNull();

    // Open modal again
    page
      .querySelector<HTMLButtonElement>('tbody tr:first-child .button-danger')!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(page.querySelector('.modal-dialog')).toBeTruthy();

    // Press Escape
    const modal = page.querySelector<HTMLElement>('.modal-dialog')!;
    modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(page.querySelector('.modal-dialog')).toBeNull();
  });

  it('displays empty state when zero users match query', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush({
      users: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelector('.empty-state')).toBeTruthy();
    expect(page.querySelector('.state-title')?.textContent).toContain(
      'No accounts found',
    );
  });

  it('displays error banner with retry button when initial API call fails', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(
      { message: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await fixture.whenStable();
    fixture.detectChanges();

    const errorBanner = page.querySelector('.error-banner');
    expect(errorBanner).toBeTruthy();
    expect(errorBanner?.textContent).toContain('Internal server error');

    // Click Retry
    const retryBtn = errorBanner?.querySelector<HTMLButtonElement>('button')!;
    retryBtn.click();
    fixture.detectChanges();

    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('tbody .user-row').length).toBe(2);
  });

  it('clears all in-memory search, filter, and user state on component destroy (NFR-08)', async () => {
    fixture.detectChanges();
    http.expectOne(`${ADMIN_USERS_URL}?page=1&limit=10`).flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    component.searchInput.set('SecretSearch');
    component.activeSearch.set('SecretSearch');
    component.roleFilter.set('doctor');
    component.statusFilter.set('inactive');
    expect(adminService.users().length).toBe(2);

    // Destroy component
    fixture.destroy();

    expect(component.searchInput()).toBe('');
    expect(component.activeSearch()).toBe('');
    expect(component.roleFilter()).toBe('all');
    expect(component.statusFilter()).toBe('all');
    expect(adminService.users().length).toBe(0);
    expect(adminService.pagination()).toBeNull();
  });
});
