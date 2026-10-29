import { CommonModule } from '@angular/common';
import {
  Component,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import {
  ChatMessage,
  JoinChatAck,
  NewMessageBroadcast,
  SendMessageAck,
} from '../../core/chat/chat.models';
import { ChatService } from '../../core/chat/chat.service';
import { SocketService } from '../../core/sockets/socket.service';

function formatMessageTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

function formatMessageDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chatService = inject(ChatService);
  private readonly socketService = inject(SocketService);
  private readonly auth = inject(AuthService);

  readonly appointmentId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly currentUser = this.auth.user;
  readonly role = this.auth.role;

  // History & message state
  readonly messages = signal<ChatMessage[]>([]);
  readonly hasMore = signal<boolean>(false);
  readonly loadingHistory = signal<boolean>(false);
  readonly loadingEarlier = signal<boolean>(false);
  readonly historyError = signal<string | null>(null);

  // Real-time sending state
  readonly text = signal<string>('');
  readonly sending = signal<boolean>(false);
  readonly sendError = signal<string | null>(null);
  readonly chatClosed = signal<boolean>(false);

  // Scroll & badge state
  readonly isNearBottom = signal<boolean>(true);
  readonly unreadBelow = signal<boolean>(false);

  // Connection status from SocketService
  readonly connectionStatus = this.socketService.status;

  private newMessageSub: Subscription | null = null;
  private wasDisconnected = false;

  constructor() {
    // Monitor connection transitions to re-join and catch up on missed messages
    effect(() => {
      const status = this.connectionStatus();
      if (status === 'reconnecting' || status === 'disconnected') {
        this.wasDisconnected = true;
      } else if (status === 'connected' && this.wasDisconnected) {
        this.wasDisconnected = false;
        this.handleReconnect();
      }
    });
  }

  ngOnInit(): void {
    if (!this.appointmentId) {
      this.historyError.set('Invalid appointment reference');
      return;
    }

    this.loadInitialHistory();
    this.initSocket();
  }

  ngOnDestroy(): void {
    if (this.newMessageSub) {
      this.newMessageSub.unsubscribe();
      this.newMessageSub = null;
    }
    this.socketService.disconnect();
  }

  loadInitialHistory(): void {
    this.loadingHistory.set(true);
    this.historyError.set(null);

    this.chatService.getHistory(this.appointmentId, { limit: 50 }).subscribe({
      next: (res) => {
        this.loadingHistory.set(false);
        this.messages.set(res.messages);
        this.hasMore.set(res.hasMore);
        this.scrollToBottom();
      },
      error: (err) => {
        this.loadingHistory.set(false);
        this.handleHistoryError(err);
      },
    });
  }

  loadEarlierMessages(): void {
    if (this.loadingEarlier() || !this.hasMore() || this.messages().length === 0) {
      return;
    }

    const earliestSeq = this.messages()[0].seq;
    this.loadingEarlier.set(true);

    this.chatService
      .getHistory(this.appointmentId, { limit: 50, beforeSeq: earliestSeq })
      .subscribe({
        next: (res) => {
          this.loadingEarlier.set(false);
          this.hasMore.set(res.hasMore);

          // Prepend earlier messages, de-duplicating by seq
          const current = this.messages();
          const existingSeqs = new Set(current.map((m) => m.seq));
          const newEarlier = res.messages.filter((m) => !existingSeqs.has(m.seq));

          this.messages.set([...newEarlier, ...current]);
        },
        error: (err) => {
          this.loadingEarlier.set(false);
          this.handleHistoryError(err);
        },
      });
  }

  async sendMessage(): Promise<void> {
    const raw = this.text();
    const trimmed = raw.trim();

    if (!trimmed || this.sending() || this.chatClosed()) {
      return;
    }

    if (trimmed.length > 1000) {
      this.sendError.set('Message content must be at most 1000 characters');
      return;
    }

    this.sending.set(true);
    this.sendError.set(null);

    try {
      const ack = await this.socketService.emitWithAck<SendMessageAck>(
        'send_message',
        {
          appointmentId: this.appointmentId,
          content: trimmed,
        },
      );

      this.sending.set(false);

      if (ack.success) {
        // Clear message box on successful transmission
        this.text.set('');
        this.appendMessages([ack.message]);
        this.scrollToBottom();
      } else {
        // Keep user text intact on error
        if (ack.code === 'CHAT_CLOSED') {
          this.chatClosed.set(true);
        }
        this.sendError.set(ack.message || 'Failed to send message');
      }
    } catch (err: any) {
      this.sending.set(false);
      this.sendError.set(
        err.message || 'Cannot reach the chat server. Please check your connection.',
      );
    }
  }

  onTextInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.text.set(target.value);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (!el) return;
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    this.isNearBottom.set(isBottom);
    if (isBottom) {
      this.unreadBelow.set(false);
    }
  }

  jumpToBottom(): void {
    this.scrollToBottom();
    this.unreadBelow.set(false);
  }

  isOwnMessage(msg: ChatMessage): boolean {
    const currentUserId = this.currentUser()?.id;
    return Boolean(currentUserId && msg.sender.id === currentUserId);
  }

  backPath(): string {
    const r = this.auth.role();
    if (r === 'doctor') return '/doctor/appointments';
    if (r === 'patient') return '/patient/appointments';
    return '/login';
  }

  statusLabel(): string {
    switch (this.connectionStatus()) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  }

  formatTime(iso: string): string {
    return formatMessageTime(iso);
  }

  formatDate(iso: string): string {
    return formatMessageDate(iso);
  }

  scrollToBottom(): void {
    setTimeout(() => {
      const el = document.getElementById('chat-messages-container');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 0);
  }

  private initSocket(): void {
    this.socketService.connect();

    this.newMessageSub = this.socketService
      .on<NewMessageBroadcast>('new_message')
      .subscribe((data) => {
        if (data.appointmentId === this.appointmentId) {
          this.appendMessages([data.message]);
        }
      });

    this.socketService
      .emitWithAck<JoinChatAck>('join_chat', {
        appointmentId: this.appointmentId,
      })
      .then((ack) => {
        if (!ack.success) {
          if (ack.code === 'CHAT_CLOSED') {
            this.chatClosed.set(true);
          } else {
            this.historyError.set(ack.message || 'Failed to join consultation chat');
          }
        }
      })
      .catch(() => {
        // Connection issues handled by connectionStatus signal
      });
  }

  private handleReconnect(): void {
    // Re-join the appointment room
    this.socketService
      .emitWithAck<JoinChatAck>('join_chat', {
        appointmentId: this.appointmentId,
      })
      .catch(() => {});

    // Catch up on any messages missed during the disconnected window
    const current = this.messages();
    if (current.length > 0) {
      const maxSeq = Math.max(...current.map((m) => m.seq));
      this.chatService
        .getHistory(this.appointmentId, { afterSeq: maxSeq })
        .subscribe({
          next: (res) => {
            if (res.messages.length > 0) {
              this.appendMessages(res.messages);
            }
          },
          error: () => {},
        });
    }
  }

  private appendMessages(newMsgs: ChatMessage[]): void {
    const current = this.messages();
    const existingSeqs = new Set(current.map((m) => m.seq));
    const toAdd = newMsgs.filter((m) => !existingSeqs.has(m.seq));

    if (toAdd.length === 0) {
      return;
    }

    const updated = [...current, ...toAdd].sort((a, b) => a.seq - b.seq);
    this.messages.set(updated);

    if (this.isNearBottom()) {
      this.scrollToBottom();
    } else {
      this.unreadBelow.set(true);
    }
  }

  private handleHistoryError(err: any): void {
    if (err.status === 0) {
      this.historyError.set('Cannot reach the server. Please try again.');
    } else if (err.status === 404) {
      this.historyError.set(
        'Appointment not found or consultation chat is not available for this appointment.',
      );
    } else if (err.status === 403) {
      this.historyError.set(
        err.error?.message || 'You do not have permission to access this chat.',
      );
    } else {
      this.historyError.set(
        err.error?.message || 'Failed to load chat messages. Please try again.',
      );
    }
  }
}
