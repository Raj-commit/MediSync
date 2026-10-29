// frontend/src/app/features/video/video.ts
import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { SocketService } from '../../core/sockets/socket.service';
import { MediaDevicesService } from '../../core/video/media-devices.service';
import {
  CallEndedEvent,
  CandidateData,
  JoinVideoAck,
  PeerJoinedEvent,
  PeerLeftEvent,
  ReceiveAnswerEvent,
  ReceiveCandidateEvent,
  ReceiveOfferEvent,
  RTCIceServerConfig,
  VideoStatusResponse,
} from '../../core/video/video.models';
import { VideoService } from '../../core/video/video.service';

export type CallState =
  | 'preview'
  | 'connecting'
  | 'waiting'
  | 'connected'
  | 'reconnecting'
  | 'peer_left'
  | 'ended'
  | 'failed';

export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return '';
  }
}

@Component({
  selector: 'app-video',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './video.html',
  styleUrl: './video.css',
})
export class VideoPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly videoService = inject(VideoService);
  private readonly mediaDevices = inject(MediaDevicesService);
  private readonly socketService = inject(SocketService);
  private readonly auth = inject(AuthService);

  readonly appointmentId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly role = this.auth.role;
  readonly appointmentsPath = computed(() =>
    this.role() === 'doctor' ? '/doctor/appointments' : '/patient/appointments',
  );

  @ViewChild('localPreview') set localPreviewRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    if (ref?.nativeElement && this.localStream()) {
      ref.nativeElement.srcObject = this.localStream();
    }
  }

  @ViewChild('localPipVideo') set localPipVideoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    if (ref?.nativeElement && this.localStream()) {
      ref.nativeElement.srcObject = this.localStream();
    }
  }

  @ViewChild('remoteVideo') set remoteVideoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this._remoteVideoElement = ref?.nativeElement;
    if (this._remoteVideoElement && this.remoteStream()) {
      this._remoteVideoElement.srcObject = this.remoteStream();
    }
  }

  private _remoteVideoElement: HTMLVideoElement | undefined;

  // Pre-call API verification state
  readonly loadingStatus = signal<boolean>(true);
  readonly statusError = signal<string | null>(null);
  readonly statusErrorCode = signal<string | null>(null);
  readonly statusData = signal<VideoStatusResponse | null>(null);

  // Device & browser environment state
  readonly isInsecureContext = signal<boolean>(false);
  readonly isUnsupportedBrowser = signal<boolean>(false);
  readonly requestingDevices = signal<boolean>(false);
  readonly deviceError = signal<string | null>(null);

  // Local media stream & toggles
  readonly localStream = signal<MediaStream | null>(null);
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly isAudioMuted = signal<boolean>(false);
  readonly isVideoOff = signal<boolean>(false);

  // Pre-call vs Call state
  readonly hasJoinedCall = signal<boolean>(false);
  readonly callState = signal<CallState>('preview');
  readonly liveAnnouncement = signal<string>('');
  readonly callErrorMessage = signal<string | null>(null);

  // WebRTC & Socket internal state
  private peerConnection: RTCPeerConnection | null = null;
  private queuedCandidates: CandidateData[] = [];
  private subscriptions: Subscription[] = [];
  private iceServers: RTCIceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  ngOnInit(): void {
    this.checkVideoEligibility();
  }

  ngOnDestroy(): void {
    this.cleanupMedia();
    this.cleanupPeerConnection();
    this.cleanupSocket();
  }

  /**
   * Queries the backend API to verify appointment ownership, status,
   * and the 10-minute early / 60-minute post-appointment window.
   */
  checkVideoEligibility(): void {
    if (!this.appointmentId) {
      this.loadingStatus.set(false);
      this.statusError.set('Invalid appointment ID');
      this.statusErrorCode.set('VALIDATION_ERROR');
      return;
    }

    this.loadingStatus.set(true);
    this.statusError.set(null);
    this.statusErrorCode.set(null);

    this.videoService.getVideoStatus(this.appointmentId).subscribe({
      next: (data) => {
        this.statusData.set(data);
        if (data.iceServers && data.iceServers.length > 0) {
          this.iceServers = data.iceServers;
        }
        this.loadingStatus.set(false);

        if (data.canJoin) {
          this.initializeMediaDevices();
        }
      },
      error: (err) => {
        this.loadingStatus.set(false);
        const status = err.status;
        const code = err.error?.code;
        const msg = err.error?.message;

        if (status === 404) {
          this.statusErrorCode.set('NOT_FOUND');
          this.statusError.set(
            'Appointment not found or you are not authorized to access this video consultation.',
          );
        } else if (status === 403) {
          this.statusErrorCode.set('FORBIDDEN');
          this.statusError.set('Admins cannot access video consultations.');
        } else if (status === 0) {
          this.statusErrorCode.set('NETWORK_ERROR');
          this.statusError.set('Cannot reach the server. Please check your connection.');
        } else {
          this.statusErrorCode.set(code || 'ERROR');
          this.statusError.set(msg || 'Failed to verify appointment video status.');
        }
      },
    });
  }

  /**
   * Checks secure context and browser capability, then requests local camera and microphone.
   */
  async initializeMediaDevices(): Promise<void> {
    if (!this.mediaDevices.isSecureContext()) {
      this.isInsecureContext.set(true);
      return;
    }

    if (!this.mediaDevices.isMediaDevicesSupported()) {
      this.isUnsupportedBrowser.set(true);
      return;
    }

    this.requestingDevices.set(true);
    this.deviceError.set(null);

    try {
      const stream = await this.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      this.localStream.set(stream);
      this.requestingDevices.set(false);
      this.announce('Camera and microphone ready.');
    } catch (err: unknown) {
      this.requestingDevices.set(false);
      const name = (err as { name?: string })?.name || '';

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.deviceError.set(
          'Camera and microphone permission was denied. Please allow camera and microphone access in your browser settings and reload this page.',
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        this.deviceError.set(
          'No camera or microphone found. Please connect your audio/video devices and reload this page.',
        );
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        this.deviceError.set(
          'Your camera or microphone is already in use by another application. Please close other video apps and reload this page.',
        );
      } else {
        this.deviceError.set(
          'Could not access camera and microphone. Please check your browser permissions and reload this page.',
        );
      }
    }
  }

  /**
   * Toggles the microphone on or off.
   */
  toggleAudio(): void {
    const stream = this.localStream();
    if (!stream) return;
    const isUnmuted = this.mediaDevices.toggleAudio(stream);
    const muted = !isUnmuted;
    this.isAudioMuted.set(muted);
    this.announce(muted ? 'Microphone muted.' : 'Microphone unmuted.');
  }

  /**
   * Toggles the camera on or off.
   */
  toggleVideo(): void {
    const stream = this.localStream();
    if (!stream) return;
    const isVideoOn = this.mediaDevices.toggleVideo(stream);
    const turnedOff = !isVideoOn;
    this.isVideoOff.set(turnedOff);
    this.announce(turnedOff ? 'Camera turned off.' : 'Camera turned on.');
  }

  /**
   * Enters the consultation call room from the pre-call preview screen.
   */
  async joinCall(): Promise<void> {
    this.hasJoinedCall.set(true);
    this.callState.set('connecting');
    this.callErrorMessage.set(null);
    this.announce('Connecting to video consultation...');

    try {
      // Connect to Socket.IO server with JWT
      this.socketService.connect();
      this.registerSocketListeners();

      // Emit join_video to backend room video:<appointmentId>
      const ack = await this.socketService.emitWithAck<JoinVideoAck>(
        'join_video',
        { appointmentId: this.appointmentId },
      );

      if (!ack.success) {
        this.callState.set('failed');
        this.callErrorMessage.set(ack.message || 'Failed to join video room.');
        this.announce(this.callErrorMessage()!);
        return;
      }

      if (ack.iceServers && ack.iceServers.length > 0) {
        this.iceServers = ack.iceServers;
      }

      if (ack.isWaiting) {
        // First participant in the room: wait for the doctor / patient to arrive
        this.callState.set('waiting');
        const otherPartyName = this.statusData()?.appointment.otherParty.name || 'the other participant';
        this.announce(`Waiting for ${otherPartyName} to join.`);
      } else if (ack.isInitiator) {
        // Second participant arrived: designated initiator begins WebRTC signaling
        this.callState.set('connecting');
        await this.startInitiatorCall();
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Cannot connect to consultation server.';
      this.callState.set('failed');
      this.callErrorMessage.set(msg);
      this.announce(msg);
    }
  }

  /**
   * Sets up socket listeners for signaling and peer lifecycle events.
   */
  private registerSocketListeners(): void {
    this.cleanupSocket();

    // 1. Peer joined (waiting participant receives this when second arrives)
    this.subscriptions.push(
      this.socketService.on<PeerJoinedEvent>('peer_joined').subscribe({
        next: (event) => {
          if (event.appointmentId === this.appointmentId) {
            this.callState.set('connecting');
            this.announce(`${event.peer.name} has joined. Connecting video...`);
          }
        },
      }),
    );

    // 2. Peer left
    this.subscriptions.push(
      this.socketService.on<PeerLeftEvent>('peer_left').subscribe({
        next: (event) => {
          if (event.appointmentId === this.appointmentId) {
            this.callState.set('peer_left');
            this.announce(`${event.peer.name} has left the consultation.`);
          }
        },
      }),
    );

    // 3. Receive WebRTC Offer (waiting peer receives offer from initiator)
    this.subscriptions.push(
      this.socketService.on<ReceiveOfferEvent>('receive_offer').subscribe({
        next: async (event) => {
          if (event.appointmentId === this.appointmentId) {
            await this.handleReceiveOffer(event);
          }
        },
      }),
    );

    // 4. Receive WebRTC Answer (initiator receives answer from answering peer)
    this.subscriptions.push(
      this.socketService.on<ReceiveAnswerEvent>('receive_answer').subscribe({
        next: async (event) => {
          if (event.appointmentId === this.appointmentId) {
            await this.handleReceiveAnswer(event);
          }
        },
      }),
    );

    // 5. Receive ICE Candidate (both sides exchange candidates)
    this.subscriptions.push(
      this.socketService.on<ReceiveCandidateEvent>('receive_candidate').subscribe({
        next: async (event) => {
          if (event.appointmentId === this.appointmentId) {
            await this.handleReceiveCandidate(event);
          }
        },
      }),
    );

    // 6. Call ended by participant or status changed to completed/cancelled
    this.subscriptions.push(
      this.socketService.on<CallEndedEvent>('call_ended').subscribe({
        next: (event) => {
          if (event.appointmentId === this.appointmentId) {
            this.callState.set('ended');
            this.cleanupPeerConnection();
            this.cleanupMedia();
            this.announce(event.message || 'The consultation has ended.');
          }
        },
      }),
    );
  }

  /**
   * Creates RTCPeerConnection and attaches local audio/video tracks.
   */
  private createPeerConnection(): RTCPeerConnection {
    this.cleanupPeerConnection();

    const pc = this.mediaDevices.createPeerConnection({
      iceServers: this.iceServers,
    });
    this.peerConnection = pc;

    // Attach local media stream tracks
    const stream = this.localStream();
    if (stream) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }

    // Handle remote tracks arrival
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream.set(event.streams[0]);
      } else {
        const current = this.remoteStream() || new MediaStream();
        current.addTrack(event.track);
        this.remoteStream.set(current);
      }
      this.callState.set('connected');
      if (this._remoteVideoElement && this.remoteStream()) {
        this._remoteVideoElement.srcObject = this.remoteStream();
      }
      this.announce('Video connection established.');
    };

    // Handle local ICE candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socketService.emitWithAck('relay_candidate', {
          appointmentId: this.appointmentId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          },
        }).catch(() => {});
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        this.callState.set('connected');
      } else if (state === 'disconnected') {
        this.callState.set('reconnecting');
      } else if (state === 'failed') {
        this.callState.set('failed');
        this.callErrorMessage.set('The video connection failed. Please rejoin.');
      }
    };

    return pc;
  }

  /**
   * Second participant (designated initiator) creates and relays the WebRTC offer.
   */
  private async startInitiatorCall(): Promise<void> {
    try {
      const pc = this.createPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await this.socketService.emitWithAck('relay_offer', {
        appointmentId: this.appointmentId,
        type: 'offer',
        sdp: offer.sdp,
      });
    } catch (err: unknown) {
      this.callState.set('failed');
      const msg = (err as { message?: string })?.message || 'Failed to establish call offer.';
      this.callErrorMessage.set(msg);
    }
  }

  /**
   * Waiting peer receives the WebRTC offer, creates answer, and relays it.
   */
  private async handleReceiveOffer(event: ReceiveOfferEvent): Promise<void> {
    try {
      const pc = this.peerConnection || this.createPeerConnection();

      // Set remote description
      await pc.setRemoteDescription({
        type: event.offer.type,
        sdp: event.offer.sdp,
      });

      // Flush any queued early ICE candidates
      await this.flushQueuedCandidates();

      // Create and relay answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await this.socketService.emitWithAck('relay_answer', {
        appointmentId: this.appointmentId,
        type: 'answer',
        sdp: answer.sdp,
      });
    } catch (err: unknown) {
      this.callState.set('failed');
      const msg = (err as { message?: string })?.message || 'Failed to answer video call.';
      this.callErrorMessage.set(msg);
    }
  }

  /**
   * Initiator receives the WebRTC answer and sets remote description.
   */
  private async handleReceiveAnswer(event: ReceiveAnswerEvent): Promise<void> {
    try {
      const pc = this.peerConnection;
      if (!pc) return;

      await pc.setRemoteDescription({
        type: event.answer.type,
        sdp: event.answer.sdp,
      });

      // Flush any queued early ICE candidates
      await this.flushQueuedCandidates();
    } catch (err: unknown) {
      this.callState.set('failed');
      const msg = (err as { message?: string })?.message || 'Failed to finalize video connection.';
      this.callErrorMessage.set(msg);
    }
  }

  /**
   * Buffers early ICE candidates if remote description is not ready yet,
   * otherwise adds them immediately.
   */
  private async handleReceiveCandidate(event: ReceiveCandidateEvent): Promise<void> {
    const pc = this.peerConnection;
    if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
      // Keep candidate until remote description is set
      this.queuedCandidates.push(event.candidate);
      return;
    }

    try {
      await pc.addIceCandidate(event.candidate);
    } catch {
      // Ignore candidate addition error
    }
  }

  /**
   * Flushes all queued early ICE candidates once remote description is set.
   */
  private async flushQueuedCandidates(): Promise<void> {
    const pc = this.peerConnection;
    if (!pc || !pc.remoteDescription) return;

    const toFlush = [...this.queuedCandidates];
    this.queuedCandidates = [];

    for (const c of toFlush) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        // Ignore candidate addition error
      }
    }
  }

  /**
   * Leaves or explicitly ends the video consultation call.
   */
  async leaveCall(): Promise<void> {
    try {
      if (this.socketService.isConnected()) {
        await this.socketService.emitWithAck('leave_video', {
          appointmentId: this.appointmentId,
          isExplicit: true,
        }).catch(() => {});
      }
    } finally {
      this.callState.set('ended');
      this.cleanupPeerConnection();
      this.cleanupMedia();
      this.cleanupSocket();
      this.announce('You have left the video consultation.');
    }
  }

  /**
   * Releases camera and microphone tracks so hardware indicators turn off.
   */
  cleanupMedia(): void {
    const stream = this.localStream();
    if (stream) {
      this.mediaDevices.stopMediaStream(stream);
      this.localStream.set(null);
    }
    const remote = this.remoteStream();
    if (remote) {
      this.mediaDevices.stopMediaStream(remote);
      this.remoteStream.set(null);
    }
  }

  /**
   * Closes RTCPeerConnection and resets candidate queues.
   */
  private cleanupPeerConnection(clearQueued = false): void {
    if (this.peerConnection) {
      try {
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.close();
      } catch {
        // Ignore close error
      }
      this.peerConnection = null;
    }
    if (clearQueued) {
      this.queuedCandidates = [];
    }
  }

  /**
   * Unsubscribes from socket events and disconnects client.
   */
  private cleanupSocket(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this.socketService.disconnect();
  }

  formatTime(isoString: string): string {
    return formatDateTime(isoString);
  }

  private announce(message: string): void {
    this.liveAnnouncement.set(message);
  }
}
