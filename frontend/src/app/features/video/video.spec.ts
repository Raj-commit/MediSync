// frontend/src/app/features/video/video.spec.ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { fakeJwt } from '../../core/auth/testing';
import { MediaDevicesService } from '../../core/video/media-devices.service';
import { VideoStatusResponse } from '../../core/video/video.models';
import { VideoService } from '../../core/video/video.service';
import { VideoPage } from './video';

describe('VideoPage (Pre-call Setup & Preview)', () => {
  let component: VideoPage;
  let fixture: ComponentFixture<VideoPage>;
  let mockVideoService: {
    getVideoStatus: ReturnType<typeof vi.fn>;
  };
  let mockMediaDevicesService: {
    isSecureContext: ReturnType<typeof vi.fn>;
    isMediaDevicesSupported: ReturnType<typeof vi.fn>;
    getUserMedia: ReturnType<typeof vi.fn>;
    stopMediaStream: ReturnType<typeof vi.fn>;
    toggleAudio: ReturnType<typeof vi.fn>;
    toggleVideo: ReturnType<typeof vi.fn>;
  };
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
    mockVideoService = {
      getVideoStatus: vi.fn().mockReturnValue(of(mockSuccessResponse)),
    };

    mockMediaDevicesService = {
      isSecureContext: vi.fn().mockReturnValue(true),
      isMediaDevicesSupported: vi.fn().mockReturnValue(true),
      getUserMedia: vi.fn().mockResolvedValue(createMockStream()),
      stopMediaStream: vi.fn(),
      toggleAudio: vi.fn().mockReturnValue(false),
      toggleVideo: vi.fn().mockReturnValue(false),
    };

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
      throwError(() => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Admins cannot access' } })),
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

  it('stops media stream tracks on component destruction to release hardware', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const stream = component.localStream();
    expect(stream).toBeTruthy();

    fixture.destroy();
    expect(mockMediaDevicesService.stopMediaStream).toHaveBeenCalledWith(stream);
  });

  it('transitions hasJoinedCall to true when Join call is clicked', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.hasJoinedCall()).toBe(false);

    component.joinCall();
    expect(component.hasJoinedCall()).toBe(true);

    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Connecting to consultation room...');
  });
});
