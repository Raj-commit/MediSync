// frontend/src/app/core/video/media-devices.service.spec.ts
import { TestBed } from '@angular/core/testing';

import {
  MEDIA_DEVICES,
  MediaDevicesService,
  MediaDevicesWrapper,
  PEER_CONNECTION_FACTORY,
  PeerConnectionFactory,
} from './media-devices.service';

describe('MediaDevicesService', () => {
  let service: MediaDevicesService;
  let mockMediaDevices: {
    getUserMedia: ReturnType<typeof vi.fn>;
  };
  let mockPeerConnectionFactory: ReturnType<typeof vi.fn>;

  function createMockTrack(kind: 'audio' | 'video', enabled = true) {
    return {
      kind,
      enabled,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
  }

  function createMockStream(audioTracks: MediaStreamTrack[] = [], videoTracks: MediaStreamTrack[] = []) {
    return {
      getTracks: vi.fn(() => [...audioTracks, ...videoTracks]),
      getAudioTracks: vi.fn(() => audioTracks),
      getVideoTracks: vi.fn(() => videoTracks),
    } as unknown as MediaStream;
  }

  beforeEach(() => {
    mockMediaDevices = {
      getUserMedia: vi.fn(),
    };
    mockPeerConnectionFactory = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        MediaDevicesService,
        { provide: MEDIA_DEVICES, useValue: mockMediaDevices },
        { provide: PEER_CONNECTION_FACTORY, useValue: mockPeerConnectionFactory },
      ],
    });

    service = TestBed.inject(MediaDevicesService);
  });

  it('checks if current window context is secure', () => {
    expect(typeof service.isSecureContext()).toBe('boolean');
  });

  it('reports media devices supported when getUserMedia is available', () => {
    expect(service.isMediaDevicesSupported()).toBe(true);
  });

  it('reports media devices not supported when mediaDevices is null', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MediaDevicesService,
        { provide: MEDIA_DEVICES, useValue: null },
        { provide: PEER_CONNECTION_FACTORY, useValue: mockPeerConnectionFactory },
      ],
    });
    const unsuppService = TestBed.inject(MediaDevicesService);
    expect(unsuppService.isMediaDevicesSupported()).toBe(false);
  });

  it('calls getUserMedia with provided constraints', async () => {
    const mockStream = createMockStream();
    mockMediaDevices.getUserMedia.mockResolvedValue(mockStream);

    const stream = await service.getUserMedia({ video: true, audio: true });
    expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(stream).toBe(mockStream);
  });

  it('throws descriptive error if getUserMedia is called when unsupported', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MediaDevicesService,
        { provide: MEDIA_DEVICES, useValue: null },
        { provide: PEER_CONNECTION_FACTORY, useValue: mockPeerConnectionFactory },
      ],
    });
    const unsuppService = TestBed.inject(MediaDevicesService);
    await expect(unsuppService.getUserMedia()).rejects.toThrow(
      'Camera and microphone are not supported in this browser',
    );
  });

  it('creates peer connection via injected factory', () => {
    const mockPc = {} as RTCPeerConnection;
    mockPeerConnectionFactory.mockReturnValue(mockPc);

    const pc = service.createPeerConnection({ iceServers: [] });
    expect(mockPeerConnectionFactory).toHaveBeenCalledWith({ iceServers: [] });
    expect(pc).toBe(mockPc);
  });

  it('stops all tracks in media stream when stopMediaStream is called', () => {
    const audioTrack = createMockTrack('audio');
    const videoTrack = createMockTrack('video');
    const stream = createMockStream([audioTrack], [videoTrack]);

    service.stopMediaStream(stream);

    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(videoTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('toggles audio track state and returns the new value', () => {
    const audioTrack = createMockTrack('audio', true);
    const stream = createMockStream([audioTrack]);

    const result1 = service.toggleAudio(stream);
    expect(result1).toBe(false);
    expect(audioTrack.enabled).toBe(false);

    const result2 = service.toggleAudio(stream);
    expect(result2).toBe(true);
    expect(audioTrack.enabled).toBe(true);

    const result3 = service.toggleAudio(stream, false);
    expect(result3).toBe(false);
    expect(audioTrack.enabled).toBe(false);
  });

  it('toggles video track state and returns the new value', () => {
    const videoTrack = createMockTrack('video', true);
    const stream = createMockStream([], [videoTrack]);

    const result1 = service.toggleVideo(stream);
    expect(result1).toBe(false);
    expect(videoTrack.enabled).toBe(false);

    const result2 = service.toggleVideo(stream, true);
    expect(result2).toBe(true);
    expect(videoTrack.enabled).toBe(true);
  });
});
