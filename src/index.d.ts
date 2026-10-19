import { MutableRefObject, RefObject } from 'react';

export interface CapturedImage {
  id: number;
  url: string;
  timestamp: string;
  blob: Blob;
}

export type CameraType = 'front' | 'back' | 'unknown';

export type FacingMode = 'user' | 'environment';

export interface UseCameraOptions {
  /**
   * Which camera to open: `'user'` (front) or `'environment'` (back). Sent to
   * `getUserMedia` as `facingMode: { ideal }` so a device without that camera
   * still gets a stream. Ignored when `startCamera` is given a `deviceId`.
   * `toggleCamera` flips it. Defaults to the browser's choice.
   */
  facingMode?: FacingMode;
  /**
   * Whether to request the microphone along with the camera. Defaults to
   * `true` (needed for `startRecording` with sound); pass `false` for photo
   * or scanning use so the browser does not prompt for the microphone.
   */
  audio?: boolean;
  /**
   * Target video bitrate passed to `MediaRecorder` as `videoBitsPerSecond`.
   * Only forwarded when it is a finite positive number. Use it to keep
   * recordings small (e.g. `2_500_000` for ~2.5 Mbps).
   */
  videoBitsPerSecond?: number;
  /**
   * Target audio bitrate passed to `MediaRecorder` as `audioBitsPerSecond`.
   * Only forwarded when it is a finite positive number.
   */
  audioBitsPerSecond?: number;
  /**
   * Candidate container/codec strings, tried in order with
   * `MediaRecorder.isTypeSupported`; the first supported one wins.
   * Replaces the built-in default list when provided and non-empty.
   */
  mimeTypes?: string[];
  /**
   * Shallow-merged over the hook's default `video` constraints (after the
   * mobile overrides) before calling `getUserMedia`.
   */
  videoConstraints?: MediaTrackConstraints;
}

export interface UseCameraReturn {
  videoRef: RefObject<HTMLVideoElement>;
  isStreaming: boolean;
  isRecording: boolean;
  error: string | null;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  recordedChunks: Blob[];
  capturedImages: CapturedImage[];
  recordedVideoUrl: string | null;
  recordedBlob: Blob | null;
  /** Resolved mime type of the current recording; set when recording starts, cleared by `clearRecordedVideo`. */
  recordedMimeType: string | null;
  hasRecording: boolean;
  canRecord: boolean;
  canCapture: boolean;
  canToggleCamera: boolean;
  currentCameraType: CameraType;
  recordedMimeTypeRef: MutableRefObject<string | null>;
  /** Resolves `true` once the stream is playing, `false` on failure (see `error`) or when a later start/stop superseded it. */
  startCamera: (deviceId?: string) => Promise<boolean>;
  stopCamera: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  captureImage: () => Promise<CapturedImage>;
  downloadVideo: () => void;
  downloadImage: (imageData: CapturedImage) => void;
  switchCamera: (deviceId: string) => Promise<boolean>;
  toggleCamera: () => Promise<boolean>;
  getDevices: () => Promise<MediaDeviceInfo[]>;
  clearRecordedVideo: () => void;
}

declare function useCamera(options?: UseCameraOptions): UseCameraReturn;

export default useCamera;
