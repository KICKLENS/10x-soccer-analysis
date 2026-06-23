import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  runMobileAnalysisPipeline,
  type AiAnalysisPayload,
  type AnalysisPipelineStep,
} from '../lib/analysisFlow';
import { saveAnalysisToHistory } from '../lib/analysisHistory';
import { type SelectedPlayer } from '../lib/api';
import PageNav from '../components/PageNav';

const SELECTED_PLAYER_STORAGE_KEYS = [
  'highlight-selected-player',
  'selected-highlight-player',
];

const MATCH_UNIFORM_KEY = 'match-uniform-color';

interface PlayerRecord extends SelectedPlayer {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface UploadResponseData {
  success?: boolean;
  message?: string;
  fileName?: string;
  originalName?: string;
  savedPath?: string;
  url?: string;
  videoUrl?: string;
  analysisId?: string;
  [key: string]: unknown;
}

const PIPELINE_LABELS: Record<AnalysisPipelineStep, string> = {
  idle: '분석 준비',
  uploading: '영상 업로드 중...',
  analyzing: 'AI 하이라이트·코치 분석 중... (2~12분)',
  done: '분석 완료',
};

const LARGE_FILE_WARN_BYTES = 600 * 1024 * 1024;

type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

function safeReadJSON<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadSelectedPlayer(): PlayerRecord | null {
  for (const key of SELECTED_PLAYER_STORAGE_KEYS) {
    const localValue = safeReadJSON<PlayerRecord | null>(localStorage, key, null);
    if (localValue?.name) return localValue;

    const sessionValue = safeReadJSON<PlayerRecord | null>(sessionStorage, key, null);
    if (sessionValue?.name) return sessionValue;
  }

  return null;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getSupportedMimeType() {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return '';
}

export default function MobileCapturePage() {
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const autoPipelineRef = useRef(false);

  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('가로 모드로 촬영하면 경기 흐름과 선수 움직임을 함께 보기 좋습니다.');
  const [errorMessage, setErrorMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<AnalysisPipelineStep>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResponseData | null>(null);
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= window.innerHeight : true,
  );
  const [allowPortrait, setAllowPortrait] = useState(false);
  const [todayUniform, setTodayUniform] = useState('');
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number }>({
    min: 1,
    max: 1,
    step: 0.1,
  });

  // 촬영 시작 직후 단계별 안내(전신 5초 카운트다운 → 줌아웃 안내 → 사라짐)
  const [guidePhase, setGuidePhase] = useState<'idle' | 'fullbody' | 'zoomout'>('idle');
  const [guideCount, setGuideCount] = useState(0);
  const guideIntervalRef = useRef<number | null>(null);
  const guideTimeoutsRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (guideIntervalRef.current) window.clearInterval(guideIntervalRef.current);
      guideTimeoutsRef.current.forEach((t) => window.clearTimeout(t));
      try { void audioCtxRef.current?.close(); } catch { /* noop */ }
    };
  }, []);

  const hasRecordedVideo = useMemo(() => Boolean(recordedBlob && recordedPreviewUrl), [recordedBlob, recordedPreviewUrl]);
  const isPipelineRunning = pipelineStep === 'uploading' || pipelineStep === 'analyzing';
  const canStartAnalysis = useMemo(
    () => Boolean(recordedFile && selectedPlayer?.name) && !isPipelineRunning,
    [recordedFile, selectedPlayer, isPipelineRunning],
  );

  useEffect(() => {
    const player = loadSelectedPlayer();
    if (!player?.name) {
      navigate('/player-registration', { replace: true });
      return;
    }
    setSelectedPlayer(player);

    const savedUniform = safeReadJSON<string>(sessionStorage, MATCH_UNIFORM_KEY, '');
    setTodayUniform(savedUniform || player.uniformColor || '');
  }, [navigate]);

  const handleTodayUniformChange = (value: string) => {
    setTodayUniform(value);
    try {
      sessionStorage.setItem(MATCH_UNIFORM_KEY, JSON.stringify(value));
    } catch {
      // ignore storage failures
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth >= window.innerHeight);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    void startCamera();

    return () => {
      void cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (recordedPreviewUrl) {
        URL.revokeObjectURL(recordedPreviewUrl);
      }
    };
  }, [recordedPreviewUrl]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isRecording) {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRecording]);

  const clearMessages = () => {
    setErrorMessage('');
    setUploadResult(null);
  };

  const requestWakeLock = async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: {
          request: (type: 'screen') => Promise<WakeLockSentinelLike>;
        };
      };

      if (!nav.wakeLock?.request) return;

      if (wakeLockRef.current) {
        await wakeLockRef.current.release().catch(() => undefined);
        wakeLockRef.current = null;
      }

      wakeLockRef.current = await nav.wakeLock.request('screen');
    } catch {
      // ignore
    }
  };

  const releaseWakeLock = async () => {
    if (!wakeLockRef.current) return;
    try {
      await wakeLockRef.current.release();
    } catch {
      // ignore
    } finally {
      wakeLockRef.current = null;
    }
  };

  const tryLockLandscape = async () => {
    try {
      const orientationApi = (screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      });

      if (orientationApi?.lock) {
        await orientationApi.lock('landscape');
      }
    } catch {
      // ignore
    }
  };

  const requestLandscape = async () => {
    try {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };

      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen().catch(() => undefined);
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      }

      const orientationApi = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };

      if (orientationApi?.lock) {
        await orientationApi.lock('landscape');
        setStatusMessage('가로 모드로 전환했습니다. 선수를 중앙 가이드 안에 맞춘 뒤 녹화하세요.');
      } else {
        setAllowPortrait(true);
        setStatusMessage('이 기기는 자동 가로 전환을 지원하지 않습니다. 휴대폰을 옆으로 돌리거나, 이대로 촬영해 주세요.');
      }
    } catch {
      setAllowPortrait(true);
      setStatusMessage('자동 가로 전환이 차단되었습니다. 휴대폰을 옆으로 돌리거나, 이대로 촬영해 주세요.');
    }
  };

  const exitLandscape = async () => {
    try {
      const orientationApi = screen.orientation as ScreenOrientation & {
        unlock?: () => void;
      };
      orientationApi?.unlock?.();
    } catch {
      // ignore
    }

    try {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void> | void;
        webkitFullscreenElement?: Element | null;
      };

      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen().catch(() => undefined);
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      }
    } catch {
      // ignore
    }

    setAllowPortrait(false);
    setStatusMessage('세로 모드로 돌아왔습니다. 필요하면 다시 "가로 모드로 전환"을 눌러 주세요.');
  };

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      setRecordSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTracks = () => {
    const stream = streamRef.current;
    if (!stream) return;

    stream.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;
    setIsCameraReady(false);
  };

  const cleanupAll = async () => {
    stopTimer();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    stopTracks();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    await releaseWakeLock();
  };

  const detectZoomCapability = (stream: MediaStream) => {
    try {
      const track = stream.getVideoTracks?.()[0];
      const caps = (track?.getCapabilities?.() as Record<string, any> | undefined) || {};
      const zoomCap = caps.zoom;
      if (track && zoomCap && typeof zoomCap === 'object' && Number(zoomCap.max) > Number(zoomCap.min)) {
        const min = Number(zoomCap.min) || 1;
        const max = Number(zoomCap.max) || 1;
        const step = Number(zoomCap.step) || 0.1;
        const settings = (track.getSettings?.() as Record<string, any> | undefined) || {};
        const current = Number(settings.zoom) || min;
        setZoomRange({ min, max, step });
        setZoom(current);
        setZoomSupported(true);
        return;
      }
    } catch {
      // 줌 미지원 기기
    }
    setZoomSupported(false);
    setZoom(1);
  };

  const applyZoom = (value: number) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, value));
    setZoom(clamped);
    track
      .applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] })
      .catch(() => undefined);
  };

  const startCamera = async () => {
    clearMessages();
    setIsCameraLoading(true);

    try {
      await tryLockLandscape();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
        },
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      detectZoomCapability(stream);

      setIsCameraReady(true);
      setStatusMessage('카메라가 준비되었습니다. 선수를 중앙 가이드 박스 안에 맞춘 뒤 녹화를 시작하세요.');
      setErrorMessage('');
    } catch (error) {
      setIsCameraReady(false);
      setErrorMessage(
        error instanceof Error
          ? `카메라를 시작할 수 없습니다: ${error.message}`
          : '카메라를 시작할 수 없습니다.',
      );
      setStatusMessage('카메라 권한을 허용한 뒤 다시 시도해 주세요. 모바일에서는 HTTPS 또는 localhost 환경이 필요합니다.');
    } finally {
      setIsCameraLoading(false);
    }
  };

  const stopCamera = async () => {
    stopTracks();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setZoomSupported(false);
    setZoom(1);

    await releaseWakeLock();
    setStatusMessage('카메라를 중지했습니다.');
  };

  const clearCaptureGuide = () => {
    if (guideIntervalRef.current) {
      window.clearInterval(guideIntervalRef.current);
      guideIntervalRef.current = null;
    }
    guideTimeoutsRef.current.forEach((t) => window.clearTimeout(t));
    guideTimeoutsRef.current = [];
  };

  // 사용자 제스처(녹화 시작 버튼) 안에서 오디오 컨텍스트를 준비/재개해야 모바일에서 소리가 난다
  const ensureAudio = (): AudioContext | null => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext
          || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current?.state === 'suspended') void audioCtxRef.current.resume();
      return audioCtxRef.current;
    } catch {
      return null;
    }
  };

  const beep = (freq = 880, durationMs = 120, volume = 0.16) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
      osc.start(now);
      osc.stop(now + durationMs / 1000 + 0.02);
    } catch {
      /* noop */
    }
  };

  const vibrate = (pattern: number | number[]) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* noop */
    }
  };

  const startCaptureGuide = () => {
    clearCaptureGuide();
    const FULLBODY_SEC = 5;
    const ZOOMOUT_SEC = 6;

    ensureAudio();
    setGuidePhase('fullbody');
    setGuideCount(FULLBODY_SEC);
    beep(880, 120); // 시작(5) 비프

    let remaining = FULLBODY_SEC;
    guideIntervalRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setGuideCount(remaining);
        beep(880, 120); // 4·3·2·1 매초 비프
      } else {
        setGuideCount(0);
        if (guideIntervalRef.current) {
          window.clearInterval(guideIntervalRef.current);
          guideIntervalRef.current = null;
        }
        beep(1320, 280, 0.2); // 완료 비프(조금 높고 길게)
        vibrate(220); // 완료 진동
      }
    }, 1000);

    guideTimeoutsRef.current.push(
      window.setTimeout(() => setGuidePhase('zoomout'), FULLBODY_SEC * 1000),
      window.setTimeout(() => setGuidePhase('idle'), (FULLBODY_SEC + ZOOMOUT_SEC) * 1000),
    );
  };

  const startRecording = async () => {
    clearMessages();

    const stream = streamRef.current;
    if (!stream) {
      setErrorMessage('카메라가 준비되지 않았습니다. 먼저 카메라를 시작해 주세요.');
      return;
    }

    try {
      recordedChunksRef.current = [];
      setRecordedBlob(null);
      setRecordedFile(null);

      if (recordedPreviewUrl) {
        URL.revokeObjectURL(recordedPreviewUrl);
        setRecordedPreviewUrl('');
      }

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalMimeType = recorder.mimeType || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: finalMimeType });

        const extension =
          finalMimeType.includes('mp4') ? 'mp4' : finalMimeType.includes('webm') ? 'webm' : 'mp4';

        const fileName = `player-capture-${Date.now()}.${extension}`;
        const file = new File([blob], fileName, { type: finalMimeType });

        const preview = URL.createObjectURL(blob);

        setRecordedBlob(blob);
        setRecordedFile(file);
        setRecordedPreviewUrl(preview);
        setStatusMessage('녹화가 완료되었습니다. 아래 미리보기에서 확인 후 업로드할 수 있습니다.');
        setIsRecording(false);
        clearCaptureGuide();
        setGuidePhase('idle');
        stopTimer();
        void releaseWakeLock();
      };

      recorder.start(1000);
      setRecordSeconds(0);
      setIsRecording(true);
      setStatusMessage('녹화 중입니다. 선수가 중앙 가이드 박스 안에 계속 오도록 유지해 주세요.');
      startCaptureGuide();
      await requestWakeLock();
      startTimer();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? `녹화를 시작할 수 없습니다: ${error.message}` : '녹화를 시작할 수 없습니다.',
      );
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setErrorMessage('현재 진행 중인 녹화가 없습니다.');
      return;
    }

    recorder.stop();
  };

  const resetRecordedVideo = () => {
    clearMessages();
    autoPipelineRef.current = false;
    setPipelineStep('idle');

    if (recordedPreviewUrl) {
      URL.revokeObjectURL(recordedPreviewUrl);
    }

    setRecordedBlob(null);
    setRecordedFile(null);
    setRecordedPreviewUrl('');
    setUploadResult(null);
    setStatusMessage('녹화본을 초기화했습니다. 다시 촬영할 수 있습니다.');
  };

  const runAnalysisPipeline = async (file: File) => {
    if (!selectedPlayer?.name) {
      setErrorMessage('선수 정보가 없습니다. 먼저 선수 등록을 완료해 주세요.');
      navigate('/player-registration');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setPipelineStep('uploading');
      setErrorMessage('');
      setStatusMessage(PIPELINE_LABELS.uploading);

      const matchPlayer: PlayerRecord = {
        ...selectedPlayer,
        uniformColor: todayUniform.trim(),
      };

      const payload: AiAnalysisPayload = await runMobileAnalysisPipeline(
        file,
        matchPlayer,
        {
          captureMode: 'landscape-player-focus',
          deviceOrientation: isLandscape ? 'landscape' : 'portrait',
          matchUniformColor: todayUniform.trim(),
        },
        (step) => {
          setPipelineStep(step);
          if (step === 'analyzing') {
            setStatusMessage(PIPELINE_LABELS.analyzing);
          }
        },
        (percent) => setUploadProgress(percent),
      );

      saveAnalysisToHistory(payload);
      setUploadResult({ success: true, fileName: payload.uploadedVideoFileName });
      setStatusMessage('분석이 완료되었습니다. 코치 피드백 화면으로 이동합니다.');
      navigate('/ai-video-analysis', { state: payload });
    } catch (error) {
      autoPipelineRef.current = false;
      setPipelineStep('idle');
      setErrorMessage(
        error instanceof Error ? error.message : '분석 중 오류가 발생했습니다.',
      );
      setStatusMessage('분석에 실패했습니다. 네트워크와 촬영 각도를 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartAnalysis = async () => {
    if (!recordedFile) {
      setErrorMessage('먼저 녹화된 영상을 준비해 주세요.');
      return;
    }

    await runAnalysisPipeline(recordedFile);
  };

  useEffect(() => {
    if (!recordedFile || !selectedPlayer?.name || autoPipelineRef.current || isRecording) return;
    autoPipelineRef.current = true;
    void runAnalysisPipeline(recordedFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordedFile, selectedPlayer?.name, isRecording]);

  return (
    <div style={pageStyle}>
      <style>{'@keyframes pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }'}</style>
      <div style={containerStyle}>
        <PageNav />
        <section style={heroCardStyle}>
          <div style={eyebrowStyle}>선수 촬영</div>
          <h1 style={heroTitleStyle}>경기 촬영하기</h1>
          <p style={heroDescriptionStyle}>
            선수를 화면 중앙에 두고 촬영하세요. 녹화를 마치면 AI가 자동으로 하이라이트와 코치 피드백을 만들어 줍니다.
          </p>
        </section>

        <section style={playerPanelStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>선택된 선수 정보</h2>
            <button
              type="button"
              onClick={() => navigate('/player-registration')}
              style={changePlayerButtonStyle}
            >
              선수 변경 / 정보 수정
            </button>
          </div>

          {selectedPlayer ? (
            <div style={playerCardStyle}>
              <div style={playerNameStyle}>{selectedPlayer.name}</div>
              <div style={playerMetaGridStyle}>
                <div style={playerMetaItemStyle}>
                  <div style={metaLabelStyle}>포지션</div>
                  <div style={metaValueStyle}>{selectedPlayer.position || '-'}</div>
                </div>
                <div style={playerMetaItemStyle}>
                  <div style={metaLabelStyle}>팀명</div>
                  <div style={metaValueStyle}>{selectedPlayer.teamName || '-'}</div>
                </div>
                <div style={playerMetaItemStyle}>
                  <div style={metaLabelStyle}>등번호</div>
                  <div style={metaValueStyle}>{selectedPlayer.jerseyNumber || '-'}</div>
                </div>
                <div style={{ ...playerMetaItemStyle, gridColumn: '1 / -1' }}>
                  <div style={metaLabelStyle}>식별 힌트</div>
                  <div style={metaValueStyle}>{selectedPlayer.traits || '-'}</div>
                </div>
              </div>

              <div style={uniformFieldStyle}>
                <label style={uniformLabelStyle}>오늘 경기 유니폼 색상</label>
                <input
                  value={todayUniform}
                  onChange={(event) => handleTodayUniformChange(event.target.value)}
                  placeholder="예: 빨강 상의 / 검정 하의, 흰색, 형광 노랑"
                  style={uniformInputStyle}
                />
                <div style={uniformHelpStyle}>
                  유니폼은 경기마다 달라질 수 있어요. 오늘 입은 색을 입력하면 해당 선수를 더 정확히 추적합니다.
                </div>
              </div>
            </div>
          ) : (
            <div style={emptyStateStyle}>
              아직 선택된 선수 정보가 없습니다. 먼저 선수등록 페이지에서 선수를 저장하거나 불러와 주세요.
              <button
                type="button"
                onClick={() => navigate('/player-registration')}
                style={emptyStateButtonStyle}
              >
                선수 등록 페이지로 가기
              </button>
            </div>
          )}
        </section>

        <section style={capturePanelStyle}>
          <div style={captureTopRowStyle}>
            <div>
              <div style={sectionLabelStyle}>LIVE CAMERA</div>
              <h2 style={captureTitleStyle}>가로 촬영 화면</h2>
              <p style={captureDescStyle}>
                선수를 중앙 가이드 안에 위치시키고, 좌우 공간이 충분히 보이도록 유지해 주세요.
              </p>
            </div>

            <div style={badgeRowStyle}>
              <div style={badgeStyle}>
                {isCameraReady ? '카메라 준비됨' : isCameraLoading ? '카메라 시작 중' : '카메라 대기'}
              </div>
              <div style={{ ...badgeStyle, ...(isLandscape ? landscapeBadgeStyle : portraitBadgeStyle) }}>
                {isLandscape ? '가로 방향' : '세로 방향'}
              </div>
              <div style={badgeStyle}>
                {isRecording ? `녹화 중 ${formatDuration(recordSeconds)}` : '녹화 대기'}
              </div>
            </div>
          </div>

          {!isLandscape && (
            <div style={landscapeHelperStyle}>
              <button
                type="button"
                onClick={requestLandscape}
                style={landscapeHelperButtonStyle}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>↻</span>
                가로 모드로 전환
              </button>
              <div style={landscapeHelperTextStyle}>
                버튼이 안 먹히는 기종이면, 휴대폰의 <strong>화면 자동 회전</strong>을 켠 뒤
                기기를 옆으로 돌려 가로로 촬영해 주세요. 가로 촬영이 선수 추적·좌우 흐름 분석에 가장 정확합니다.
              </div>
            </div>
          )}

          <div style={cameraFrameStyle}>
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={cameraVideoStyle}
            />

            <div style={cameraOverlayStyle}>
              {guidePhase === 'idle' ? (
                <div style={topHintPillStyle}>
                  선수를 중앙 가이드 안에 맞춰 주세요
                </div>
              ) : (
                <div style={captureGuideStyle}>
                  {guidePhase === 'fullbody' ? (
                    <>
                      <div style={captureGuideTitleStyle}>선수 전신을 5초간 촬영해 주세요</div>
                      <div style={captureGuideCountStyle}>{guideCount}</div>
                      <div style={captureGuideSubStyle}>중앙에 선수가 잘 보이도록 잡아 주세요</div>
                    </>
                  ) : (
                    <>
                      <div style={captureGuideTitleStyle}>이제 아주 천천히 줌아웃하세요</div>
                      <div style={captureGuideSubStyle}>
                        가운데 선수를 포커싱한 채로 경기 흐름까지 함께 촬영해 주세요
                      </div>
                    </>
                  )}
                </div>
              )}

              {isLandscape && (
                <button
                  type="button"
                  onClick={exitLandscape}
                  style={landscapeExitButtonStyle}
                >
                  ✕ 가로 종료
                </button>
              )}

              {!isLandscape && !allowPortrait && (
                <div style={rotateOverlayStyle}>
                  <div style={rotateCardStyle}>
                    <div style={rotateIconStyle}>↻</div>
                    <div style={rotateTitleStyle}>가로 모드로 촬영해 주세요</div>
                    <div style={rotateDescStyle}>
                      가로 촬영이 선수 중심 추적과 경기 좌우 흐름 확인에 더 유리합니다.
                    </div>
                    <div style={rotateButtonRowStyle}>
                      <button
                        type="button"
                        onClick={requestLandscape}
                        style={rotatePrimaryButtonStyle}
                      >
                        가로 모드로 전환
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAllowPortrait(true);
                          setStatusMessage('세로 모드로 촬영합니다. 선수가 화면 중앙에 오도록 유지해 주세요.');
                        }}
                        style={rotateGhostButtonStyle}
                      >
                        이대로 세로로 촬영
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={guideFrameStyle}>
                <div style={guideLabelStyle}>분석할 선수를 중앙에</div>
              </div>

              <div style={bottomStackStyle}>
                {isCameraReady && zoomSupported && (
                  <div style={zoomControlStyle}>
                    <button
                      type="button"
                      onClick={() => applyZoom(zoom - zoomRange.step * 2)}
                      style={zoomButtonStyle}
                      aria-label="줌 아웃"
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min={zoomRange.min}
                      max={zoomRange.max}
                      step={zoomRange.step}
                      value={zoom}
                      onChange={(event) => applyZoom(Number(event.target.value))}
                      style={zoomSliderStyle}
                      aria-label="카메라 줌"
                    />
                    <button
                      type="button"
                      onClick={() => applyZoom(zoom + zoomRange.step * 2)}
                      style={zoomButtonStyle}
                      aria-label="줌 인"
                    >
                      +
                    </button>
                    <span style={zoomLabelStyle}>{zoom.toFixed(1)}×</span>
                  </div>
                )}

                <div style={bottomGuideTextStyle}>
                  시작할 때 분석할 선수를 중앙에 두세요 · 너무 당기지 말고 공이 오가는 흐름까지 함께
                </div>
              </div>
            </div>
          </div>

          <div style={controlRowStyle}>
            <button
              type="button"
              onClick={startCamera}
              disabled={isCameraLoading || isRecording}
              style={{
                ...secondaryButtonStyle,
                ...((isCameraLoading || isRecording) ? disabledButtonStyle : null),
              }}
            >
              카메라 시작
            </button>

            <button
              type="button"
              onClick={stopCamera}
              disabled={!isCameraReady || isRecording}
              style={{
                ...secondaryButtonStyle,
                ...((!isCameraReady || isRecording) ? disabledButtonStyle : null),
              }}
            >
              카메라 중지
            </button>

            <button
              type="button"
              onClick={startRecording}
              disabled={!isCameraReady || isRecording}
              style={{
                ...primaryButtonStyle,
                ...((!isCameraReady || isRecording) ? disabledButtonStyle : null),
              }}
            >
              녹화 시작
            </button>

            <button
              type="button"
              onClick={stopRecording}
              disabled={!isRecording}
              style={{
                ...dangerButtonStyle,
                ...(!isRecording ? disabledButtonStyle : null),
              }}
            >
              녹화 중지
            </button>
          </div>
        </section>

        {(statusMessage || errorMessage) && (
          <section
            style={{
              ...statusBoxStyle,
              ...(errorMessage ? statusErrorStyle : statusSuccessStyle),
            }}
          >
            <div style={statusTitleStyle}>{errorMessage ? '오류 안내' : '현재 상태'}</div>
            <div style={statusMessageStyle}>{errorMessage || statusMessage}</div>
            {isPipelineRunning && (
              <div style={pipelineBarWrapStyle}>
                <div
                  style={{
                    ...pipelineBarFillStyle,
                    width:
                      pipelineStep === 'uploading'
                        ? `${Math.max(4, uploadProgress)}%`
                        : '92%',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            )}
          </section>
        )}

        {isPipelineRunning && (
          <section style={pipelineOverlayCardStyle}>
            <div style={pipelineSpinnerStyle}>●</div>
            <h2 style={pipelineOverlayTitleStyle}>
              {pipelineStep === 'uploading'
                ? `영상 업로드 중 ${uploadProgress}%`
                : 'AI 분석 중'}
            </h2>
            <p style={pipelineOverlayDescStyle}>
              {pipelineStep === 'uploading'
                ? '촬영한 영상을 서버로 전송하고 있습니다. 업로드가 끝나면 자동으로 분석이 시작됩니다.'
                : '등록한 선수 중심으로 하이라이트를 추출하고 코치 피드백을 생성합니다. 화면을 켜 두어 주세요.'}
            </p>
          </section>
        )}

        <section style={previewPanelStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>녹화 결과 미리보기</h2>
            <span style={sectionHintStyle}>녹화 후 업로드 전에 확인 가능</span>
          </div>

          {hasRecordedVideo ? (
            <>
              <div style={recordInfoCardStyle}>
                <div style={recordInfoTitleStyle}>{recordedFile?.name || '녹화된 영상'}</div>
                <div style={recordInfoMetaStyle}>
                  길이: {formatDuration(recordSeconds)} · 크기: {formatFileSize(recordedFile?.size || 0)}
                </div>
                {(recordedFile?.size || 0) > LARGE_FILE_WARN_BYTES ? (
                  <div style={recordWarnStyle}>
                    ⚠ 영상 용량이 큽니다. 업로드가 오래 걸릴 수 있으니 와이파이 환경을 권장합니다.
                  </div>
                ) : (
                  <div style={recordTipStyle}>
                    💡 안정적인 업로드를 위해 와이파이 연결을 권장합니다. (최대 약 20분 권장)
                  </div>
                )}
              </div>

              <div style={previewWrapStyle}>
                <video
                  src={recordedPreviewUrl}
                  controls
                  playsInline
                  style={previewVideoStyle}
                />
              </div>

              <div style={uploadButtonRowStyle}>
                <button
                  type="button"
                  onClick={handleStartAnalysis}
                  disabled={!canStartAnalysis}
                  style={{
                    ...primaryButtonStyle,
                    ...(canStartAnalysis ? null : disabledButtonStyle),
                  }}
                >
                  {isPipelineRunning
                    ? '분석 진행 중...'
                    : errorMessage
                      ? '다시 분석 시도'
                      : 'AI 분석 시작'}
                </button>

                <button
                  type="button"
                  onClick={resetRecordedVideo}
                  disabled={isPipelineRunning}
                  style={{
                    ...secondaryButtonStyle,
                    ...(isPipelineRunning ? disabledButtonStyle : null),
                  }}
                >
                  다시 촬영
                </button>
              </div>
            </>
          ) : (
            <div style={emptyStateStyle}>
              아직 녹화된 영상이 없습니다. 녹화가 끝나면 자동으로 AI 분석이 시작됩니다.
            </div>
          )}
        </section>

        {uploadResult && pipelineStep === 'done' && (
          <section style={uploadDoneCardStyle}>
            <div style={sectionLabelStyle}>ANALYSIS COMPLETE</div>
            <h2 style={uploadDoneTitleStyle}>분석이 완료되었습니다</h2>
            <p style={uploadDoneDescStyle}>
              코치 피드백 화면으로 이동 중입니다. 잠시만 기다려 주세요.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top, rgba(255,159,2,0.10), transparent 28%), linear-gradient(180deg, #0a0a0d 0%, #111216 100%)',
  color: '#f7f7f8',
  padding: '14px 12px calc(28px + env(safe-area-inset-bottom))',
};

const containerStyle: CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const heroCardStyle: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,159,2,0.12), rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 18,
  padding: '16px 16px',
  boxShadow: '0 10px 24px rgba(0,0,0,0.22)',
};

const eyebrowStyle: CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(255,159,2,0.14)',
  color: '#FF9F02',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  marginBottom: 8,
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.15,
  fontWeight: 800,
};

const heroDescriptionStyle: CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  color: 'rgba(255,255,255,0.7)',
  fontSize: 13,
  lineHeight: 1.6,
};

const playerPanelStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 14,
  boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
};

const capturePanelStyle: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(17,20,30,0.96) 0%, rgba(11,13,21,0.98) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 18,
  padding: 14,
  boxShadow: '0 12px 30px rgba(0,0,0,0.26)',
};

const previewPanelStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 14,
  boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
};

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 18,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 800,
};

const sectionHintStyle: CSSProperties = {
  color: 'rgba(255,255,255,0.58)',
  fontSize: 13,
};

const changePlayerButtonStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: 36,
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid rgba(255,159,2,0.55)',
  background: 'rgba(255,159,2,0.14)',
  color: '#FFB347',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
};

const emptyStateButtonStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: 12,
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 12,
  border: 'none',
  background: '#FF9F02',
  color: '#171717',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
};

const sectionLabelStyle: CSSProperties = {
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  color: '#FF9F02',
  marginBottom: 10,
};

const playerCardStyle: CSSProperties = {
  borderRadius: 18,
  padding: 18,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
};

const playerNameStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  marginBottom: 14,
};

const playerMetaGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};

const uniformFieldStyle: CSSProperties = {
  marginTop: 12,
  padding: 14,
  borderRadius: 14,
  background: 'rgba(255,159,2,0.10)',
  border: '1px solid rgba(255,159,2,0.26)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const uniformLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: '#FFB648',
};

const uniformInputStyle: CSSProperties = {
  height: 48,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(0,0,0,0.25)',
  color: '#fff',
  padding: '0 14px',
  fontSize: 16,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const uniformHelpStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.55,
  color: 'rgba(255,255,255,0.7)',
};

const playerMetaItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 12,
  borderRadius: 14,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
};

const metaLabelStyle: CSSProperties = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.58)',
  fontWeight: 700,
};

const metaValueStyle: CSSProperties = {
  fontSize: 14,
  color: '#fff',
  lineHeight: 1.6,
  wordBreak: 'break-word',
};

const captureTopRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
  marginBottom: 18,
};

const captureTitleStyle: CSSProperties = {
  margin: '0 0 4px 0',
  fontSize: 18,
  fontWeight: 800,
};

const captureDescStyle: CSSProperties = {
  margin: 0,
  color: 'rgba(255,255,255,0.7)',
  fontSize: 13,
  lineHeight: 1.55,
};

const badgeRowStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'flex-start',
};

const badgeStyle: CSSProperties = {
  minHeight: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
};

const landscapeBadgeStyle: CSSProperties = {
  background: 'rgba(80, 200, 120, 0.14)',
  border: '1px solid rgba(80, 200, 120, 0.28)',
};

const landscapeHelperStyle: CSSProperties = {
  marginTop: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  background: 'rgba(255,159,2,0.10)',
  border: '1px solid rgba(255,159,2,0.26)',
};

const landscapeHelperButtonStyle: CSSProperties = {
  width: '100%',
  minHeight: 50,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 14,
  border: 'none',
  background: '#FF9F02',
  color: '#171717',
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
};

const landscapeHelperTextStyle: CSSProperties = {
  margin: 0,
  color: 'rgba(255,255,255,0.78)',
  fontSize: 12.5,
  lineHeight: 1.6,
};

const portraitBadgeStyle: CSSProperties = {
  background: 'rgba(255,159,2,0.14)',
  border: '1px solid rgba(255,159,2,0.28)',
};

const cameraFrameStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  borderRadius: 24,
  overflow: 'hidden',
  background: '#000',
  border: '1px solid rgba(255,255,255,0.08)',
  aspectRatio: '16 / 9',
};

const cameraVideoStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  background: '#000',
};

const cameraOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: 16,
};

const bottomStackStyle: CSSProperties = {
  alignSelf: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  maxWidth: 'min(92vw, 460px)',
};

const zoomControlStyle: CSSProperties = {
  pointerEvents: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.55)',
  border: '1px solid rgba(255,255,255,0.24)',
  backdropFilter: 'blur(8px)',
  maxWidth: 'min(86vw, 420px)',
};

const zoomButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  flexShrink: 0,
  borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.3)',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 20,
  fontWeight: 800,
  lineHeight: 1,
  cursor: 'pointer',
};

const zoomSliderStyle: CSSProperties = {
  width: 'clamp(120px, 40vw, 260px)',
  accentColor: '#FF9F02',
  cursor: 'pointer',
};

const zoomLabelStyle: CSSProperties = {
  minWidth: 42,
  textAlign: 'center',
  color: '#fff',
  fontSize: 13,
  fontWeight: 800,
};

const topHintPillStyle: CSSProperties = {
  alignSelf: 'center',
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.52)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  backdropFilter: 'blur(8px)',
};

