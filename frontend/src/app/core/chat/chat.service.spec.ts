import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ChatHistoryResponse } from './chat.models';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChatService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(ChatService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('fetches chat history without query params by default', () => {
    const mockResponse: ChatHistoryResponse = {
      messages: [
        {
          id: 'msg-1',
          appointment: 'appt-123',
          seq: 1,
          sender: { id: 'user-1', name: 'Dr. Smith' },
          content: 'Hello, how can I help you today?',
          timestamp: '2026-10-29T10:00:00.000Z',
        },
      ],
      hasMore: false,
    };

    service.getHistory('appt-123').subscribe((res) => {
      expect(res).toEqual(mockResponse);
    });

    const req = http.expectOne(`${environment.apiUrl}/appointments/appt-123/messages`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);

    req.flush(mockResponse);
  });

  it('applies pagination and cursor parameters correctly', () => {
    const mockResponse: ChatHistoryResponse = {
      messages: [],
      hasMore: true,
    };

    service
      .getHistory('appt-123', { limit: 20, beforeSeq: 50, afterSeq: 10 })
      .subscribe((res) => {
        expect(res).toEqual(mockResponse);
      });

    const req = http.expectOne(
      (r) =>
        r.url === `${environment.apiUrl}/appointments/appt-123/messages` &&
        r.params.get('limit') === '20' &&
        r.params.get('beforeSeq') === '50' &&
        r.params.get('afterSeq') === '10',
    );

    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
