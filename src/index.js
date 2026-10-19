import { useState, useRef, useCallback, useEffect } from 'react';

const DEFAULT_MIME_TYPES = [
  'video/mp4',
  'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm; codecs="vp8, opus"',
  'video/webm',
];

const FRONT_LABEL_KEYWORDS = ['front', 'user', 'facing user', 'selfie'];
const BACK_LABEL_KEYWORDS = ['back', 'rear', 'environment', 'facing environment'];

const isPositiveFinite = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isMobileUA = () =>
  typeof navigator !== 'undefined' &&
  /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// 'user' | 'environment' | null from any facingMode-ish value (string or
// constraint object), so both the option and a track's settings can feed it.
const normalizeFacing = (value) => {
  const raw = value && typeof value === 'object' ? (value.exact ?? value.ideal) : value;
  if (raw === 'user' || raw === 'environment') return raw;
  return null;
};

const facingToType = (facing) =>
  facing === 'user' ? 'front' : facing === 'environment' ? 'back' : 'unknown';

const labelToType = (label) => {
  const lower = (label || '').toLowerCase();
  if (!lower) return 'unknown';
  if (FRONT_LABEL_KEYWORDS.some((k) => lower.includes(k))) return 'front';
  if (BACK_LABEL_KEYWORDS.some((k) => lower.includes(k))) return 'back';
  return 'unknown';
};

const stopStream = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
};

