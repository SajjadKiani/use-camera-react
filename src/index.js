import { useState, useRef, useCallback, useEffect } from 'react';

const useCamera = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [capturedImages, setCapturedImages] = useState([]);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const canvasRef = useRef(null);

  // Get available camera devices
  const getDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setDevices(videoDevices);
      
      // Set default device if none selected
      if (!selectedDeviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      setError('Failed to get camera devices: ' + err.message);
    }
  }, [selectedDeviceId]);

  // Get optimal constraints for different devices
  const getConstraints = useCallback((deviceId) => {
    const baseConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: true
    };

    // Mobile-specific optimizations
    if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      baseConstraints.video.width = { ideal: 720, max: 1280 };
      baseConstraints.video.height = { ideal: 480, max: 720 };
      baseConstraints.video.frameRate = { ideal: 24, max: 30 };
    }

    return baseConstraints;
  }, []);

  // Start camera stream
  const startCamera = useCallback(async (deviceId = selectedDeviceId) => {
    try {
      setError(null);
      
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints = getConstraints(deviceId);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      setIsStreaming(true);
      setSelectedDeviceId(deviceId);
    } catch (err) {
      let errorMessage = 'Failed to access camera: ';
      
      switch (err.name) {
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
          errorMessage += 'Camera constraints not supported. Trying with basic settings...';
          // Retry with basic constraints
          try {
            const basicStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
            });
            streamRef.current = basicStream;
            if (videoRef.current) {
              videoRef.current.srcObject = basicStream;
              await videoRef.current.play();
            }
            setIsStreaming(true);
            return;
          } catch (basicErr) {
            errorMessage += ' Basic settings also failed.';
          }
          break;
        default:
          errorMessage += err.message;
      }
      
      setError(errorMessage);
    }
  }, [selectedDeviceId, getConstraints]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsStreaming(false);
    setIsRecording(false);
  }, []);

  // Start video recording
  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecording) return;

    try {
      setRecordedChunks([]);
      
      // Check for MediaRecorder support and choose appropriate codec
      let options = {};
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options.mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        options.mimeType = 'video/webm;codecs=vp8';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options.mimeType = 'video/mp4';
      }

      const mediaRecorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = mediaRecorder;

      const chunks = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        setRecordedChunks(chunks);
        // Create video URL for preview
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          setRecordedVideoUrl(url);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError('Failed to start recording: ' + err.message);
    }
  }, [isRecording]);

  // Stop video recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Capture image from video stream
  const captureImage = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!videoRef.current || !isStreaming) {
        reject(new Error("Video not ready or streaming stopped"));
        return;
      }

      try {
        // Create canvas if it doesn't exist
        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const context = canvas.getContext("2d");

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw current video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to blob and create URL
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to capture image blob"));
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

            resolve(captured); // ✅ resolve after captured
          },
          "image/jpeg",
          0.9
        );
      } catch (err) {
        setError("Failed to capture image: " + err.message);
        reject(err);
      }
    });
  }, [isStreaming]);

  // Download recorded video
  const downloadVideo = useCallback(() => {
    if (recordedChunks.length === 0) return;

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording-${new Date().toISOString()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [recordedChunks]);

  // Clear recorded video
  const clearRecordedVideo = useCallback(() => {
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
    }
    setRecordedChunks([]);
  }, [recordedVideoUrl]);

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
      startCamera(deviceId);
    }
  }, [selectedDeviceId, startCamera]);

  // Toggle between cameras (front/back on mobile, or cycle through available cameras)
  const toggleCamera = useCallback(() => {
    if (devices.length <= 1) return;

    // Find current device index
    const currentIndex = devices.findIndex(device => device.deviceId === selectedDeviceId);
    
    // For mobile devices, try to intelligently toggle between front and back cameras
    if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      // Look for front/back camera patterns in device labels
      const frontCameraKeywords = ['front', 'user', 'facing user', 'selfie'];
      const backCameraKeywords = ['back', 'rear', 'environment', 'facing environment'];
      
      const currentDevice = devices[currentIndex];
      const currentLabel = currentDevice?.label?.toLowerCase() || '';
      
      // Determine if current camera is front or back
      const isCurrentFront = frontCameraKeywords.some(keyword => currentLabel.includes(keyword));
      const isCurrentBack = backCameraKeywords.some(keyword => currentLabel.includes(keyword));
      
      let targetDevice = null;
      
      if (isCurrentFront) {
        // Switch to back camera
        targetDevice = devices.find(device => {
          const label = device.label?.toLowerCase() || '';
          return backCameraKeywords.some(keyword => label.includes(keyword));
        });
      } else if (isCurrentBack) {
        // Switch to front camera
        targetDevice = devices.find(device => {
          const label = device.label?.toLowerCase() || '';
          return frontCameraKeywords.some(keyword => label.includes(keyword));
        });
      }
      
      // If we found a target device, use it; otherwise fall back to cycling
      if (targetDevice && targetDevice.deviceId !== selectedDeviceId) {
        startCamera(targetDevice.deviceId);
        return;
      }
    }
    
    // Default behavior: cycle to next camera
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];
    
    if (nextDevice && nextDevice.deviceId !== selectedDeviceId) {
      startCamera(nextDevice.deviceId);
    }
  }, [devices, selectedDeviceId, startCamera]);

  // Get camera type (front/back/unknown) for current device
  const getCurrentCameraType = useCallback(() => {
    if (!selectedDeviceId || devices.length === 0) return 'unknown';
    
    const currentDevice = devices.find(device => device.deviceId === selectedDeviceId);
    if (!currentDevice?.label) return 'unknown';
    
    const label = currentDevice.label.toLowerCase();
    const frontKeywords = ['front', 'user', 'facing user', 'selfie'];
    const backKeywords = ['back', 'rear', 'environment', 'facing environment'];
    
    if (frontKeywords.some(keyword => label.includes(keyword))) {
      return 'front';
    } else if (backKeywords.some(keyword => label.includes(keyword))) {
      return 'back';
    }
    
    return 'unknown';
  }, [selectedDeviceId, devices]);

  // Initialize devices on mount
  useEffect(() => {
    getDevices();
  }, [getDevices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      // Cleanup captured image URLs
      capturedImages.forEach(image => {
        URL.revokeObjectURL(image.url);
      });
      // Cleanup recorded video URL
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
    };
  }, [stopCamera, capturedImages, recordedVideoUrl]);

  return {
    // Refs
    videoRef,
    
    // State
    isStreaming,
    isRecording,
    error,
    devices,
    selectedDeviceId,
    recordedChunks,
    capturedImages,
    recordedVideoUrl,
    
    // Actions
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
    
    // Computed
    hasRecording: recordedChunks.length > 0,
    canRecord: isStreaming && !isRecording,
    canCapture: isStreaming,
    canToggleCamera: devices.length > 1,
    currentCameraType: getCurrentCameraType()
  };
};

export default useCamera;