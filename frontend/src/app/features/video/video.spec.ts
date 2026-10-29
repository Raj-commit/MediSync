// frontend/src/app/features/video/video.spec.ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { fakeJwt } from '../../core/auth/testing';
import { SocketService } from '../../core/sockets/socket.service';
import { MediaDevicesService } from '../../core/video/media-devices.service';
import { VideoStatusResponse } from '../../core/video/video.models';
import { VideoService } from '../../core/video/video.service';
import { VideoPage } from './video';

class MockSocketService {
  connect = vi.fn();
  disconnect = vi.fn();
  isConnected = vi.fn().mockReturnValue(true);
  status = signal('connected');
  emitWithAck = vi.fn().mockResolvedValue({ success: true });

  private handlers: Record<string, ((data: unknown) => void)[]> = {};

  on<T>(event: string): Observable<T> {
    return new Observable<T>((sub) => {
      if (!this.handlers[event]) {
        this.handlers[event] = [];
      }
      const handler = (data: unknown) => sub.next(data as T);
      this.handlers[event].push(handler);
      return () => {
        this.handlers[event] = this.handlers[event].filter((h) => h !== handler);
      };
    });
  }

  trigger(event: string, payload: unknown) {
    const list = this.handlers[event] || [];
    for (const h of list) {
      h(payload);
    }
  }
}

class MockRTCPeerConnection {
  connectionState = 'new';
  remoteDescription: { type: string; sdp: string } | null = null;
  localDescription: { type: string; sdp: string } | null = null;
  onicecandidate: ((ev: unknown) => void) | null = null;
  ontrack: ((ev: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  addTrack = vi.fn();
  createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'fake-offer-sdp' });
  createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'fake-answer-sdp' });
  setLocalDescription = vi.fn().mockImplementation((desc) => {
    this.localDescription = desc;
    return Promise.resolve();
  });
  setRemoteDescription = vi.fn().mockImplementation((desc) => {
    this.remoteDescription = desc;
    return Promise.resolve();
  });
  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  close = vi.fn();
}

