import { MutableRefObject, RefObject } from 'react';

export interface CapturedImage {
  id: number;
  url: string;
  timestamp: string;
  blob: Blob;
}

export type CameraType = 'front' | 'back' | 'unknown';

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
  hasRecording: boolean;
  canRecord: boolean;
  canCapture: boolean;
  canToggleCamera: boolean;
  currentCameraType: CameraType;
  recordedMimeTypeRef: MutableRefObject<string | null>;
  startCamera: (deviceId?: string) => Promise<void>;
  stopCamera: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  captureImage: () => Promise<CapturedImage>;
  downloadVideo: () => void;
  downloadImage: (imageData: CapturedImage) => void;
  switchCamera: (deviceId: string) => void;
  toggleCamera: () => void;
  getDevices: () => Promise<MediaDeviceInfo[]>;
  clearRecordedVideo: () => void;
}

declare function useCamera(): UseCameraReturn;

export default useCamera;
