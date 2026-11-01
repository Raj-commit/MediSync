import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { fakeJwt } from '../auth/testing';
import { AdminUser, AdminUsersListResponse, AdminUserUpdateResponse } from './admin.models';
import { AdminUsersService } from './admin.service';

const ADMIN_USERS_URL = `${environment.apiUrl}/admin/users`;

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let httpTesting: HttpTestingController;
  let auth: AuthService;

  const mockUsers: AdminUser[] = [
    {
      id: 'usr-1',
      name: 'Alice Patient',
      email: 'alice@example.com',
      phone: '+911234567890',
      role: 'patient',
      isActive: true,
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    {
      id: 'usr-2',
      name: 'Dr. Bob Smith',
      email: 'bob@example.com',
      phone: '+919876543210',
      role: 'doctor',
      isActive: false,
      createdAt: '2026-10-02T12:00:00.000Z',
      specialisations: ['Cardiology'],
      qualification: 'MBBS, MD',
    },
  ];

  const mockListResponse: AdminUsersListResponse = {
    users: mockUsers,
    pagination: {
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    },
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' }),
    );

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AdminUsersService],
    });

    service = TestBed.inject(AdminUsersService);
    httpTesting = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('fetches users without query parameters by default', () => {
    service.getUsers().subscribe((res) => {
      expect(res).toEqual(mockListResponse);
      expect(service.users().length).toBe(2);
      expect(service.pagination()?.total).toBe(2);
    });

    const req = httpTesting.expectOne(ADMIN_USERS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(mockListResponse);
  });

  it('correctly sets query params for role, status, search, page, and limit', () => {
    service
      .getUsers({
        role: 'doctor',
        status: 'active',
        search: 'Bob',
        page: 2,
        limit: 25,
      })
      .subscribe((res) => {
        expect(res.users.length).toBe(2);
      });

    const req = httpTesting.expectOne((r) => r.url === ADMIN_USERS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('role')).toBe('doctor');
    expect(req.request.params.get('status')).toBe('active');
    expect(req.request.params.get('search')).toBe('Bob');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('25');
    req.flush(mockListResponse);
  });

  it('trims and omits empty or whitespace-only search query', () => {
    service.getUsers({ search: '   ' }).subscribe();

    const req = httpTesting.expectOne(ADMIN_USERS_URL);
    expect(req.request.params.has('search')).toBe(false);
    req.flush(mockListResponse);
  });

  it('sends PATCH with { isActive } and updates the user in the in-memory signal', () => {
    // Populate in-memory signal first
    service.getUsers().subscribe();
    const getReq = httpTesting.expectOne(ADMIN_USERS_URL);
    getReq.flush(mockListResponse);

    expect(service.users()[0].isActive).toBe(true);

    const updatedUser: AdminUser = {
      ...mockUsers[0],
      isActive: false,
    };
    const updateResponse: AdminUserUpdateResponse = {
      user: updatedUser,
    };

    service.updateUserStatus('usr-1', false).subscribe((res) => {
      expect(res.user.isActive).toBe(false);
      expect(service.users()[0].isActive).toBe(false);
    });

    const patchReq = httpTesting.expectOne(`${ADMIN_USERS_URL}/usr-1`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ isActive: false });
    patchReq.flush(updateResponse);
  });

  it('clears in-memory data when clearMemory() is called', () => {
    service.getUsers().subscribe();
    httpTesting.expectOne(ADMIN_USERS_URL).flush(mockListResponse);

    expect(service.users().length).toBe(2);
    expect(service.pagination()).not.toBeNull();

    service.clearMemory();

    expect(service.users().length).toBe(0);
    expect(service.pagination()).toBeNull();
  });

  it('automatically clears in-memory data when the user logs out', () => {
    service.getUsers().subscribe();
    httpTesting.expectOne(ADMIN_USERS_URL).flush(mockListResponse);

    expect(service.users().length).toBe(2);

    auth.logout();
    TestBed.flushEffects();

    expect(service.users().length).toBe(0);
    expect(service.pagination()).toBeNull();
  });
});
