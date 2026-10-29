import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export type SocketConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface SocketFactory {
  (url: string, opts?: unknown): Socket;
}

export const SOCKET_FACTORY = new InjectionToken<SocketFactory>('SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => io as unknown as SocketFactory,
});

/**
 * Returns the origin server URL without the `/api/v1` path suffix.
 */
export function getSocketServerUrl(): string {
  try {
    return new URL(environment.apiUrl).origin;
  } catch {
    return environment.apiUrl.replace(/\/api\/v1\/?$/, '');
  }
}

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private readonly socketFactory = inject(SOCKET_FACTORY);
  private readonly auth = inject(AuthService);

  private client: Socket | null = null;
  private readonly statusSignal = signal<SocketConnectionStatus>('disconnected');

  readonly status = computed(() => this.statusSignal());
  readonly isConnected = computed(() => this.statusSignal() === 'connected');

  /**
   * Connects to the Socket.IO server with JWT authentication.
   * If already connected with a live client, returns the active instance.
   */
  connect(): Socket {
    if (this.client) {
      if (!this.client.connected && this.statusSignal() === 'disconnected') {
        this.statusSignal.set('connecting');
        this.client.connect();
      }
      return this.client;
    }

    const token = this.auth.token();
    const serverUrl = getSocketServerUrl();

    this.statusSignal.set('connecting');

    this.client = this.socketFactory(serverUrl, {
      auth: {
        token: token ? `Bearer ${token}` : '',
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupListeners(this.client);

    return this.client;
  }

  /**
   * Disconnects and destroys the active socket instance.
   */
  disconnect(): void {
    if (this.client) {
      this.client.removeAllListeners();
      if (this.client.io) {
        this.client.io.removeAllListeners();
      }
      this.client.disconnect();
      this.client = null;
    }
    this.statusSignal.set('disconnected');
  }

  /**
   * Emits a socket event and awaits the server acknowledgement callback.
   * Resolves on server response; rejects on disconnection or timeout.
   */
  emitWithAck<T>(event: string, payload: unknown, timeoutMs = 10000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.client.connected) {
        reject({
          success: false,
          code: 'NOT_CONNECTED',
          message: 'Cannot reach the chat server. Please check your connection.',
        });
        return;
      }

      let hasFinished = false;
      const timer = setTimeout(() => {
        hasFinished = true;
        reject({
          success: false,
          code: 'TIMEOUT',
          message: 'The server took too long to respond. Please try again.',
        });
      }, timeoutMs);

      this.client.emit(event, payload, (response: T) => {
        if (hasFinished) return;
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  /**
   * Listens to incoming socket events as an RxJS Observable.
   * Automatically unregisters the event listener when unsubscribed.
   */
  on<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      if (!this.client) {
        return;
      }

      const handler = (data: T) => {
        subscriber.next(data);
      };

      this.client.on(event, handler);

      return () => {
        this.client?.off(event, handler);
      };
    });
  }

  /**
   * Returns the underlying Socket instance if needed.
   */
  getRawSocket(): Socket | null {
    return this.client;
  }

  private setupListeners(socket: Socket): void {
    socket.on('connect', () => {
      this.statusSignal.set('connected');
    });

    socket.on('disconnect', () => {
      this.statusSignal.set('disconnected');
    });

    socket.on('connect_error', () => {
      this.statusSignal.set('reconnecting');
    });

    if (socket.io) {
      socket.io.on('reconnect_attempt', () => {
        this.statusSignal.set('reconnecting');
      });

      socket.io.on('reconnect', () => {
        this.statusSignal.set('connected');
      });

      socket.io.on('reconnect_failed', () => {
        this.statusSignal.set('disconnected');
      });
    }
  }
}
