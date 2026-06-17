import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  runMobileAnalysisPipeline,
  type AiAnalysisPayload,
  type AnalysisPipelineStep,
} from '../lib/analysisFlow';
import { type SelectedPlayer } from '../lib/api';

const SELECTED_PLAYER_STORAGE_KEYS = [
  'highlight-selected-player',
  'selected-highlight-player',
];

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
  const [uploadResult, setUploadResult] = useState<UploadResponseData | null>(null);
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= window.innerHeight : true,
  );

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
  }, [navigate]);

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

    await releaseWakeLock();
    setStatusMessage('카메라를 중지했습니다.');
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
        stopTimer();
        void releaseWakeLock();
      };

      recorder.start(1000);
      setRecordSeconds(0);
      setIsRecording(true);
      setStatusMessage('녹화 중입니다. 선수가 중앙 가이드 박스 안에 계속 오도록 유지해 주세요.');
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
      setPipelineStep('uploading');
      setErrorMessage('');
      setStatusMessage(PIPELINE_LABELS.uploading);

      const payload: AiAnalysisPayload = await runMobileAnalysisPipeline(
        file,
        selectedPlayer,
        {
          captureMode: 'landscape-player-focus',
          deviceOrientation: isLandscape ? 'landscape' : 'portrait',
        },
        (step) => {
          setPipelineStep(step);
          if (step === 'analyzing') {
            setStatusMessage(PIPELINE_LABELS.analyzing);
          }
        },
      );

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
        <section style={heroCardStyle}>
          <div style={eyebrowStyle}>MOBILE LANDSCAPE CAPTURE</div>
          <h1 style={heroTitleStyle}>가로 선수 촬영</h1>
          <p style={heroDescriptionStyle}>
            선수는 <strong>중앙 가이드 박스</strong> 안에 두고,
            화면은 <strong>가로 프레임</strong>으로 넓게 확보해 경기 좌우 흐름까지 함께 담도록 설계했습니다.
            이렇게 촬영하면 이후 AI 분석에서 선수 움직임과 주변 전개를 함께 보기 더 좋습니다.
          </p>
        </section>

        <section style={playerPanelStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>선택된 선수 정보</h2>
            <span style={sectionHintStyle}>선수등록 페이지에서 저장한 선수 기준으로 촬영</span>
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
                <div style={playerMetaItemStyle}>
                  <div style={metaLabelStyle}>유니폼 색</div>
                  <div style={metaValueStyle}>{selectedPlayer.uniformColor || '-'}</div>
                </div>
                <div style={playerMetaItemStyle}>
                  <div style={metaLabelStyle}>식별 힌트</div>
                  <div style={metaValueStyle}>{selectedPlayer.traits || '-'}</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={emptyStateStyle}>
              아직 선택된 선수 정보가 없습니다. 먼저 선수등록 페이지에서 선수를 저장하거나 불러와 주세요.
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

          <div style={cameraFrameStyle}>
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={cameraVideoStyle}
            />

            <div style={cameraOverlayStyle}>
              <div style={topHintPillStyle}>
                선수를 중앙 가이드 안에 맞춰 주세요
              </div>

              {!isLandscape && (
                <div style={rotateOverlayStyle}>
                  <div style={rotateCardStyle}>
                    <div style={rotateIconStyle}>↻</div>
                    <div style={rotateTitleStyle}>휴대폰을 가로로 돌려 주세요</div>
                    <div style={rotateDescStyle}>
                      가로 촬영이 선수 중심 추적과 경기 좌우 흐름 확인에 더 유리합니다.
                    </div>
                  </div>
                </div>
              )}

              <div style={guideFrameStyle}>
                <div style={guideLabelStyle}>선수 중심 가이드</div>
              </div>

              <div style={bottomGuideTextStyle}>
                중앙은 선수 식별, 좌우는 경기 흐름 확인
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
                    width: pipelineStep === 'uploading' ? '35%' : '78%',
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
              {pipelineStep === 'uploading' ? '영상 업로드 중' : 'AI 분석 중'}
            </h2>
            <p style={pipelineOverlayDescStyle}>
              {pipelineStep === 'uploading'
                ? '촬영한 영상을 서버로 전송하고 있습니다.'
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
                  {isPipelineRunning ? '분석 진행 중...' : 'AI 분석 시작'}
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
  padding: '24px 16px 80px',
};

const containerStyle: CSSProperties = {
  maxWidth: 1240,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const heroCardStyle: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,159,2,0.12), rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 24,
  padding: '28px 24px',
  boxShadow: '0 18px 40px rgba(0,0,0,0.25)',
};

const eyebrowStyle: CSSProperties = {
  display: 'inline-block',
  padding: '6px 12px',
  borderRadius: 999,
  background: 'rgba(255,159,2,0.14)',
  color: '#FF9F02',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  marginBottom: 14,
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(28px, 4vw, 44px)',
  lineHeight: 1.1,
  fontWeight: 800,
};

const heroDescriptionStyle: CSSProperties = {
  marginTop: 12,
  marginBottom: 0,
  color: 'rgba(255,255,255,0.74)',
  fontSize: 15,
  lineHeight: 1.7,
  maxWidth: 900,
};

const playerPanelStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 22,
  padding: 22,
  boxShadow: '0 16px 32px rgba(0,0,0,0.20)',
};

const capturePanelStyle: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(17,20,30,0.96) 0%, rgba(11,13,21,0.98) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 24,
  padding: 20,
  boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
};

const previewPanelStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 22,
  padding: 22,
  boxShadow: '0 16px 32px rgba(0,0,0,0.20)',
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
  fontSize: 22,
  fontWeight: 800,
};

const sectionHintStyle: CSSProperties = {
  color: 'rgba(255,255,255,0.58)',
  fontSize: 13,
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
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
  margin: '0 0 8px 0',
  fontSize: 'clamp(24px, 3vw, 32px)',
  fontWeight: 800,
};

const captureDescStyle: CSSProperties = {
  margin: 0,
  color: 'rgba(255,255,255,0.72)',
  fontSize: 15,
  lineHeight: 1.7,
  maxWidth: 760,
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

const rotateOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(6, 8, 14, 0.64)',
  backdropFilter: 'blur(10px)',
  padding: 20,
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
  width: '30%',
  height: '68%',
  minWidth: 120,
  maxWidth: 260,
  borderRadius: 24,
  border: '3px solid rgba(255,159,2,0.95)',
  boxShadow:
    '0 0 0 9999px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 24px rgba(255,159,2,0.35)',
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
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  marginTop: 18,
};

const baseButtonStyle: CSSProperties = {
  minHeight: 50,
  borderRadius: 14,
  border: 'none',
  padding: '0 18px',
  fontSize: 15,
  fontWeight: 800,
  cursor: 'pointer',
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
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  marginTop: 16,
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
