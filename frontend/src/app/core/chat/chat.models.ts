export interface ChatSender {
  id: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  appointment: string;
  seq: number;
  sender: ChatSender;
  content: string;
  timestamp: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface ChatHistoryQuery {
  limit?: number;
  beforeSeq?: number;
  afterSeq?: number;
}

export type JoinChatAck =
  | { success: true; appointmentId: string }
  | { success: false; code: string; message: string };

export type SendMessageAck =
  | { success: true; message: ChatMessage }
  | { success: false; code: string; message: string };

export interface NewMessageBroadcast {
  appointmentId: string;
  message: ChatMessage;
}
