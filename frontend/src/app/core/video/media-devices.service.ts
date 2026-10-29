// frontend/src/app/core/video/media-devices.service.ts
import { inject, Injectable, InjectionToken } from '@angular/core';

export interface MediaDevicesWrapper {
  getUserMedia(constraints?: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices?(): Promise<MediaDeviceInfo[]>;
}

export const MEDIA_DEVICES = new InjectionToken<MediaDevicesWrapper | null>(
  'MEDIA_DEVICES',
  {
    providedIn: 'root',
    factory: () => (typeof navigator !== 'undefined' ? navigator.mediaDevices : null),
  },
);

export type PeerConnectionFactory = (configuration?: RTCConfiguration) => RTCPeerConnection;

export const PEER_CONNECTION_FACTORY = new InjectionToken<PeerConnectionFactory>(
  'PEER_CONNECTION_FACTORY',
  {
    providedIn: 'root',
    factory: () => {
      if (typeof RTCPeerConnection !== 'undefined') {
        return (config?: RTCConfiguration) => new RTCPeerConnection(config);
      }
      return () => {
        throw new Error('RTCPeerConnection is not supported in this environment');
      };
    },
  },
);

@Injectable({
  providedIn: 'root',
})
export class MediaDevicesService {
  private readonly mediaDevices = inject(MEDIA_DEVICES, { optional: true });
  private readonly peerConnectionFactory = inject(PEER_CONNECTION_FACTORY);

  /**
   * Checks whether the current window context is secure (HTTPS or localhost).
   * Browsers prohibit camera and microphone access on insecure contexts.
   */
  isSecureContext(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return Boolean(window.isSecureContext);
  }

  /**
   * Checks whether the browser supports media devices and getUserMedia.
   */
  isMediaDevicesSupported(): boolean {
    return Boolean(this.mediaDevices && typeof this.mediaDevices.getUserMedia === 'function');
  }

  /**
   * Requests access to camera and microphone.
   */
  async getUserMedia(
    constraints: MediaStreamConstraints = { video: true, audio: true },
  ): Promise<MediaStream> {
    if (!this.isMediaDevicesSupported() || !this.mediaDevices) {
      throw new Error('Camera and microphone are not supported in this browser');
    }
    return this.mediaDevices.getUserMedia(constraints);
  }

  /**
   * Instantiates a new WebRTC RTCPeerConnection using the injected factory.
   */
  createPeerConnection(configuration?: RTCConfiguration): RTCPeerConnection {
    return this.peerConnectionFactory(configuration);
  }

  /**
   * Stops every track in a MediaStream so the camera and microphone hardware
   * indicator lights immediately turn off, and releases device locks.
   */
  stopMediaStream(stream: MediaStream | null): void {
    if (!stream) return;
    try {
      const tracks = stream.getTracks();
      for (const track of tracks) {
        track.stop();
      }
    } catch {
      // Ignore cleanup error if already closed
    }
  }

  /**
   * Toggles or sets the enabled state of all audio tracks in a MediaStream.
   * Returns the new enabled state (true = unmuted, false = muted).
   */
  toggleAudio(stream: MediaStream | null, enabled?: boolean): boolean {
    if (!stream) return false;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return false;

    const targetState = enabled !== undefined ? enabled : !tracks[0].enabled;
    for (const track of tracks) {
      track.enabled = targetState;
    }
    return targetState;
  }

  /**
   * Toggles or sets the enabled state of all video tracks in a MediaStream.
   * Returns the new enabled state (true = video on, false = video off).
   */
  toggleVideo(stream: MediaStream | null, enabled?: boolean): boolean {
    if (!stream) return false;
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) return false;

    const targetState = enabled !== undefined ? enabled : !tracks[0].enabled;
    for (const track of tracks) {
      track.enabled = targetState;
    }
    return targetState;
  }
}