const captureGuideStyle: CSSProperties = {
  alignSelf: 'center',
  pointerEvents: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '14px 22px',
  borderRadius: 18,
  background: 'rgba(0,0,0,0.62)',
  border: '1px solid rgba(255,159,2,0.5)',
  backdropFilter: 'blur(8px)',
  textAlign: 'center',
  maxWidth: 'min(88vw, 460px)',
};

const captureGuideTitleStyle: CSSProperties = {
  color: '#fff',
  fontSize: 16,
  fontWeight: 800,
  lineHeight: 1.4,
};

const captureGuideCountStyle: CSSProperties = {
  color: '#FF9F02',
  fontSize: 52,
  fontWeight: 900,
  lineHeight: 1.05,
};

const captureGuideSubStyle: CSSProperties = {
  color: 'rgba(255,255,255,0.82)',
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.5,
};

const landscapeExitButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 5,
  pointerEvents: 'auto',
  minHeight: 40,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 14px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.62)',
  border: '1px solid rgba(255,255,255,0.28)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
};

const rotateOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(6, 8, 14, 0.64)',
  backdropFilter: 'blur(10px)',
  padding: 20,
  pointerEvents: 'auto',
};

const rotateButtonRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginTop: 18,
};

const rotatePrimaryButtonStyle: CSSProperties = {
  minHeight: 48,
  borderRadius: 14,
  border: 'none',
  background: '#FF9F02',
  color: '#171717',
  fontSize: 15,
  fontWeight: 800,
  cursor: 'pointer',
};

