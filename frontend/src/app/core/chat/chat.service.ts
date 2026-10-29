import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ChatHistoryQuery, ChatHistoryResponse } from './chat.models';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  /**
   * Fetches paginated chat message history for an appointment.
   */
  getHistory(
    appointmentId: string,
    query?: ChatHistoryQuery,
  ): Observable<ChatHistoryResponse> {
    let params = new HttpParams();

    if (query?.limit !== undefined) {
      params = params.set('limit', query.limit.toString());
    }
    if (query?.beforeSeq !== undefined) {
      params = params.set('beforeSeq', query.beforeSeq.toString());
    }
    if (query?.afterSeq !== undefined) {
      params = params.set('afterSeq', query.afterSeq.toString());
    }

    return this.http.get<ChatHistoryResponse>(
      `${this.baseUrl}/appointments/${appointmentId}/messages`,
      { params },
    );
  }
}
