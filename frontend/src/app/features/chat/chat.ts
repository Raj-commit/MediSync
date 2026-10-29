import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ChatMessage } from '../../core/chat/chat.models';
import { ChatService } from '../../core/chat/chat.service';

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
export class ChatPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chatService = inject(ChatService);
  private readonly auth = inject(AuthService);

  readonly appointmentId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly currentUser = this.auth.user;
  readonly role = this.auth.role;

  readonly messages = signal<ChatMessage[]>([]);
  readonly hasMore = signal<boolean>(false);
  readonly loadingHistory = signal<boolean>(false);
  readonly loadingEarlier = signal<boolean>(false);
  readonly historyError = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.appointmentId) {
      this.historyError.set('Invalid appointment reference');
      return;
    }
    this.loadInitialHistory();
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
        this.handleError(err);
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
          this.handleError(err);
        },
      });
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

  private handleError(err: any): void {
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
