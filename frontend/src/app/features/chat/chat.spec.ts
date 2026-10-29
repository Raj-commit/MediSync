import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { ChatHistoryResponse, ChatMessage } from '../../core/chat/chat.models';
import { ChatService } from '../../core/chat/chat.service';
import { ChatPage } from './chat';

describe('ChatPage (Step 2 - History & Pagination)', () => {
  let fixture: ComponentFixture<ChatPage>;
  let component: ChatPage;
  let chatServiceSpy: { getHistory: ReturnType<typeof vi.fn> };
  let roleSignal: ReturnType<typeof signal<'patient' | 'doctor'>>;
  let authServiceStub: {
    user: () => { id: string; name: string; email: string; role: 'patient' | 'doctor' } | null;
    role: () => 'patient' | 'doctor';
  };

  const mockMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      appointment: 'appt-123',
      seq: 1,
      sender: { id: 'patient-1', name: 'John Doe' },
      content: 'Hello doctor, I have a question about my medication.',
      timestamp: '2026-10-29T10:00:00.000Z',
    },
    {
      id: 'msg-2',
      appointment: 'appt-123',
      seq: 2,
      sender: { id: 'doctor-1', name: 'Dr. Jane Smith' },
      content: 'Hello John! Sure, what symptoms are you experiencing?',
      timestamp: '2026-10-29T10:01:00.000Z',
    },
  ];

  beforeEach(async () => {
    chatServiceSpy = {
      getHistory: vi.fn(),
    };

    roleSignal = signal<'patient' | 'doctor'>('patient');

    authServiceStub = {
      user: () => ({
        id: 'patient-1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'patient',
      }),
      role: roleSignal,
    };

    await TestBed.configureTestingModule({
      imports: [ChatPage],
      providers: [
        provideRouter(routes),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? 'appt-123' : null),
              },
            },
          },
        },
        { provide: ChatService, useValue: chatServiceSpy },
        { provide: AuthService, useValue: authServiceStub },
      ],
    }).compileComponents();
  });

  it('loads and renders message history on initialization', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({
        messages: mockMessages,
        hasMore: false,
      } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(chatServiceSpy.getHistory).toHaveBeenCalledWith('appt-123', { limit: 50 });
    expect(component.messages().length).toBe(2);

    const compiled = fixture.nativeElement as HTMLElement;
    const messageRows = compiled.querySelectorAll('.message-row');
    expect(messageRows.length).toBe(2);

    // Verify plain-text content
    expect(compiled.textContent).toContain('Hello doctor, I have a question about my medication.');
    expect(compiled.textContent).toContain('Hello John! Sure, what symptoms are you experiencing?');
  });

  it('visually and textually identifies own messages with (You) distinction', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({
        messages: mockMessages,
        hasMore: false,
      } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const ownRows = compiled.querySelectorAll('.own-row');
    const otherRows = compiled.querySelectorAll('.other-row');

    expect(ownRows.length).toBe(1);
    expect(otherRows.length).toBe(1);

    expect(ownRows[0].textContent).toContain('You');
    expect(ownRows[0].textContent).toContain('(You)');
    expect(otherRows[0].textContent).toContain('Dr. Jane Smith');
  });

  it('displays empty state when consultation has no messages', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({
        messages: [],
        hasMore: false,
      } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-chat-state')).not.toBeNull();
    expect(compiled.textContent).toContain('No messages yet in this consultation.');
  });

  it('shows Load earlier messages button when hasMore is true and prepends earlier messages without duplicates', () => {
    chatServiceSpy.getHistory.mockReturnValueOnce(
      of({
        messages: [mockMessages[1]], // only seq 2
        hasMore: true,
      } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.hasMore()).toBe(true);

    const earlierMock: ChatMessage = {
      id: 'msg-0',
      appointment: 'appt-123',
      seq: 0,
      sender: { id: 'patient-1', name: 'John Doe' },
      content: 'Early question',
      timestamp: '2026-10-29T09:55:00.000Z',
    };

    chatServiceSpy.getHistory.mockReturnValueOnce(
      of({
        messages: [earlierMock, mockMessages[1]], // returns seq 0 and duplicate seq 2
        hasMore: false,
      } as ChatHistoryResponse),
    );

    component.loadEarlierMessages();
    fixture.detectChanges();

    expect(chatServiceSpy.getHistory).toHaveBeenCalledWith('appt-123', {
      limit: 50,
      beforeSeq: 2,
    });

    // Should have seq 0 and seq 2, de-duplicated
    expect(component.messages().length).toBe(2);
    expect(component.messages()[0].seq).toBe(0);
    expect(component.messages()[1].seq).toBe(2);
    expect(component.hasMore()).toBe(false);
  });

  it('displays error message when history loading fails (404 not found)', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      throwError(() => ({
        status: 404,
        error: { message: 'Appointment not found', code: 'NOT_FOUND' },
      })),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.historyError()).toContain('not available for this appointment');
    const compiled = fixture.nativeElement as HTMLElement;
    const errorBox = compiled.querySelector('.error-box');
    expect(errorBox).not.toBeNull();
    expect(errorBox?.getAttribute('role')).toBe('alert');
  });

  it('displays friendly message when server cannot be reached (status 0)', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      throwError(() => ({
        status: 0,
      })),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.historyError()).toBe('Cannot reach the server. Please try again.');
  });

  it('correctly maps back path for patient and doctor roles', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({ messages: [], hasMore: false } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;

    // Patient role
    expect(component.backPath()).toBe('/patient/appointments');

    // Doctor role
    roleSignal.set('doctor');
    expect(component.backPath()).toBe('/doctor/appointments');
  });

  it('verifies route guard configuration for /appointments/:id/chat', () => {
    const chatRoute = routes.find((r) => r.path === 'appointments/:id/chat');
    expect(chatRoute).toBeDefined();
    expect(chatRoute?.title).toBe('Consultation chat | MediSync');
    expect(chatRoute?.canActivate).toBeDefined();
  });
});
