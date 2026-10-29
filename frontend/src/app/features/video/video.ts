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
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { MediaDevicesService } from '../../core/video/media-devices.service';
import { VideoStatusResponse } from '../../core/video/video.models';
import { VideoService } from '../../core/video/video.service';

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
  private readonly videoService = inject(VideoService);
  private readonly mediaDevices = inject(MediaDevicesService);
  private readonly auth = inject(AuthService);

  readonly appointmentId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly role = this.auth.role;
  readonly appointmentsPath = computed(() =>
    this.role() === 'doctor' ? '/doctor/appointments' : '/patient/appointments',
  );

  @ViewChild('localPreview') set localPreviewRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    if (ref && ref.nativeElement && this.localStream()) {
      ref.nativeElement.srcObject = this.localStream();
    }
  }

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
  readonly isAudioMuted = signal<boolean>(false);
  readonly isVideoOff = signal<boolean>(false);

  // Pre-call vs Call state (Choice b)
  readonly hasJoinedCall = signal<boolean>(false);
  readonly liveAnnouncement = signal<string>('');

  ngOnInit(): void {
    this.checkVideoEligibility();
  }

  ngOnDestroy(): void {
    this.cleanupMedia();
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
  joinCall(): void {
    this.hasJoinedCall.set(true);
    this.announce('Joining video consultation...');
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
  }

  formatTime(isoString: string): string {
    return formatDateTime(isoString);
  }

  private announce(message: string): void {
    this.liveAnnouncement.set(message);
  }
}
