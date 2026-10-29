// frontend/src/app/core/video/video.models.ts
// Data contracts for FR-11: Video Consultation (UC-07)

export interface OtherParty {
  id: string;
  name: string;
  role: 'patient' | 'doctor';
}

export interface AppointmentVideoSummary {
  id: string;
  status: 'confirmed' | 'completed' | string;
  dateTime: string;
  endTime: string;
  otherParty: OtherParty;
}

export interface VideoSessionSummary {
  startTime: string | null;
  endTime: string | null;
  isExplicitlyEnded: boolean;
}

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface VideoStatusResponse {
  canJoin: boolean;
  reason: string | null;
  appointment: AppointmentVideoSummary;
  session: VideoSessionSummary | null;
  iceServers: RTCIceServerConfig[] | null;
}

// Socket Signaling Payload & Event Contracts

export interface JoinVideoPayload {
  appointmentId: string;
}

export interface JoinVideoSuccessAck {
  success: true;
  appointmentId: string;
  isWaiting: boolean;
  isInitiator: boolean;
  iceServers: RTCIceServerConfig[];
}

export interface JoinVideoErrorAck {
  success: false;
  code: string;
  message: string;
}

export type JoinVideoAck = JoinVideoSuccessAck | JoinVideoErrorAck;

export interface PeerJoinedEvent {
  appointmentId: string;
  peer: OtherParty;
  isInitiator: boolean;
}

export interface PeerLeftEvent {
  appointmentId: string;
  peer: {
    id: string;
    name: string;
  };
}

export interface CallEndedEvent {
  appointmentId: string;
  reason: string;
  message: string;
}

export interface CandidateData {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface RelayCandidatePayload {
  appointmentId: string;
  candidate: CandidateData;
}

export interface ReceiveCandidateEvent {
  appointmentId: string;
  candidate: CandidateData;
  sender: {
    id: string;
    name: string;
  };
}

export interface RelayOfferPayload {
  appointmentId: string;
  type: 'offer';
  sdp: string;
}

export interface ReceiveOfferEvent {
  appointmentId: string;
  offer: {
    type: 'offer';
    sdp: string;
  };
  sender: OtherParty;
}

export interface RelayAnswerPayload {
  appointmentId: string;
  type: 'answer';
  sdp: string;
}

export interface ReceiveAnswerEvent {
  appointmentId: string;
  answer: {
    type: 'answer';
    sdp: string;
  };
  sender: OtherParty;
}

export interface LeaveVideoPayload {
  appointmentId: string;
  isExplicit?: boolean;
}

export interface SignalingAck {
  success: boolean;
  code?: string;
  message?: string;
}