describe('VideoPage (Pre-call Setup, Signaling, and Live Consultation)', () => {
  let component: VideoPage;
  let fixture: ComponentFixture<VideoPage>;
  let mockVideoService: {
    getVideoStatus: ReturnType<typeof vi.fn>;
  };
  let mockMediaDevicesService: {
    isSecureContext: ReturnType<typeof vi.fn>;
    isMediaDevicesSupported: ReturnType<typeof vi.fn>;
    getUserMedia: ReturnType<typeof vi.fn>;
    createPeerConnection: ReturnType<typeof vi.fn>;
    stopMediaStream: ReturnType<typeof vi.fn>;
    toggleAudio: ReturnType<typeof vi.fn>;
    toggleVideo: ReturnType<typeof vi.fn>;
  };
  let mockSocketService: MockSocketService;
  let mockPc: MockRTCPeerConnection;
  let authServiceStub: {
    user: ReturnType<typeof vi.fn>;
    role: ReturnType<typeof vi.fn>;
    token: ReturnType<typeof vi.fn>;
  };

  const mockSuccessResponse: VideoStatusResponse = {
    canJoin: true,
    reason: null,
    appointment: {
      id: 'appt-100',
      status: 'confirmed',
      dateTime: '2026-10-29T10:00:00.000Z',
      endTime: '2026-10-29T10:30:00.000Z',
      otherParty: {
        id: 'doc-200',
        name: 'Dr. Jane Smith',
        role: 'doctor',
      },
    },
    session: null,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  function createMockTrack(kind: 'audio' | 'video', enabled = true) {
    return {
      kind,
      enabled,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
  }

  function createMockStream() {
    const audioTrack = createMockTrack('audio');
    const videoTrack = createMockTrack('video');
    return {
      getTracks: vi.fn(() => [audioTrack, videoTrack]),
      getAudioTracks: vi.fn(() => [audioTrack]),
      getVideoTracks: vi.fn(() => [videoTrack]),
    } as unknown as MediaStream;
  }

  beforeEach(async () => {
    mockPc = new MockRTCPeerConnection();
    mockVideoService = {
      getVideoStatus: vi.fn().mockReturnValue(of(mockSuccessResponse)),
    };

    mockMediaDevicesService = {
      isSecureContext: vi.fn().mockReturnValue(true),
      isMediaDevicesSupported: vi.fn().mockReturnValue(true),
      getUserMedia: vi.fn().mockResolvedValue(createMockStream()),
      createPeerConnection: vi.fn().mockReturnValue(mockPc),
      stopMediaStream: vi.fn(),
      toggleAudio: vi.fn().mockReturnValue(false),
      toggleVideo: vi.fn().mockReturnValue(false),
    };

    mockSocketService = new MockSocketService();

    authServiceStub = {
      user: vi.fn().mockReturnValue({ id: 'user-1', name: 'John Patient', role: 'patient' }),
      role: vi.fn().mockReturnValue('patient'),
      token: vi.fn().mockReturnValue(fakeJwt(3600)),
    };

    await TestBed.configureTestingModule({
      imports: [VideoPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: VideoService, useValue: mockVideoService },
        { provide: MediaDevicesService, useValue: mockMediaDevicesService },
        { provide: SocketService, useValue: mockSocketService },
        { provide: AuthService, useValue: authServiceStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? 'appt-100' : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoPage);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.cleanupMedia();
  });

  it('verifies appointment status and requests media devices on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockVideoService.getVideoStatus).toHaveBeenCalledWith('appt-100');
    expect(mockMediaDevicesService.getUserMedia).toHaveBeenCalledWith({
      video: true,
      audio: true,
    });
    expect(component.statusData()).toEqual(mockSuccessResponse);
    expect(component.localStream()).toBeTruthy();
  });

  it('renders pre-call camera preview and appointment metadata when canJoin is true', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Ready to join your consultation?');
    expect(element.textContent).toContain('Dr. Jane Smith');

    const joinBtn = element.querySelector('.button-primary');
    expect(joinBtn).toBeTruthy();
    expect(joinBtn?.textContent?.trim()).toBe('Join call');
  });

  it('displays reason banner and back link when API returns canJoin: false', async () => {
    const mockCannotJoinResponse: VideoStatusResponse = {
      ...mockSuccessResponse,
      canJoin: false,
      reason: 'Video consultation can be joined starting 10 minutes before the appointment time',
    };
    mockVideoService.getVideoStatus.mockReturnValue(of(mockCannotJoinResponse));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Consultation Not Available');
    expect(element.textContent).toContain(
      'Video consultation can be joined starting 10 minutes before the appointment time',
    );
    expect(mockMediaDevicesService.getUserMedia).not.toHaveBeenCalled();
  });

  it('renders Not Found state when API returns 404', async () => {
    mockVideoService.getVideoStatus.mockReturnValue(
      throwError(() => ({ status: 404, error: { code: 'NOT_FOUND', message: 'Not found' } })),
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Appointment Not Found');
    expect(element.textContent).toContain(
      'Appointment not found or you are not authorized to access this video consultation.',
    );
  });

  it('renders Access Denied state when API returns 403', async () => {
    mockVideoService.getVideoStatus.mockReturnValue(
      throwError(() => ({
        status: 403,
        error: { code: 'FORBIDDEN', message: 'Admins cannot access' },
      })),
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Access Denied');
    expect(element.textContent).toContain('Admins cannot access video consultations.');
  });

  it('warns when the current page context is not secure (insecure HTTP)', async () => {
    mockMediaDevicesService.isSecureContext.mockReturnValue(false);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Secure Connection Required');
    expect(mockMediaDevicesService.getUserMedia).not.toHaveBeenCalled();
  });

  it('shows clear instructions when camera or microphone permission is denied', async () => {
    const permError = new Error('Permission denied');
    permError.name = 'NotAllowedError';
    mockMediaDevicesService.getUserMedia.mockRejectedValue(permError);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Camera or Microphone Problem');
    expect(element.textContent).toContain('permission was denied');
  });

  it('toggles microphone mute state when Mute button is clicked', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isAudioMuted()).toBe(false);

    component.toggleAudio();
    expect(mockMediaDevicesService.toggleAudio).toHaveBeenCalled();
    expect(component.isAudioMuted()).toBe(true);

    mockMediaDevicesService.toggleAudio.mockReturnValue(true);
    component.toggleAudio();
    expect(component.isAudioMuted()).toBe(false);
  });

  it('toggles camera off state when Camera button is clicked', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isVideoOff()).toBe(false);

    component.toggleVideo();
    expect(mockMediaDevicesService.toggleVideo).toHaveBeenCalled();
    expect(component.isVideoOff()).toBe(true);
  });

  it('enters waiting state when joining as the first participant (isWaiting: true)', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: true,
      isInitiator: false,
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    await component.joinCall();

    expect(mockSocketService.connect).toHaveBeenCalled();
    expect(mockSocketService.emitWithAck).toHaveBeenCalledWith('join_video', {
      appointmentId: 'appt-100',
    });
    expect(component.hasJoinedCall()).toBe(true);
    expect(component.callState()).toBe('waiting');

    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Waiting for the other participant to join...');
  });

  it('initiates WebRTC offer when designated as initiator (isInitiator: true)', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    await component.joinCall();

    expect(mockMediaDevicesService.createPeerConnection).toHaveBeenCalled();
    expect(mockPc.addTrack).toHaveBeenCalled();
    expect(mockPc.createOffer).toHaveBeenCalled();
    expect(mockPc.setLocalDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'fake-offer-sdp',
    });
    expect(mockSocketService.emitWithAck).toHaveBeenCalledWith('relay_offer', {
      appointmentId: 'appt-100',
      type: 'offer',
      sdp: 'fake-offer-sdp',
    });
  });

  it('handles peer_joined event by updating status to connecting', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: true,
      isInitiator: false,
      iceServers: [],
    });

    await component.joinCall();
    expect(component.callState()).toBe('waiting');

    mockSocketService.trigger('peer_joined', {
      appointmentId: 'appt-100',
      peer: { id: 'doc-200', name: 'Dr. Jane Smith', role: 'doctor' },
      isInitiator: false,
    });

    expect(component.callState()).toBe('connecting');
  });

  it('answers incoming offer: sets remote description, flushes queued candidates, and sends relay_answer', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: true,
      isInitiator: false,
      iceServers: [],
    });

    await component.joinCall();

    // 1. Candidate arrives early before remote description is set
    mockSocketService.trigger('receive_candidate', {
      appointmentId: 'appt-100',
      candidate: { candidate: 'cand-early', sdpMid: '0', sdpMLineIndex: 0 },
      sender: { id: 'doc-200', name: 'Dr. Jane Smith' },
    });
    expect(mockPc.addIceCandidate).not.toHaveBeenCalled();

    // 2. Offer arrives
    mockSocketService.trigger('receive_offer', {
      appointmentId: 'appt-100',
      offer: { type: 'offer', sdp: 'remote-offer-sdp' },
      sender: { id: 'doc-200', name: 'Dr. Jane Smith', role: 'doctor' },
    });

    // Wait for async handler to resolve
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    expect(mockPc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'remote-offer-sdp',
    });
    // Early candidate flushed
    expect(mockPc.addIceCandidate).toHaveBeenCalledWith({
      candidate: 'cand-early',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });
    expect(mockPc.createAnswer).toHaveBeenCalled();
    expect(mockPc.setLocalDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'fake-answer-sdp',
    });
    expect(mockSocketService.emitWithAck).toHaveBeenCalledWith('relay_answer', {
      appointmentId: 'appt-100',
      type: 'answer',
      sdp: 'fake-answer-sdp',
    });
  });

  it('initiator processes receive_answer and sets remote description', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    await component.joinCall();

    mockSocketService.trigger('receive_answer', {
      appointmentId: 'appt-100',
      answer: { type: 'answer', sdp: 'remote-answer-sdp' },
      sender: { id: 'user-2', name: 'Patient', role: 'patient' },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    expect(mockPc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'remote-answer-sdp',
    });
  });

  it('immediately applies ICE candidate if remote description is already present', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    await component.joinCall();
    mockPc.remoteDescription = { type: 'answer', sdp: 'sdp' };

    mockSocketService.trigger('receive_candidate', {
      appointmentId: 'appt-100',
      candidate: { candidate: 'cand-ready', sdpMid: '0', sdpMLineIndex: 0 },
      sender: { id: 'user-2', name: 'Patient' },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    expect(mockPc.addIceCandidate).toHaveBeenCalledWith({
      candidate: 'cand-ready',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });
  });

  it('relays local ICE candidates when pc.onicecandidate fires', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    await component.joinCall();

    expect(mockPc.onicecandidate).toBeTruthy();
    mockPc.onicecandidate!({
      candidate: {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
        usernameFragment: 'ufrag',
      },
    });

    expect(mockSocketService.emitWithAck).toHaveBeenCalledWith('relay_candidate', {
      appointmentId: 'appt-100',
      candidate: {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
        usernameFragment: 'ufrag',
      },
    });
  });

  it('binds remote stream and updates state to connected when ontrack fires', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    await component.joinCall();

    const remoteStream = createMockStream();
    mockPc.ontrack!({
      streams: [remoteStream],
      track: createMockTrack('video'),
    });

    expect(component.remoteStream()).toBe(remoteStream);
    expect(component.callState()).toBe('connected');
  });

  it('updates state to peer_left when peer_left event is received', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    await component.joinCall();

    mockSocketService.trigger('peer_left', {
      appointmentId: 'appt-100',
      peer: { id: 'doc-200', name: 'Dr. Jane Smith' },
    });

    expect(component.callState()).toBe('peer_left');
  });

  it('handles call_ended event: closes connection and releases media devices', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    await component.joinCall();

    mockSocketService.trigger('call_ended', {
      appointmentId: 'appt-100',
      reason: 'call_ended',
      message: 'The consultation has ended',
    });

    expect(component.callState()).toBe('ended');
    expect(mockPc.close).toHaveBeenCalled();
    expect(mockMediaDevicesService.stopMediaStream).toHaveBeenCalled();
  });

  it('displays connection failure if join_video ack returns success: false (e.g. ROOM_FULL)', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: false,
      code: 'ROOM_FULL',
      message: 'Video consultation room is full',
    });

    await component.joinCall();

    expect(component.callState()).toBe('failed');
    expect(component.callErrorMessage()).toBe('Video consultation room is full');

    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Connection Problem');
    expect(element.textContent).toContain('Video consultation room is full');
  });

  it('leaves call cleanly, stopping tracks and emitting leave_video with isExplicit: true', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    await component.joinCall();

    await component.leaveCall();

    expect(mockSocketService.emitWithAck).toHaveBeenCalledWith('leave_video', {
      appointmentId: 'appt-100',
      isExplicit: true,
    });
    expect(mockPc.close).toHaveBeenCalled();
    expect(mockMediaDevicesService.stopMediaStream).toHaveBeenCalled();
    expect(component.callState()).toBe('ended');
  });
  it('handles socket reconnection: transitions to reconnecting and re-joins room', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    await component.joinCall();
    const remoteStream = createMockStream();
    mockPc.ontrack!({ streams: [remoteStream], track: createMockTrack('video') });
    expect(component.callState()).toBe('connected');

    // Socket drops connection
    mockSocketService.status.set('reconnecting');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.callState()).toBe('reconnecting');

    // Socket reconnects
    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    mockSocketService.status.set('connected');
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockSocketService.emitWithAck).toHaveBeenCalledWith('join_video', {
      appointmentId: 'appt-100',
    });
  });

  it('cleans up media and peer connection on beforeunload and ngOnDestroy', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockSocketService.emitWithAck.mockResolvedValueOnce({
      success: true,
      appointmentId: 'appt-100',
      isWaiting: false,
      isInitiator: true,
      iceServers: [],
    });

    await component.joinCall();

    component.onBeforeUnload();
    expect(mockPc.close).toHaveBeenCalled();
    expect(mockMediaDevicesService.stopMediaStream).toHaveBeenCalled();

    fixture.destroy();
    expect(mockMediaDevicesService.stopMediaStream).toHaveBeenCalled();
  });

  it('does not render ICE server hostnames or secrets in the DOM', async () => {
    mockVideoService.getVideoStatus.mockReturnValue(
      of({
        ...mockSuccessResponse,
        iceServers: [{ urls: 'stun:super-secret-turn.example.com:3478' }],
      }),
    );

    fixture.detectChanges();
    await fixture.whenStable();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).not.toContain('super-secret-turn.example.com');
    expect(element.textContent).not.toContain('3478');
  });
});
