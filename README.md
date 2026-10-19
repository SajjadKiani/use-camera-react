# use-camera-react

A React hook to control the device camera: start/stop, flip front/back, capture photos, and record short videos with audio.

## Features

- 📸 **Photo Capture** - Capture high-quality images from the camera stream
- 🎥 **Video Recording** - Record videos with audio support
- 🔄 **Camera Switching** - Switch between front and back cameras
- 📱 **Mobile Optimized** - Works seamlessly on iOS, Android, and desktop
- 🎯 **Device Management** - Enumerate and select from available camera devices
- ⚡ **Error Handling** - Comprehensive error handling with user-friendly messages
- 🔧 **Flexible Constraints** - Adaptive video constraints for different devices

## Installation

```bash
npm install use-camera-react
```

## Requirements

- React 18 or higher
- React DOM 18 or higher
- Modern browser with `getUserMedia` support

## Usage

```jsx
import React from 'react';
import useCamera from 'use-camera-react';

function CameraComponent() {
  const {
    videoRef,
    isStreaming,
    isRecording,
    error,
    devices,
    capturedImages,
    recordedVideoUrl,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    captureImage,
    downloadVideo,
    downloadImage,
    toggleCamera,
    canRecord,
    canCapture,
    canToggleCamera,
    currentCameraType
  } = useCamera();

  return (
    <div>
      {error && <div className="error">{error}</div>}
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', maxWidth: '640px' }}
      />
      
      <div>
        <button onClick={isStreaming ? stopCamera : startCamera}>
          {isStreaming ? 'Stop Camera' : 'Start Camera'}
        </button>
        
        <button 
          onClick={captureImage} 
          disabled={!canCapture}
        >
          Capture Photo
        </button>
        
        <button 
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!canRecord}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
        
        <button 
          onClick={toggleCamera}
          disabled={!canToggleCamera}
        >
          Switch Camera ({currentCameraType})
        </button>
      </div>
      
      {capturedImages.length > 0 && (
        <div>
          <h3>Captured Photos</h3>
          {capturedImages.map(image => (
            <div key={image.id}>
              <img src={image.url} alt="Captured" style={{ width: '150px' }} />
              <button onClick={() => downloadImage(image)}>Download</button>
            </div>
          ))}
        </div>
      )}
      
      {recordedVideoUrl && (
        <div>
          <h3>Recorded Video</h3>
          <video src={recordedVideoUrl} controls style={{ width: '100%', maxWidth: '640px' }} />
          <button onClick={downloadVideo}>Download Video</button>
        </div>
      )}
    </div>
  );
}

export default CameraComponent;
```

## Options

`useCamera()` works with no arguments. Pass an options object to control the stream constraints and how `MediaRecorder` encodes the clip:

```jsx
const cam = useCamera({
  facingMode: 'environment',          // open the back camera ('user' = front)
  audio: false,                       // no microphone prompt (photo / scanning)
  videoBitsPerSecond: 2_500_000,      // target video bitrate (bps)
  audioBitsPerSecond: 64_000,         // target audio bitrate (bps)
  mimeTypes: ['video/webm;codecs=vp9', 'video/mp4'], // first supported wins
  videoConstraints: { facingMode: 'user' },          // merged over the defaults
});
```

| Option | Type | Description |
|--------|------|-------------|
| `facingMode` | `'user' \| 'environment'` | Camera to open: front (`user`) or back (`environment`). Requested as `facingMode: { ideal }`, so a device without that camera still streams. `toggleCamera` flips it. Default: browser's choice. |
| `audio` | `boolean` | Request the microphone with the camera. Default `true` (recording with sound). Pass `false` for photo capture or scanning so the browser never prompts for the microphone. |
| `videoBitsPerSecond` | `number` | Passed to `MediaRecorder` as `videoBitsPerSecond`. Only used when it is a finite positive number. |
| `audioBitsPerSecond` | `number` | Passed to `MediaRecorder` as `audioBitsPerSecond`. Only used when it is a finite positive number. |
| `mimeTypes` | `string[]` | Replaces the default candidate list (`video/mp4` → `video/webm` variants). Each entry is checked with `MediaRecorder.isTypeSupported`; the first supported one is used. |
| `videoConstraints` | `MediaTrackConstraints` | Shallow-merged over the hook's default `video` constraints (after the mobile overrides) before `getUserMedia` is called. |

Options are read at call time (when `startCamera` / `startRecording` run), so passing an inline object literal on every render is fine and does not restart the camera.

If a browser rejects the bitrate options in the `MediaRecorder` constructor, the hook retries once with only the mime type, so a bitrate hint never breaks recording on a browser that worked without it. Bitrates are hints: the browser's encoder may not honor them exactly.