const rotateGhostButtonStyle: CSSProperties = {
  minHeight: 44,
  borderRadius: 14,
  background: 'transparent',
  color: 'rgba(255,255,255,0.78)',
  border: '1px solid rgba(255,255,255,0.2)',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const rotateCardStyle: CSSProperties = {
  width: 'min(92%, 380px)',
  borderRadius: 22,
  background: 'rgba(15,18,28,0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 18px 44px rgba(0,0,0,0.35)',
  padding: '22px 20px',
  textAlign: 'center',
};

const rotateIconStyle: CSSProperties = {
  fontSize: 34,
  marginBottom: 8,
};

const rotateTitleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  marginBottom: 8,
};

const rotateDescStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  color: 'rgba(255,255,255,0.72)',
};

const guideFrameStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  // 선수만 작게 잡도록 가이드를 줄여 주변 경기 공간(흐름)이 충분히 보이게 함
  width: '20%',
  height: '50%',
  minWidth: 84,
  maxWidth: 180,
  minHeight: 150,
  borderRadius: 18,
  border: '2px dashed rgba(255,159,2,0.75)',
  boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
};

const guideLabelStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: -18,
  transform: 'translateX(-50%)',
  minHeight: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  background: 'rgba(255,159,2,0.96)',
  color: '#171717',
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const bottomGuideTextStyle: CSSProperties = {
  alignSelf: 'center',
  minHeight: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.52)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  backdropFilter: 'blur(8px)',
};

const controlRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
  marginTop: 14,
};

const baseButtonStyle: CSSProperties = {
  minHeight: 52,
  borderRadius: 14,
  border: 'none',
  padding: '0 14px',
  fontSize: 15,
  fontWeight: 800,
  cursor: 'pointer',
  width: '100%',
};

const primaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: '#FF9F02',
  color: '#171717',
};

const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.10)',
};

const outlineButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: 'transparent',
  color: '#FF9F02',
  border: '1px solid rgba(255,159,2,0.45)',
};

const dangerButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: '#ff6b57',
  color: '#fff',
};

const disabledButtonStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.36)',
  border: '1px solid rgba(255,255,255,0.08)',
  cursor: 'not-allowed',
};

const statusBoxStyle: CSSProperties = {
  borderRadius: 18,
  padding: '18px 18px',
  border: '1px solid rgba(255,159,2,0.25)',
};

const statusSuccessStyle: CSSProperties = {
  background: 'rgba(255,159,2,0.14)',
};

const statusErrorStyle: CSSProperties = {
  background: 'rgba(255,120,80,0.14)',
  border: '1px solid rgba(255,120,80,0.24)',
};

const statusTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: '#FF9F02',
  marginBottom: 8,
};

const statusMessageStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  color: '#fff',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const recordInfoCardStyle: CSSProperties = {
  borderRadius: 16,
  padding: 16,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  marginBottom: 14,
};

const recordInfoTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  marginBottom: 8,
};

const recordInfoMetaStyle: CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.76)',
  lineHeight: 1.7,
};

const recordTipStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: 'rgba(255,255,255,0.55)',
  lineHeight: 1.6,
};

const recordWarnStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 12.5,
  fontWeight: 600,
  color: '#ffd27a',
  lineHeight: 1.6,
};

const previewWrapStyle: CSSProperties = {
  borderRadius: 18,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.08)',
  background: '#000',
};

const previewVideoStyle: CSSProperties = {
  width: '100%',
  display: 'block',
  background: '#000',
  maxHeight: 560,
};

const uploadButtonRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
  marginTop: 14,
};

const emptyStateStyle: CSSProperties = {
  padding: 18,
  borderRadius: 16,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.72)',
  fontSize: 14,
  lineHeight: 1.7,
};

const uploadDoneCardStyle: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,159,2,0.12), rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 24,
  padding: '24px 22px',
  boxShadow: '0 18px 40px rgba(0,0,0,0.25)',
};

const uploadDoneTitleStyle: CSSProperties = {
  margin: '0 0 10px 0',
  fontSize: 28,
  fontWeight: 800,
};

const uploadDoneDescStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.7,
  color: 'rgba(255,255,255,0.74)',
};

const uploadDoneButtonRowStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  marginTop: 18,
};

const pipelineBarWrapStyle: CSSProperties = {
  marginTop: 14,
  height: 8,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.08)',
  overflow: 'hidden',
};

const pipelineBarFillStyle: CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(90deg, #FF9F02, #FFD56A)',
  transition: 'width 0.6s ease',
};

const pipelineOverlayCardStyle: CSSProperties = {
  borderRadius: 22,
  padding: '24px 20px',
  background: 'rgba(255,159,2,0.10)',
  border: '1px solid rgba(255,159,2,0.28)',
  textAlign: 'center',
};

const pipelineSpinnerStyle: CSSProperties = {
  fontSize: 28,
  color: '#FF9F02',
  marginBottom: 10,
  animation: 'pulse 1.2s ease-in-out infinite',
};

const pipelineOverlayTitleStyle: CSSProperties = {
  margin: '0 0 8px 0',
  fontSize: 22,
  fontWeight: 800,
};

const pipelineOverlayDescStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.7,
  color: 'rgba(255,255,255,0.74)',
};