const useCamera = (options = {}) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  // Facing of the live stream, taken from the track's settings when the
  // browser reports it (Chrome Android, iOS Safari); null when it doesn't.
  const [streamFacing, setStreamFacing] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [capturedImages, setCapturedImages] = useState([]);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedMimeType, setRecordedMimeType] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const canvasRef = useRef(null);
  const recordedMimeTypeRef = useRef(null);
  const capturedImagesRef = useRef([]);
  const recordedVideoUrlRef = useRef(null);
  const mountedRef = useRef(true);
  // Facing we asked for most recently (option, or flipped by toggleCamera).
  const requestedFacingRef = useRef(normalizeFacing(options?.facingMode));
  // Every startCamera call gets a new id; stopCamera and unmount bump it too.
  // A stream that arrives for an old id is stopped on arrival, so closing a
  // dialog while getUserMedia is still pending never leaves the camera on.
  const startIdRef = useRef(0);

  // Options are read through a ref so the callbacks below never need them in
  // their dependency arrays; callers may pass a fresh inline object each render.
  const optionsRef = useRef(options);
  optionsRef.current = options || {};

  // Get available camera devices
  const getDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = all.filter((device) => device.kind === 'videoinput');
      if (mountedRef.current) setDevices(videoDevices);
      return videoDevices;
    } catch (err) {
      if (mountedRef.current) setError('Failed to get camera devices: ' + err.message);
      return [];
    }
  }, []);

  // Build getUserMedia constraints. A deviceId wins over facingMode; facingMode
  // is `ideal` so a laptop with a single front webcam still gets a stream.
  const getConstraints = useCallback((deviceId, facing) => {
    const video = {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 60 },
    };

    if (isMobileUA()) {
      video.width = { ideal: 720, max: 1280 };
      video.height = { ideal: 480, max: 720 };
      video.frameRate = { ideal: 24, max: 30 };
    }

    if (deviceId) {
      video.deviceId = { exact: deviceId };
    } else if (facing) {
      video.facingMode = { ideal: facing };
    }

    const { videoConstraints, audio } = optionsRef.current;
    const mergedVideo =
      videoConstraints && typeof videoConstraints === 'object'
        ? { ...video, ...videoConstraints }
        : video;

    return { video: mergedVideo, audio: audio !== false };
  }, []);

  // Minimal constraints for the OverconstrainedError retry: drop the
  // resolution / frame-rate hints but keep the camera that was asked for.
  const getBasicConstraints = useCallback((deviceId, facing) => {
    const { audio } = optionsRef.current;
    let video = true;
    if (deviceId) video = { deviceId: { exact: deviceId } };
    else if (facing) video = { facingMode: { ideal: facing } };
    return { video, audio: audio !== false };
  }, []);

  const attachStream = useCallback(async (stream) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    try {
      await video.play();
    } catch (err) {
      // play() is aborted when the source changes underneath it (a quick
      // toggle, or start-then-switch). The new source plays on its own, so
      // this is not a camera failure.
      if (err?.name !== 'AbortError') throw err;
    }
  }, []);

  // Start camera stream. Resolves `true` when the stream is live, `false` when
  // it failed (see `error`) or was superseded / cancelled meanwhile.
  const startCamera = useCallback(async (deviceId = selectedDeviceId) => {
    const startId = ++startIdRef.current;
    const isCurrent = () => mountedRef.current && startIdRef.current === startId;
    const facing = requestedFacingRef.current;

    if (mountedRef.current) setError(null);

    const acquire = async () => {
      try {
        return await navigator.mediaDevices.getUserMedia(getConstraints(deviceId, facing));
      } catch (err) {
        if (err?.name !== 'OverconstrainedError') throw err;
        return navigator.mediaDevices.getUserMedia(getBasicConstraints(deviceId, facing));
      }
    };

    let stream;
    try {
      stream = await acquire();
    } catch (err) {
      if (!isCurrent()) return false;
      let errorMessage = 'Failed to access camera: ';
      switch (err?.name) {
        case 'NotAllowedError':
          errorMessage += 'Camera access denied. Please allow camera permissions.';
          break;
        case 'NotFoundError':
          errorMessage += 'No camera found on this device.';
          break;
        case 'NotReadableError':
          errorMessage += 'Camera is already in use by another application.';
          break;
        case 'OverconstrainedError':
          errorMessage += 'Camera constraints not supported.';
          break;
        default:
          errorMessage += err?.message || String(err);
      }
      setError(errorMessage);
      return false;
    }

    // Cancelled (stopCamera / unmount) or superseded while we were waiting.
    if (!isCurrent()) {
      stopStream(stream);
      return false;
    }

    stopStream(streamRef.current);
    streamRef.current = stream;

    try {
      await attachStream(stream);
    } catch (err) {
      if (isCurrent()) {
        stopStream(stream);
        streamRef.current = null;
        setError('Failed to play camera stream: ' + (err?.message || String(err)));
      }
      return false;
    }

    if (!isCurrent()) {
      // stopCamera ran during play(); it already stopped and detached this stream.
      return false;
    }

    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings?.() || {};
    const actualFacing = normalizeFacing(settings.facingMode);
    if (actualFacing) requestedFacingRef.current = actualFacing;
    setStreamFacing(actualFacing);
    if (settings.deviceId) setSelectedDeviceId(settings.deviceId);

    // Labels are only populated once permission has been granted.
    const videoDevices = await getDevices();
    if (!isCurrent()) return false;
    if (!settings.deviceId && videoDevices.length > 0) {
      setSelectedDeviceId(videoDevices[0].deviceId);
    }

    setIsStreaming(true);
    return true;
  }, [selectedDeviceId, getConstraints, getBasicConstraints, attachStream, getDevices]);

  // Stop camera stream (and any recording still running on it)
  const stopCamera = useCallback(() => {
    startIdRef.current += 1;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (_) {
        // already stopped
      }
    }

    stopStream(streamRef.current);
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (mountedRef.current) {
      setIsStreaming(false);
      setIsRecording(false);
      setStreamFacing(null);
    }
  }, []);

  // Start video recording
  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecording) return;

    try {
      setRecordedChunks([]);

      const {
        mimeTypes: customMimeTypes,
        videoBitsPerSecond,
        audioBitsPerSecond,
      } = optionsRef.current;

      const mimeTypes = Array.isArray(customMimeTypes) && customMimeTypes.length > 0
        ? customMimeTypes
        : DEFAULT_MIME_TYPES;

      const supportedMimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        setError("Your browser doesn't support video recording. Please try a different browser.");
        return;
      }

      recordedMimeTypeRef.current = supportedMimeType;
      setRecordedMimeType(supportedMimeType);

      const recorderOptions = { mimeType: supportedMimeType };
      if (isPositiveFinite(videoBitsPerSecond)) {
        recorderOptions.videoBitsPerSecond = videoBitsPerSecond;
      }
      if (isPositiveFinite(audioBitsPerSecond)) {
        recorderOptions.audioBitsPerSecond = audioBitsPerSecond;
      }

      let mediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(streamRef.current, recorderOptions);
      } catch (constructErr) {
        // Some browsers reject unsupported bitrate/mimeType combinations. Retry
        // with just the mime type so a bitrate hint never breaks recording on a
        // browser that worked without it.
        const hasBitrateHint = 'videoBitsPerSecond' in recorderOptions || 'audioBitsPerSecond' in recorderOptions;
        if (!hasBitrateHint) throw constructErr;
        mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: supportedMimeType });
      }
      mediaRecorderRef.current = mediaRecorder;

      const chunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (mediaRecorderRef.current === mediaRecorder) mediaRecorderRef.current = null;
        if (!mountedRef.current) return;
        setRecordedChunks(chunks);
        setIsRecording(false);

        if (chunks.length > 0) {
          const mimeType = recordedMimeTypeRef.current || 'video/mp4';
          const blob = new Blob(chunks, { type: mimeType });
          // Release the previous clip's object URL before replacing it.
          if (recordedVideoUrlRef.current) URL.revokeObjectURL(recordedVideoUrlRef.current);
          const url = URL.createObjectURL(blob);
          recordedVideoUrlRef.current = url;
          setRecordedVideoUrl(url);
          setRecordedBlob(blob);
        }
      };

      mediaRecorder.onerror = (event) => {
        if (mountedRef.current) setError('Recording error: ' + event.error?.message);
      };

      const timeslice = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1000 : 100;
      mediaRecorder.start(timeslice);

      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError('Failed to start recording: ' + err.message);
    }
  }, [isRecording]);

  // Stop video recording
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecording(false);
  }, []);

  // Capture image from video stream
  const captureImage = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!videoRef.current || !isStreaming) {
        reject(new Error('Video not ready or streaming stopped'));
        return;
      }

      try {
        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas');
        }

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const context = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to capture image blob'));
              return;
            }

            const imageUrl = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString();
            const captured = {
              id: Date.now(),
              url: imageUrl,
              timestamp,
              blob,
            };

            setCapturedImages((prev) => [...prev, captured]);
            setError(null);

            resolve(captured);
          },
          'image/jpeg',
          0.9
        );
      } catch (err) {
        setError('Failed to capture image: ' + err.message);
        reject(err);
      }
    });
  }, [isStreaming]);

  // Download recorded video
  const downloadVideo = useCallback(() => {
    if (recordedChunks.length === 0) return;

    const mimeType = recordedMimeTypeRef.current || 'video/mp4';
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    a.download = `recording-${new Date().toISOString()}.${extension}`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [recordedChunks]);

  // Clear recorded video
  const clearRecordedVideo = useCallback(() => {
    if (recordedVideoUrlRef.current) {
      URL.revokeObjectURL(recordedVideoUrlRef.current);
      recordedVideoUrlRef.current = null;
    }
    setRecordedVideoUrl(null);
    setRecordedChunks([]);
    setRecordedBlob(null);
    setRecordedMimeType(null);
    recordedMimeTypeRef.current = null;
  }, []);

  // Download captured image
  const downloadImage = useCallback((imageData) => {
    const a = document.createElement('a');
    a.href = imageData.url;
    a.download = `capture-${imageData.timestamp}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // Switch camera device
  const switchCamera = useCallback((deviceId) => {
    if (deviceId !== selectedDeviceId) {
      return startCamera(deviceId);
    }
    return Promise.resolve(false);
  }, [selectedDeviceId, startCamera]);

  const currentCameraType = (() => {
    if (streamFacing) return facingToType(streamFacing);
    if (!selectedDeviceId || devices.length === 0) return 'unknown';
    const current = devices.find((device) => device.deviceId === selectedDeviceId);
    return labelToType(current?.label);
  })();

  // Toggle between cameras. When the current facing is known, ask the browser
  // for the opposite one (it picks the main camera of that side, so phones
  // with several back lenses don't land on the ultra-wide). Otherwise fall
  // back to cycling through the enumerated devices.
  const toggleCamera = useCallback(() => {
    if (currentCameraType === 'front' || currentCameraType === 'back') {
      requestedFacingRef.current = currentCameraType === 'front' ? 'environment' : 'user';
      // null, not undefined: undefined would fall back to the default
      // parameter (the current deviceId) and reopen the same camera.
      return startCamera(null);
    }

    if (devices.length <= 1) return Promise.resolve(false);
    const currentIndex = devices.findIndex((device) => device.deviceId === selectedDeviceId);
    const nextDevice = devices[(currentIndex + 1) % devices.length];
    if (nextDevice && nextDevice.deviceId !== selectedDeviceId) {
      return startCamera(nextDevice.deviceId);
    }
    return Promise.resolve(false);
  }, [currentCameraType, devices, selectedDeviceId, startCamera]);

  // If the <video> mounts after the stream arrived (e.g. it's rendered only
  // once `isStreaming` is true), attach the stream then.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (isStreaming && video && stream && video.srcObject !== stream) {
      attachStream(stream).catch(() => {});
    }
  });

  // Mirror state into refs so the unmount cleanup can see the latest values
  // without re-subscribing (which would tear down the camera on every capture).
  useEffect(() => {
    capturedImagesRef.current = capturedImages;
  }, [capturedImages]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startIdRef.current += 1;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch (_) {
          // already stopped
        }
      }
      stopStream(streamRef.current);
      streamRef.current = null;
      capturedImagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.url);
      });
      if (recordedVideoUrlRef.current) {
        URL.revokeObjectURL(recordedVideoUrlRef.current);
        recordedVideoUrlRef.current = null;
      }
    };
  }, []);

  return {
    videoRef,
    isStreaming,
    isRecording,
    error,
    devices,
    selectedDeviceId,
    recordedChunks,
    capturedImages,
    recordedVideoUrl,
    recordedBlob,
    recordedMimeType,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    captureImage,
    downloadVideo,
    downloadImage,
    switchCamera,
    toggleCamera,
    getDevices,
    clearRecordedVideo,
    hasRecording: recordedChunks.length > 0,
    canRecord: isStreaming && !isRecording,
    canCapture: isStreaming,
    canToggleCamera: devices.length > 1,
    currentCameraType,
    recordedMimeTypeRef,
  };
};

export default useCamera;
