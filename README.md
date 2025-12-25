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
| `hasRecording` | `boolean` | Whether there's a recorded video available for download |
| `canRecord` | `boolean` | Whether recording can be started |
| `canCapture` | `boolean` | Whether photo can be captured |
| `canToggleCamera` | `boolean` | Whether camera switching is available |
| `currentCameraType` | `'front' \| 'back' \| 'unknown'` | Type of current camera |

### Methods

| Method | Parameters | Description |
|--------|------------|-------------|
| `startCamera` | `deviceId?: string` | Start camera with optional device ID |
| `stopCamera` | - | Stop camera stream |
| `startRecording` | - | Start video recording |
| `stopRecording` | - | Stop video recording |
| `captureImage` | - | Capture photo from current stream |
| `downloadVideo` | - | Download recorded video |
| `downloadImage` | `imageData` | Download specific captured image |
| `toggleCamera` | - | Switch between available cameras |
| `switchCamera` | `deviceId: string` | Switch to specific camera device |
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