### Keep uploads small

To keep a 15-second clip well under 10 MB, cap the bitrate and resolution:

```jsx
const { startRecording, recordedBlob, recordedMimeType } = useCamera({
  videoBitsPerSecond: 2_000_000, // ~2 Mbps → ~3.75 MB for 15 s of video
  audioBitsPerSecond: 64_000,
  videoConstraints: { width: { ideal: 640 }, height: { ideal: 480 } },
});

// After stopRecording():
const file = new File(
  [recordedBlob],
  `selfie.${recordedMimeType?.includes('mp4') ? 'mp4' : 'webm'}`,
  { type: recordedMimeType }
);
```

## API Reference

### Return Values

| Property | Type | Description |
|----------|------|-------------|
| `videoRef` | `RefObject` | Ref to attach to your video element |
| `isStreaming` | `boolean` | Whether camera is currently streaming |
| `isRecording` | `boolean` | Whether currently recording video |
| `error` | `string \| null` | Current error message |
| `devices` | `MediaDeviceInfo[]` | Available camera devices |
| `selectedDeviceId` | `string \| null` | Currently selected camera device ID |
| `capturedImages` | `Array` | Array of captured image objects |
| `recordedVideoUrl` | `string \| null` | URL of recorded video |
| `recordedBlob` | `Blob \| null` | Blob of the recorded video |
| `recordedMimeType` | `string \| null` | Resolved mime type used for the current recording (set when recording starts, cleared by `clearRecordedVideo`) |
| `recordedMimeTypeRef` | `MutableRefObject<string \| null>` | Ref holding the same value, for use in callbacks without re-rendering |
| `hasRecording` | `boolean` | Whether there's a recorded video available for download |
| `canRecord` | `boolean` | Whether recording can be started |
| `canCapture` | `boolean` | Whether photo can be captured |
| `canToggleCamera` | `boolean` | Whether camera switching is available |
| `currentCameraType` | `'front' \| 'back' \| 'unknown'` | Type of current camera |

### Methods

| Method | Parameters | Description |
|--------|------------|-------------|
| `startCamera` | `deviceId?: string` | Start camera with optional device ID. Resolves `true` once the stream is playing, `false` on failure (see `error`) or when a later `startCamera` / `stopCamera` superseded it |
| `stopCamera` | - | Stop camera stream |
| `startRecording` | - | Start video recording |
| `stopRecording` | - | Stop video recording |
| `captureImage` | - | Capture photo from current stream |
| `downloadVideo` | - | Download recorded video |
| `downloadImage` | `imageData` | Download specific captured image |
| `toggleCamera` | - | Switch front ↔ back. When the current camera's facing is known the opposite facing is requested from the browser (which picks that side's main lens); otherwise cycles the enumerated devices. Resolves like `startCamera` |
| `switchCamera` | `deviceId: string` | Switch to specific camera device. Resolves like `startCamera` |
| `getDevices` | - | Refresh list of available devices |
| `clearRecordedVideo` | - | Clear recorded video data |

### Captured Image Object

```typescript
{
  id: number,
  url: string,
  timestamp: string,
  blob: Blob
}
```

## Browser Support

This hook uses the MediaDevices API which is supported in all modern browsers:

- ✅ Chrome 53+
- ✅ Firefox 36+
- ✅ Safari 11+
- ✅ Edge 12+

## Lifecycle guarantees

- `stopCamera()` (or unmounting) while `startCamera()` is still waiting on `getUserMedia` stops that stream the moment it arrives, so a dialog closed quickly never leaves the camera light on.
- Calling `startCamera()` again before the previous call finished supersedes it; only the latest request becomes the live stream.
- `stopCamera()` also stops an in-progress `MediaRecorder`, and each new recording revokes the previous clip's object URL.
- `currentCameraType` is read from the track's `facingMode` setting when the browser reports it, and only falls back to matching device labels when it doesn't.

## Mobile Considerations

The hook includes special handling for mobile devices:

- **iOS**: Uses appropriate video constraints and playsinline attributes
- **Android**: Optimized resolution and frame rates for better performance
- **PWA**: Works in Progressive Web Apps with proper permissions

## Error Handling

The hook provides comprehensive error handling for common scenarios:

- Camera permission denied
- No camera found
- Camera already in use
- Unsupported constraints
- Recording format not supported

## License

MIT © [Saji Kiani](mailto:skm.kiani@gmail.com)

## Repository

[https://github.com/SajjadKiani/use-camera-react](https://github.com/SajjadKiani/use-camera-react)

## Issues

Report issues at: [https://github.com/SajjadKiani/use-camera-react/issues](https://github.com/SajjadKiani/use-camera-react/issues)