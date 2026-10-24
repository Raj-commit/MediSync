import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AvailabilityResponse, UpdateSlotDto } from './availability.models';
import { AvailabilityService } from './availability.service';

const AVAILABILITY_URL = `${environment.apiUrl}/doctors/me/availability`;

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AvailabilityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('fetches doctor future availability slots via GET', () => {
    const mockResponse: AvailabilityResponse = {
      slots: [
        {
          id: 'slot-1',
          startTime: '2026-11-02T04:30:00.000Z',
          endTime: '2026-11-02T05:00:00.000Z',
          isBooked: false,
        },
        {
          id: 'slot-2',
          startTime: '2026-11-02T05:00:00.000Z',
          endTime: '2026-11-02T05:30:00.000Z',
          isBooked: true,
        },
      ],
    };

    let actualResponse: AvailabilityResponse | undefined;
    service.getAvailability().subscribe((res) => {
      actualResponse = res;
    });

    const req = http.expectOne(AVAILABILITY_URL);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    expect(actualResponse).toEqual(mockResponse);
  });

  it('updates open slots via PUT with { slots: [...] } payload', () => {
    const slotsToUpdate: UpdateSlotDto[] = [
      {
        startTime: '2026-11-02T04:30:00.000Z',
        endTime: '2026-11-02T05:00:00.000Z',
      },
    ];

    const mockResponse: AvailabilityResponse = {
      slots: [
        {
          id: 'slot-1',
          startTime: '2026-11-02T04:30:00.000Z',
          endTime: '2026-11-02T05:00:00.000Z',
          isBooked: false,
        },
      ],
    };

    let actualResponse: AvailabilityResponse | undefined;
    service.updateAvailability(slotsToUpdate).subscribe((res) => {
      actualResponse = res;
    });

    const req = http.expectOne(AVAILABILITY_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ slots: slotsToUpdate });
    req.flush(mockResponse);

    expect(actualResponse).toEqual(mockResponse);
  });

  it('propagates HTTP error responses when update is rejected', () => {
    let errorStatus: number | undefined;

    service.updateAvailability([]).subscribe({
      next: () => {
        throw new Error('should have failed');
      },
      error: (err) => {
        errorStatus = err.status;
      },
    });

    const req = http.expectOne(AVAILABILITY_URL);
    req.flush(
      { message: 'Cannot add or modify a slot that overlaps with an already booked slot', code: 'VALIDATION_ERROR' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(errorStatus).toBe(400);
  });
});
