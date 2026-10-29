import { TestBed } from '@angular/core/testing';
import { Socket } from 'socket.io-client';

import { AuthService } from '../auth/auth.service';
import { fakeJwt } from '../auth/testing';
import {
  getSocketServerUrl,
  SOCKET_FACTORY,
  SocketService,
} from './socket.service';

type Listener = (...args: unknown[]) => void;

class MockEmitter {
  private readonly listeners: Record<string, Listener[]> = {};

  on(event: string, listener: Listener): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return this;
  }

  off = vi.fn((event: string, listener: Listener): this => {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
    }
    return this;
  });

  emit(event: string, ...args: unknown[]): boolean {
    const list = this.listeners[event] || [];
    for (const l of list) {
      l(...args);
    }
    return list.length > 0;
  }

  removeAllListeners(): this {
    for (const key of Object.keys(this.listeners)) {
      delete this.listeners[key];
    }
    return this;
  }
}

class MockSocket extends MockEmitter {
  connected = false;
  io = new MockEmitter();

  connect = vi.fn(() => {
    this.connected = true;
    this.emit('connect');
    return this;
  });

  disconnect = vi.fn(() => {
    this.connected = false;
    this.emit('disconnect');
    return this;
  });
}

describe('SocketService', () => {
  let service: SocketService;
  let mockSocket: MockSocket;
  let authServiceStub: { token: () => string | null };

  beforeEach(() => {
    mockSocket = new MockSocket();
    authServiceStub = {
      token: () => fakeJwt(3600),
    };

    TestBed.configureTestingModule({
      providers: [
        SocketService,
        { provide: AuthService, useValue: authServiceStub },
        {
          provide: SOCKET_FACTORY,
          useValue: vi.fn(() => mockSocket as unknown as Socket),
        },
      ],
    });

    service = TestBed.inject(SocketService);
  });

  afterEach(() => {
    service.disconnect();
  });

  it('correctly extracts socket server origin from apiUrl', () => {
    const url = getSocketServerUrl();
    expect(url).toBe('http://localhost:5000');
  });

  it('connects to the server using the active JWT token', () => {
    const socketFactory = TestBed.inject(SOCKET_FACTORY) as ReturnType<typeof vi.fn>;

    service.connect();

    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(socketFactory).toHaveBeenCalledWith(
      'http://localhost:5000',
      expect.objectContaining({
        auth: { token: expect.stringContaining('Bearer ') },
        transports: ['websocket', 'polling'],
      }),
    );
    expect(service.status()).toBe('connecting');
  });

  it('updates status to connected when connect event fires', () => {
    service.connect();
    expect(service.status()).toBe('connecting');

    mockSocket.emit('connect');
    expect(service.status()).toBe('connected');
    expect(service.isConnected()).toBe(true);
  });

  it('updates status to disconnected when disconnect event fires', () => {
    service.connect();
    mockSocket.emit('connect');
    expect(service.status()).toBe('connected');

    mockSocket.emit('disconnect');
    expect(service.status()).toBe('disconnected');
    expect(service.isConnected()).toBe(false);
  });

  it('updates status to reconnecting when connect_error or reconnect_attempt fires', () => {
    service.connect();
    mockSocket.emit('connect');

    mockSocket.emit('connect_error', new Error('Network error'));
    expect(service.status()).toBe('reconnecting');

    mockSocket.io.emit('reconnect_attempt');
    expect(service.status()).toBe('reconnecting');

    mockSocket.io.emit('reconnect');
    expect(service.status()).toBe('connected');
  });

  it('rejects emitWithAck immediately when socket is not connected', async () => {
    await expect(
      service.emitWithAck('test_event', { foo: 'bar' }),
    ).rejects.toEqual(
      expect.objectContaining({
        success: false,
        code: 'NOT_CONNECTED',
      }),
    );
  });

  it('resolves emitWithAck with server acknowledgement payload', async () => {
    service.connect();
    mockSocket.connected = true;

    // Mock emit on mockSocket to simulate server ack response
    mockSocket.emit = vi.fn((event: string, payload: unknown, ack?: (res: unknown) => void) => {
      if (typeof ack === 'function') {
        ack({ success: true, appointmentId: 'appt-123' });
      }
      return true;
    });

    const result = await service.emitWithAck<{ success: boolean; appointmentId: string }>(
      'join_chat',
      { appointmentId: 'appt-123' },
    );

    expect(result).toEqual({ success: true, appointmentId: 'appt-123' });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'join_chat',
      { appointmentId: 'appt-123' },
      expect.any(Function),
    );
  });

  it('receives live stream events through on() observable and unsubscribes cleanly', () => {
    service.connect();

    const received: unknown[] = [];
    const sub = service.on('new_message').subscribe((data) => {
      received.push(data);
    });

    mockSocket.emit('new_message', { content: 'hello' });
    mockSocket.emit('new_message', { content: 'world' });

    expect(received).toEqual([{ content: 'hello' }, { content: 'world' }]);

    sub.unsubscribe();
    expect(mockSocket.off).toHaveBeenCalledWith('new_message', expect.any(Function));
  });

  it('disconnects socket and cleans up all listeners', () => {
    service.connect();
    mockSocket.emit('connect');
    expect(service.status()).toBe('connected');

    service.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(service.status()).toBe('disconnected');
    expect(service.getRawSocket()).toBeNull();
  });
});
