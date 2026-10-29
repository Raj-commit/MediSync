import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import {
  ChatHistoryResponse,
  ChatMessage,
  NewMessageBroadcast,
} from '../../core/chat/chat.models';
import { ChatService } from '../../core/chat/chat.service';
import {
  SocketConnectionStatus,
  SocketService,
} from '../../core/sockets/socket.service';
import { ChatPage } from './chat';

describe('ChatPage (Step 3 - Live Real-Time Messaging & Reconnect)', () => {
  let fixture: ComponentFixture<ChatPage>;
  let component: ChatPage;
  let chatServiceSpy: { getHistory: ReturnType<typeof vi.fn> };
  let socketServiceSpy: {
    status: ReturnType<typeof signal<SocketConnectionStatus>>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    emitWithAck: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  let newMessageSubject: Subject<NewMessageBroadcast>;
  let roleSignal: ReturnType<typeof signal<'patient' | 'doctor'>>;
  let connectionStatusSignal: ReturnType<typeof signal<SocketConnectionStatus>>;

  const mockMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      appointment: 'appt-123',
      seq: 1,
      sender: { id: 'patient-1', name: 'John Doe' },
      content: 'Hello doctor!',
      timestamp: '2026-10-29T10:00:00.000Z',
    },
    {
      id: 'msg-2',
      appointment: 'appt-123',
      seq: 2,
      sender: { id: 'doctor-1', name: 'Dr. Jane Smith' },
      content: 'Hello John! How can I assist you?',
      timestamp: '2026-10-29T10:01:00.000Z',
    },
  ];

  beforeEach(async () => {
    chatServiceSpy = {
      getHistory: vi.fn(),
    };

    newMessageSubject = new Subject<NewMessageBroadcast>();
    connectionStatusSignal = signal<SocketConnectionStatus>('connected');

    socketServiceSpy = {
      status: connectionStatusSignal,
      connect: vi.fn(),
      disconnect: vi.fn(),
      emitWithAck: vi.fn().mockResolvedValue({ success: true, appointmentId: 'appt-123' }),
      on: vi.fn().mockImplementation((event: string) => {
        if (event === 'new_message') {
          return newMessageSubject.asObservable();
        }
        return of();
      }),
    };

    roleSignal = signal<'patient' | 'doctor'>('patient');

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
        { provide: SocketService, useValue: socketServiceSpy },
        {
          provide: AuthService,
          useValue: {
            user: () => ({
              id: 'patient-1',
              name: 'John Doe',
              email: 'john@example.com',
              role: 'patient',
            }),
            role: roleSignal,
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    newMessageSubject.complete();
  });

  it('connects to socket and joins the appointment room on initialization', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({ messages: mockMessages, hasMore: false } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(socketServiceSpy.connect).toHaveBeenCalled();
    expect(socketServiceSpy.emitWithAck).toHaveBeenCalledWith('join_chat', {
      appointmentId: 'appt-123',
    });
    expect(socketServiceSpy.on).toHaveBeenCalledWith('new_message');
  });

  it('disconnects socket on component destruction', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({ messages: [], hasMore: false } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();

    fixture.destroy();
    expect(socketServiceSpy.disconnect).toHaveBeenCalled();
  });

  it('displays the reactive connection status pill', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({ messages: [], hasMore: false } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.connection-pill.connected')).not.toBeNull();
    expect(compiled.textContent).toContain('Connected');

    connectionStatusSignal.set('reconnecting');
    fixture.detectChanges();
    expect(compiled.querySelector('.connection-pill.reconnecting')).not.toBeNull();
    expect(compiled.textContent).toContain('Reconnecting...');
  });

  it('appends live incoming new_message and de-duplicates by sequence number', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({ messages: mockMessages, hasMore: false } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.messages().length).toBe(2);

    // Incoming duplicate of seq 2 (should be ignored)
    newMessageSubject.next({
      appointmentId: 'appt-123',
      message: mockMessages[1],
    });
    expect(component.messages().length).toBe(2);

    // Incoming new message seq 3
    const liveMsg: ChatMessage = {
      id: 'msg-3',
      appointment: 'appt-123',
      seq: 3,
      sender: { id: 'doctor-1', name: 'Dr. Jane Smith' },
      content: 'Please take the tablet after meals.',
      timestamp: '2026-10-29T10:02:00.000Z',
    };

    newMessageSubject.next({
      appointmentId: 'appt-123',
      message: liveMsg,
    });
    fixture.detectChanges();

    expect(component.messages().length).toBe(3);
    expect(component.messages()[2].content).toBe('Please take the tablet after meals.');

    // Message for another appointment should be ignored
    newMessageSubject.next({
      appointmentId: 'other-appt',
      message: { ...liveMsg, seq: 4, appointment: 'other-appt' },
    });
    expect(component.messages().length).toBe(3);
  });

  it('sends message via Socket.IO, clears input on success, and appends server message', async () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({ messages: mockMessages, hasMore: false } as ChatHistoryResponse),
    );

    const sentMessage: ChatMessage = {
      id: 'msg-3',
      appointment: 'appt-123',
      seq: 3,
      sender: { id: 'patient-1', name: 'John Doe' },
      content: 'Thank you doctor!',
      timestamp: '2026-10-29T10:03:00.000Z',
    };

    socketServiceSpy.emitWithAck.mockImplementation((event: string) => {
      if (event === 'send_message') {
        return Promise.resolve({ success: true, message: sentMessage });
      }
      return Promise.resolve({ success: true });
    });

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.text.set('Thank you doctor!');
    await component.sendMessage();
    fixture.detectChanges();

    expect(socketServiceSpy.emitWithAck).toHaveBeenCalledWith('send_message', {
      appointmentId: 'appt-123',
      content: 'Thank you doctor!',
    });

    // Input should be cleared on success
    expect(component.text()).toBe('');
    expect(component.sendError()).toBeNull();
    // Message should be appended
    expect(component.messages().length).toBe(3);
    expect(component.messages()[2].content).toBe('Thank you doctor!');
  });

  it('preserves user text on send failure and displays server error message', async () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({ messages: mockMessages, hasMore: false } as ChatHistoryResponse),
    );

    socketServiceSpy.emitWithAck.mockImplementation((event: string) => {
      if (event === 'send_message') {
        return Promise.resolve({
          success: false,
          code: 'RATE_LIMITED',
          message: 'Too many messages. Please slow down.',
        });
      }
      return Promise.resolve({ success: true });
    });

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.text.set('My important question that must not be lost');
    await component.sendMessage();
    fixture.detectChanges();

    // Text must remain intact
    expect(component.text()).toBe('My important question that must not be lost');
    expect(component.sendError()).toBe('Too many messages. Please slow down.');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.composer-error-banner')).not.toBeNull();
    expect(compiled.textContent).toContain('Too many messages. Please slow down.');
  });

  it('catches up on missed messages after socket reconnection using afterSeq', () => {
    chatServiceSpy.getHistory.mockReturnValueOnce(
      of({ messages: mockMessages, hasMore: false } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.messages().length).toBe(2);

    const missedMsg: ChatMessage = {
      id: 'msg-3',
      appointment: 'appt-123',
      seq: 3,
      sender: { id: 'doctor-1', name: 'Dr. Jane Smith' },
      content: 'Are you still there?',
      timestamp: '2026-10-29T10:04:00.000Z',
    };

    chatServiceSpy.getHistory.mockReturnValueOnce(
      of({ messages: [missedMsg], hasMore: false } as ChatHistoryResponse),
    );

    // Simulate drop and reconnect
    connectionStatusSignal.set('reconnecting');
    fixture.detectChanges();

    connectionStatusSignal.set('connected');
    fixture.detectChanges();

    expect(socketServiceSpy.emitWithAck).toHaveBeenCalledWith('join_chat', {
      appointmentId: 'appt-123',
    });
    expect(chatServiceSpy.getHistory).toHaveBeenCalledWith('appt-123', {
      afterSeq: 2,
    });

    expect(component.messages().length).toBe(3);
    expect(component.messages()[2].seq).toBe(3);
  });

  it('disables composer and displays read-only banner when consultation is closed', () => {
    chatServiceSpy.getHistory.mockReturnValue(
      of({ messages: mockMessages, hasMore: false } as ChatHistoryResponse),
    );

    fixture = TestBed.createComponent(ChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.chatClosed.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.chat-closed-banner')).not.toBeNull();
    expect(compiled.querySelector('.composer-form')).toBeNull();
    expect(compiled.textContent).toContain('This consultation has ended and the conversation is now read-only.');
  });
});
