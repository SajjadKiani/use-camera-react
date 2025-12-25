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
  const recordedMimeTypeRef = useRef(null);

  // Get available camera devices
  const getDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log({videoDevices});
      
      setDevices(videoDevices);
      
      // Only set default device if we don't have one selected
      if (!selectedDeviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
      
      return videoDevices;
    } catch (err) {
      console.error('Failed to get camera devices:', err);
      setError('Failed to get camera devices: ' + err.message);
      return [];
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
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints = getConstraints(deviceId);
      console.log('Requesting camera permission with constraints:', constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Camera permission granted, stream obtained:', stream);

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.muted = true;
        await videoRef.current.play();
      }
      
      // FIXED: Fetch devices AFTER permission is granted
      const videoDevices = await getDevices();
      
      // Set the selected device ID based on the actual stream track
      if (stream.getVideoTracks().length > 0) {
        const actualDeviceId = stream.getVideoTracks()[0].getSettings().deviceId;
        if (actualDeviceId) {
          setSelectedDeviceId(actualDeviceId);
        }
      }
      
      setIsStreaming(true);
    } catch (err) {
      let errorMessage = 'Failed to access camera: ';
      
      switch (err.name) {
        case 'NotAllowedError':
          errorMessage += 'Camera access denied. Please allow camera permissions.';
          console.log('Camera permission denied');
          break;
        case 'NotFoundError':
          errorMessage += 'No camera found on this device.';
          break;
        case 'NotReadableError':
          errorMessage += 'Camera is already in use by another application.';
          break;
        case 'OverconstrainedError':
          errorMessage += 'Camera constraints not supported. Trying with basic settings...';
          try {
            const basicStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
            });
            streamRef.current = basicStream;
            if (videoRef.current) {
              videoRef.current.srcObject = basicStream;
              videoRef.current.setAttribute('playsinline', 'true');
              videoRef.current.setAttribute('webkit-playsinline', 'true');
              videoRef.current.muted = true;
              await videoRef.current.play();
            }
            
            // FIXED: Also fetch devices after fallback succeeds
            await getDevices();
            
            if (basicStream.getVideoTracks().length > 0) {
              const actualDeviceId = basicStream.getVideoTracks()[0].getSettings().deviceId;
              if (actualDeviceId) {
                setSelectedDeviceId(actualDeviceId);
              }
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
  }, [selectedDeviceId, getConstraints, getDevices]);

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

      const mimeTypes = [
        'video/mp4',
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm; codecs="vp8, opus"',
        'video/webm',
      ];
      
      let options = {};
      const supportedMimeType = mimeTypes.find(type => {
        const isSupported = MediaRecorder.isTypeSupported(type);
        console.log(`Checking MIME type: ${type}, Supported: ${isSupported}`);
        return isSupported;
      });

      if (!supportedMimeType) {
        setError("Your browser doesn't support video recording. Please try a different browser.");
        console.error("No supported MIME type found for MediaRecorder.");
        return;
      }

      console.log(`Using MIME type: ${supportedMimeType}`);
      options.mimeType = supportedMimeType;
      recordedMimeTypeRef.current = supportedMimeType;

      const mediaRecorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = mediaRecorder;

      const chunks = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          console.log(`Chunk received: ${event.data.size} bytes`);
        }
      };

      mediaRecorder.onstop = () => {
        console.log(`Recording stopped. Total chunks: ${chunks.length}`);
        setRecordedChunks(chunks);
        
        if (chunks.length > 0) {
          const mimeType = recordedMimeTypeRef.current || 'video/mp4';
          const blob = new Blob(chunks, { type: mimeType });
          console.log(`Created blob: ${blob.size} bytes, type: ${blob.type}`);
          
          const url = URL.createObjectURL(blob);
          setRecordedVideoUrl(url);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        setError('Recording error: ' + event.error?.message);
      };

      const timeslice = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1000 : 100;
      mediaRecorder.start(timeslice);
      
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error('Failed to start recording:', err);
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
        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const context = canvas.getContext("2d");

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

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

            resolve(captured);
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
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
    }
    setRecordedChunks([]);
    recordedMimeTypeRef.current = null;
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

  // Toggle between cameras
  const toggleCamera = useCallback(() => {
    if (devices.length <= 1) return;

    const currentIndex = devices.findIndex(device => device.deviceId === selectedDeviceId);
    
    if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      const frontCameraKeywords = ['front', 'user', 'facing user', 'selfie'];
      const backCameraKeywords = ['back', 'rear', 'environment', 'facing environment'];
      
      const currentDevice = devices[currentIndex];
      const currentLabel = currentDevice?.label?.toLowerCase() || '';
      
      const isCurrentFront = frontCameraKeywords.some(keyword => currentLabel.includes(keyword));
      const isCurrentBack = backCameraKeywords.some(keyword => currentLabel.includes(keyword));
      
      let targetDevice = null;
      
      if (isCurrentFront) {
        targetDevice = devices.find(device => {
          const label = device.label?.toLowerCase() || '';
          return backCameraKeywords.some(keyword => label.includes(keyword));
        });
      } else if (isCurrentBack) {
        targetDevice = devices.find(device => {
          const label = device.label?.toLowerCase() || '';
          return frontCameraKeywords.some(keyword => label.includes(keyword));
        });
      }
      
      if (targetDevice && targetDevice.deviceId !== selectedDeviceId) {
        startCamera(targetDevice.deviceId);
        return;
      }
    }
    
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];
    
    if (nextDevice && nextDevice.deviceId !== selectedDeviceId) {
      startCamera(nextDevice.deviceId);
    }
  }, [devices, selectedDeviceId, startCamera]);

  // Get camera type
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

  // REMOVED: Initial getDevices() call from useEffect
  // This was causing the issue - it tried to fetch devices before permission

  useEffect(() => {
    return () => {
      stopCamera();
      capturedImages.forEach(image => {
        URL.revokeObjectURL(image.url);
      });
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
    };
  }, [stopCamera, capturedImages, recordedVideoUrl]);

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
    currentCameraType: getCurrentCameraType(),
    recordedMimeTypeRef
  };
};

export default useCamera;