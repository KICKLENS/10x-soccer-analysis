import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Film,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchJson, readSelectedPlayer, readSelectedPlayerPosition, toAbsoluteUrl } from '../lib/api';
import { saveAnalysisToHistory } from '../lib/analysisHistory';
import { uploadVideoFile, type AiAnalysisPayload as HistoryAiAnalysisPayload } from '../lib/analysisFlow';
import PageNav from '../components/PageNav';
import SeedFrameStrip from '../components/SeedFrameStrip';
import { saveHighlightWorkflow } from '../lib/highlightWorkflow';

const UPLOAD_ENDPOINT = '/api/upload';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 비동기 작업(job) 상태를 폴링한다. 네트워크 일시 오류는 재시도, 작업 자체 오류는 전파.
async function pollJob<T = unknown>(
  jobId: string,
  onStage?: (stage: string, progress?: number) => void,
): Promise<T> {
  let fails = 0;
  let notFound = 0;
  for (;;) {
    await sleep(4000);
    try {
      const s = await fetchJson<{
        status: string;
        stage?: string;
        progress?: number;
        result?: T;
        error?: string;
      }>(`/api/jobs/${jobId}`, { method: 'GET' });
      fails = 0;
      notFound = 0;
      if (s.stage) onStage?.(s.stage, s.progress);
      if (s.status === 'done') return s.result as T;
      if (s.status === 'error') {
        const err = new Error(s.error || '작업 처리 중 오류가 발생했습니다.') as Error & { jobError?: boolean };
        err.jobError = true;
        throw err;
      }
    } catch (e) {
      if ((e as { jobError?: boolean })?.jobError) throw e;
      // 404 = 서버가 작업을 잃어버림(재시작 등). 네트워크 끊김과 구분해 처리.
      if ((e as { status?: number })?.status === 404) {
        notFound += 1;
        if (notFound >= 3) {
          const err = new Error(
            '작업 정보를 찾을 수 없습니다. 서버가 재시작되었을 수 있어요. 다시 시도해 주세요.',
          ) as Error & { jobError?: boolean; jobGone?: boolean };
          err.jobError = true;
          err.jobGone = true;
          throw err;
        }
        continue;
      }
      fails += 1;
      if (fails >= 15) {
        throw new Error('인터넷 연결이 불안정합니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
      }
    }
  }
}

// 진행 중인 작업을 기억해 페이지를 닫았다 와도 이어받는다.
const ACTIVE_JOB_KEY = 'active-extract-job';

function saveActiveJob(jobId: string, fileName: string) {
  try {
    localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({ jobId, fileName, ts: Date.now() }));
  } catch {
    /* noop */
  }
}

function clearActiveJob() {
  try {
    localStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {
    /* noop */
  }
}

function readActiveJob(): { jobId: string; fileName?: string } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_JOB_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j?.jobId || Date.now() - (j.ts || 0) > 60 * 60 * 1000) {
      localStorage.removeItem(ACTIVE_JOB_KEY);
      return null;
    }
    return j;
  } catch {
    return null;
  }
}

// 완료 알림(권한 허용 시). PWA/모바일은 서비스워커 알림을 우선 사용.
async function ensureNotifyPermission(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const p = await Notification.requestPermission();
    return p === 'granted';
  } catch {
    return false;
  }
}

async function showNotif(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' });
        return;
      }
    }
    new Notification(title, { body, icon: '/icon-192.png' });
  } catch {
    /* noop */
  }
}
const HEALTH_ENDPOINT = '/api/health';

const PAGE_BG = '#070b14';
const CARD_BG = 'linear-gradient(180deg, rgba(14,19,33,0.96) 0%, rgba(10,14,26,0.98) 100%)';
const STROKE = 'rgba(255,255,255,0.08)';
const TEXT_SUB = 'rgba(225,231,242,0.72)';

type HighlightClip = {
  id?: string;
  url?: string;
  clipUrl?: string;
  outputUrl?: string;
  start?: number | string;
  end?: number | string;
  startTime?: number | string;
  endTime?: number | string;
  duration?: number | string;
  fileName?: string;
  filename?: string;
  label?: string;
  reason?: string;
  coachComment?: string;
};

type UploadResponse = {
  success?: boolean;
  fileName?: string;
  savedFilename?: string;
  videoUrl?: string;
  analysisId?: string;
  message?: string;
};

type ExtractResponse = {
  success?: boolean;
  clips?: HighlightClip[];
  mergedHighlightUrl?: string;
  highlightVideoUrl?: string;
  jobId?: string;
  message?: string;
  summary?: {
    noticeableScene?: string;
    strength?: string;
    weakness?: string;
    trainingPoint?: string;
    nextTrainingPoint?: string;
  };
};

type HealthResponse = {
  success?: boolean;
  message?: string;
  ffmpegAvailable?: boolean;
  ffprobeAvailable?: boolean;
};

type AiAnalysisPayload = {
  uploadedVideoUrl?: string;
  highlightVideoUrl?: string;
  highlightClips?: HighlightClip[];
  uploadedVideoFileName?: string;
  analysisId?: string;
  jobId?: string;
  summary?: ExtractResponse['summary'];
  position?: string;
};

type NormalizedClip = {
  id: string;
  url: string;
  start: number;
  end: number;
  duration: number;
  fileName: string;
  label: string;
  reason: string;
  coachComment: string;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function ActionButton({
  children,
  onClick,
  variant = 'outline',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'outline' | 'dark';
  disabled?: boolean;
}) {
  const className =
    'inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-[15px] font-semibold transition-all duration-300';

  let style: CSSProperties = {
    borderColor: 'rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.03)',
    color: '#fff',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 16px 34px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
  };

  if (variant === 'primary') {
    style = {
      borderColor: 'rgba(255,210,120,0.52)',
      background:
        'linear-gradient(180deg, rgba(255,197,92,1) 0%, rgba(255,159,2,1) 55%, rgba(233,131,0,1) 100%)',
      color: '#000',
      boxShadow: '0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
    };
  } else if (variant === 'dark') {
    style = {
      borderColor: 'rgba(255,255,255,0.12)',
      background:
        'linear-gradient(180deg, rgba(38,44,60,0.96) 0%, rgba(20,24,37,0.98) 100%)',
      color: '#fff',
      boxShadow: '0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
    };
  }

  if (disabled) {
    style = {
      ...style,
      opacity: 0.5,
      cursor: 'not-allowed',
    };
  }

  return (
    <button type="button" onClick={onClick} className={className} style={style} disabled={disabled}>
      {children}
    </button>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-3xl border p-4 md:rounded-[30px] md:p-6"
      style={{
        borderColor: STROKE,
        background: CARD_BG,
        boxShadow: '0 22px 48px rgba(0,0,0,0.24)',
      }}
    >
      <div className="mb-4 md:mb-5">
        <h2 className="text-lg font-bold text-white md:text-xl">{title}</h2>
        {description ? (
          <p className="mt-2 text-[13px] leading-6 md:text-sm md:leading-7" style={{ color: TEXT_SUB }}>
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
      <span className="text-sm text-white/52">{label}</span>
      <span className="max-w-[65%] break-all text-right text-sm text-white">{value}</span>
    </div>
  );
}

export default function VideoAnalysisPage() {
  const navigate = useNavigate();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>('');

  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string>('');
  const [uploadedVideoFileName, setUploadedVideoFileName] = useState<string>('');
  const [analysisId, setAnalysisId] = useState<string>('');

  const [highlightVideoUrl, setHighlightVideoUrl] = useState<string>('');
  const [highlightClips, setHighlightClips] = useState<HighlightClip[]>([]);
  const [highlightJobId, setHighlightJobId] = useState<string>('');
  const [coachSummary, setCoachSummary] = useState<ExtractResponse['summary'] | null>(null);
  const [analysisPosition, setAnalysisPosition] = useState<string>(readSelectedPlayerPosition());
  const [selectedPlayer, setSelectedPlayer] = useState(readSelectedPlayer());

  const [serverHealthMessage, setServerHealthMessage] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [isCheckingServer, setIsCheckingServer] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  // 업로드 영상에서 분석 대상 선수를 직접 지정(탭)하기 위한 상태
  const [seedFrames, setSeedFrames] = useState<{ url: string; timeSec: number }[]>([]);
  const [activeSeedFrame, setActiveSeedFrame] = useState<{ url: string; timeSec: number } | null>(null);
  // 다중 프레임 탭 지원: 프레임별로 하나씩 탭 위치 저장
  const [seeds, setSeeds] = useState<{ nx: number; ny: number; timeSec: number }[]>([]);
  const [isLoadingSeedFrames, setIsLoadingSeedFrames] = useState<boolean>(false);
  const [showSeedOverlay, setShowSeedOverlay] = useState<boolean>(false);
  // 하위 호환: 단일 seed (첫 번째 seeds 항목 또는 null)
  const seed = seeds.length > 0 ? seeds[0] : null;

  // 프레임이 바뀔 때마다 오버레이를 3초간 표시
  useEffect(() => {
    if (!activeSeedFrame) return;
    const alreadyTapped = seeds.some((s) => s.timeSec === activeSeedFrame.timeSec);
    if (alreadyTapped) return;
    setShowSeedOverlay(true);
    const t = setTimeout(() => setShowSeedOverlay(false), 3000);
    return () => clearTimeout(t);
  }, [activeSeedFrame]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const normalizedClips = useMemo<NormalizedClip[]>(() => {
    return highlightClips.map((clip: HighlightClip, index: number) => {
      const rawUrl = clip.url || clip.clipUrl || clip.outputUrl || '';
      const start = toNumber(clip.start ?? clip.startTime, 0);
      const end = toNumber(clip.end ?? clip.endTime, 0);
      const duration = toNumber(clip.duration, end > start ? end - start : 0);
      const fileName = clip.fileName || clip.filename || `clip-${index + 1}.mp4`;

      return {
        id: clip.id || `${index}-${rawUrl || fileName}`,
        url: toAbsoluteUrl(rawUrl),
        start,
        end,
        duration,
        fileName,
        label: clip.label || `주요 장면 ${index + 1}`,
        reason: clip.reason || '',
        coachComment: clip.coachComment || '',
      };
    });
  }, [highlightClips]);

  const totalHighlightDuration = useMemo<number>(() => {
    return normalizedClips.reduce((sum: number, clip: NormalizedClip) => {
      return sum + Math.max(0, clip.duration);
    }, 0);
  }, [normalizedClips]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    setErrorMessage('');
    setStatusMessage('');

    if (!file) {
      setSelectedFile(null);
      setLocalPreviewUrl('');
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);

    setSelectedFile(file);
    setLocalPreviewUrl(nextPreviewUrl);

    setUploadedVideoUrl('');
    setUploadedVideoFileName('');
    setAnalysisId('');

    setHighlightVideoUrl('');
    setHighlightClips([]);
    setHighlightJobId('');

    setSeedFrames([]);
    setActiveSeedFrame(null);
    setSeeds([]);
  };

  const handleCheckServer = async () => {
    setIsCheckingServer(true);
    setErrorMessage('');
    setServerHealthMessage('');

    try {
      await fetchJson<HealthResponse>(HEALTH_ENDPOINT, { method: 'GET' });
      setServerHealthMessage('분석 환경이 정상적으로 준비되었습니다.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '서버 상태 확인 중 오류가 발생했습니다.');
    } finally {
      setIsCheckingServer(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('먼저 업로드할 영상을 선택해주세요.');
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setStatusMessage('영상을 업로드하고 있습니다...');

    try {
      // 대용량/모바일에서도 끊기지 않도록 진행률·긴 타임아웃이 있는 XHR 업로더 사용
      const player = readSelectedPlayer();
      const uploaded = await uploadVideoFile(
        selectedFile,
        player,
        undefined,
        (percent) => setStatusMessage(`영상을 업로드하고 있습니다... ${percent}%`),
      );

      const nextVideoUrl = toAbsoluteUrl(uploaded.videoUrl || '');
      const nextFileName = uploaded.fileName || selectedFile.name || '';
      const nextAnalysisId = uploaded.analysisId || '';

      if (!nextVideoUrl) {
        throw new Error('업로드는 완료되었지만 재생 가능한 영상 정보를 찾지 못했습니다.');
      }

      setUploadedVideoUrl(nextVideoUrl);
      setUploadedVideoFileName(nextFileName);
      setAnalysisId(nextAnalysisId);
      setAnalysisPosition(readSelectedPlayerPosition());
      setSelectedPlayer(readSelectedPlayer());

      setHighlightVideoUrl('');
      setHighlightClips([]);
      setHighlightJobId('');
      setCoachSummary(null);

      setSeedFrames([]);
      setActiveSeedFrame(null);
      setSeeds([]);

      setStatusMessage('업로드가 완료되었습니다. 멀리서/예전에 찍은 영상이라면 아래에서 분석할 선수를 직접 지정하면 정확도가 올라갑니다.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다.');
      setStatusMessage('');
    } finally {
      setIsUploading(false);
    }
  };

  const persistWorkflowPayload = (
    clips: HighlightClip[],
    mergedUrl: string,
    jobId: string,
    summary: ExtractResponse['summary'] | null,
  ) => {
    saveHighlightWorkflow({
      uploadedVideoUrl: uploadedVideoUrl || '',
      uploadedVideoFileName: uploadedVideoFileName || '',
      highlightVideoUrl: mergedUrl,
      highlightClips: clips,
      analysisId: analysisId || '',
      jobId,
      seeds: seeds.length > 0 ? seeds : undefined,
      player: selectedPlayer,
      position: analysisPosition || readSelectedPlayerPosition(),
      summary: summary || undefined,
    });
  };

  // 시작된 추출 작업을 끝까지 따라가 결과를 채운다(페이지 복귀 시에도 재사용).
  const consumeExtractJob = async (jobId: string, opts?: { resume?: boolean }) => {
    setIsExtracting(true);
    setErrorMessage('');
    try {
      const data = await pollJob<ExtractResponse>(jobId, (stage, progress) =>
        setStatusMessage(
          `주요 장면 추출 중: ${stage}${typeof progress === 'number' ? ` (${progress}%)` : ''}`,
        ),
      );

      const nextClips = Array.isArray(data.clips) ? data.clips : [];
      const mergedUrl = toAbsoluteUrl(data.mergedHighlightUrl || data.highlightVideoUrl || '');

      if (nextClips.length === 0) {
        throw new Error('주요 장면을 추출하지 못했습니다. 다른 영상으로 다시 시도해주세요.');
      }

      setHighlightClips(nextClips);
      setHighlightVideoUrl(mergedUrl);
      setHighlightJobId(jobId);
      setCoachSummary(data.summary || null);
      persistWorkflowPayload(nextClips, mergedUrl, jobId, data.summary || null);
      setStatusMessage(
        data.message ||
          '주요 장면 추출이 완료되었습니다. 아래에서 클립별로 확인하거나 AI 영상분석으로 이어가세요.',
      );
      clearActiveJob();
      void showNotif('장면 추출 완료! ⚽', '클립을 확인하거나 AI 코치 분석을 진행해 보세요.');
    } catch (error) {
      clearActiveJob();
      const gone = (error as { jobGone?: boolean })?.jobGone;
      // 페이지 복귀 시 이미 사라진 옛 작업이면 조용히 정리(놀라게 하지 않음)
      if (opts?.resume && gone) {
        setStatusMessage('');
      } else {
        setErrorMessage(error instanceof Error ? error.message : '주요 장면 추출 중 오류가 발생했습니다.');
        setStatusMessage('');
        void showNotif('장면 추출 실패', '다시 시도해 주세요.');
      }
    } finally {
      setIsExtracting(false);
    }
  };

  // 업로드 영상에서 선수 지정용 후보 프레임을 불러온다.
  const loadSeedFrames = async () => {
    if (!uploadedVideoFileName) {
      setErrorMessage('먼저 영상을 업로드해주세요.');
      return;
    }
    setIsLoadingSeedFrames(true);
    setErrorMessage('');
    try {
      const data = await fetchJson<{ frames?: { url: string; timeSec: number }[] }>(
        '/api/videos/seed-frames',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ savedFilename: uploadedVideoFileName, count: 10 }),
        },
      );
      const frames = (data.frames || []).map((f) => ({ url: toAbsoluteUrl(f.url), timeSec: f.timeSec }));
      if (!frames.length) throw new Error('프레임을 추출하지 못했습니다.');
      setSeedFrames(frames);
      setActiveSeedFrame(frames[0] || null);
      setSeeds([]);
      setStatusMessage('여러 장면에서 분석할 선수를 탭하세요. 많이 탭할수록 추적 정확도가 올라갑니다.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '프레임을 불러오지 못했습니다.');
    } finally {
      setIsLoadingSeedFrames(false);
    }
  };

  // 확대된 프레임에서 선수를 탭하면 해당 프레임의 시드를 추가/교체
  // 이미 탭된 프레임을 다시 탭하면 선택 해제(토글)
  const handleSeedTap = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!activeSeedFrame) return;
    const alreadyTapped = seeds.some((s) => s.timeSec === activeSeedFrame.timeSec);
    if (alreadyTapped) {
      // 두 번째 탭 → 선택 해제 + 오버레이 다시 표시
      setSeeds((prev) => prev.filter((s) => s.timeSec !== activeSeedFrame.timeSec));
      setShowSeedOverlay(true);
      setTimeout(() => setShowSeedOverlay(false), 3000);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setShowSeedOverlay(false); // 탭 즉시 오버레이 숨김
    setSeeds((prev) => [...prev, { nx, ny, timeSec: activeSeedFrame.timeSec }]);
  };

  // 특정 프레임의 시드 제거
  const removeSeedForFrame = (timeSec: number) => {
    setSeeds((prev) => prev.filter((s) => s.timeSec !== timeSec));
  };

  const handleExtractHighlights = async () => {
    if (!uploadedVideoFileName) {
      setErrorMessage('먼저 영상을 업로드해주세요.');
      return;
    }

    setErrorMessage('');
    setStatusMessage('주요 장면 추출을 시작합니다...');
    await ensureNotifyPermission();

    let jobId = '';
    try {
      const player = readSelectedPlayer();
      const start = await fetchJson<{ jobId?: string }>('/api/jobs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: uploadedVideoFileName,
          savedFilename: uploadedVideoFileName,
          ...player,
          player,
          seed: seed || undefined,
          seeds: seeds.length > 0 ? seeds : undefined,
        }),
      });
      if (!start.jobId) throw new Error('주요 장면 추출 작업을 시작하지 못했습니다.');
      jobId = start.jobId;
      saveActiveJob(jobId, uploadedVideoFileName);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '주요 장면 추출을 시작하지 못했습니다.');
      setStatusMessage('');
      return;
    }

    await consumeExtractJob(jobId);
  };

  // 페이지를 닫았다 다시 와도 진행 중이던 추출 작업을 이어서 확인한다.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const active = readActiveJob();
    if (active?.jobId) {
      setStatusMessage('이전에 시작한 주요 장면 추출을 이어서 확인하는 중입니다...');
      void consumeExtractJob(active.jobId, { resume: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoToAiAnalysis = () => {
    if (normalizedClips.length === 0) {
      setErrorMessage('먼저 주요 장면을 추출해주세요.');
      return;
    }

    const payload: AiAnalysisPayload = {
      uploadedVideoUrl: uploadedVideoUrl || '',
      highlightVideoUrl: highlightVideoUrl || '',
      highlightClips: Array.isArray(highlightClips) ? highlightClips : [],
      uploadedVideoFileName: uploadedVideoFileName || '',
      analysisId: analysisId || '',
      jobId: highlightJobId || '',
      summary: coachSummary || undefined,
      position: analysisPosition || readSelectedPlayerPosition(),
      player: selectedPlayer,
    };

    saveHighlightWorkflow({
      ...payload,
      seeds: seeds.length > 0 ? seeds : undefined,
    });

    try {
      sessionStorage.setItem('ai-analysis-payload', JSON.stringify(payload));
    } catch (error) {
      console.warn('sessionStorage 저장 실패:', error);
    }

    saveAnalysisToHistory(payload as unknown as HistoryAiAnalysisPayload);

    navigate('/ai-video-analysis', {
      state: payload,
    });
  };

  return (
    <main className="min-h-screen text-white" style={{ background: PAGE_BG }}>
      <div className="mx-auto w-full max-w-[1480px] px-3 py-5 md:px-6 md:py-10 lg:px-10 lg:py-12 pb-[calc(28px+env(safe-area-inset-bottom))]">
        <div className="mb-4">
          <PageNav />
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/48 md:text-[12px] md:tracking-[0.32em]">
              VIDEO HIGHLIGHT STUDIO
            </p>
            <h1 className="mt-2 text-2xl font-extrabold leading-[1.12] text-white md:mt-3 md:text-5xl">
              경기 영상 분석
            </h1>
            <p className="mt-3 max-w-[860px] text-[13px] leading-6 md:mt-4 md:text-[16px] md:leading-7" style={{ color: TEXT_SUB }}>
              영상을 업로드하고 선수를 지정한 뒤 AI가 핵심 장면(클립)을 추출합니다. 클립별로 확인하고
              AI 코치 분석으로 이어갈 수 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap">
            <ActionButton onClick={() => navigate('/')}>
              <ArrowLeft size={16} />
              홈으로
            </ActionButton>

            <ActionButton onClick={handleCheckServer} variant="dark" disabled={isCheckingServer}>
              {isCheckingServer ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              분석 환경 확인
            </ActionButton>
          </div>
        </div>

        {serverHealthMessage ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            {serverHealthMessage}
          </div>
        ) : null}

        {statusMessage ? (
          <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
            {statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        {/* 촬영 가이드 */}
        <div className="mt-6 rounded-2xl border border-[#FF9F02]/30 bg-[#FF9F02]/8 p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">📹</span>
            <div>
              <p className="text-sm font-semibold text-[#FF9F02] mb-2">정확한 분석을 위한 촬영 가이드</p>
              <div className="grid gap-1.5 text-xs text-white/70">
                <div className="flex items-start gap-2"><span className="text-[#FF9F02] shrink-0">①</span><span><strong className="text-white/90">거리</strong> — 선수와 공이 함께 보일 정도로 조금 멀리서 찍어요 (너무 가까우면 공이 안 보여요)</span></div>
                <div className="flex items-start gap-2"><span className="text-[#FF9F02] shrink-0">②</span><span><strong className="text-white/90">처음 3초</strong> — 분석할 선수를 화면 가운데에 크게 잡아주세요 (선수 지정에 사용돼요)</span></div>
                <div className="flex items-start gap-2"><span className="text-[#FF9F02] shrink-0">③</span><span><strong className="text-white/90">길이</strong> — 최소 5분 이상, 선수가 공을 직접 다루는 장면이 많을수록 좋아요</span></div>
                <div className="flex items-start gap-2"><span className="text-[#FF9F02] shrink-0">④</span><span><strong className="text-white/90">선수 지정</strong> — 업로드 후 아래 "장면 불러오기"에서 선수를 직접 탭하면 정확도가 크게 올라가요</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionCard
            title="1. 영상 업로드"
            description="경기 영상을 업로드하면 AI 분석을 위한 준비가 자동으로 진행되며, 이후 주요 장면 추출과 AI 코치 분석 단계로 이어집니다."
          >
            <div className="space-y-5">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.02] p-4">
                <label className="mb-3 block text-sm font-semibold text-white">영상 파일 선택</label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-white file:mr-4 file:rounded-xl file:border-0 file:bg-[#FF9F02] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
                />

                {selectedFile ? (
                  <div className="mt-3 text-sm text-white/72">
                    선택 파일: {selectedFile.name} · {formatFileSize(selectedFile.size)}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <ActionButton onClick={handleUpload} variant="primary" disabled={!selectedFile || isUploading}>
                  {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {isUploading ? '업로드 중' : '영상 업로드'}
                </ActionButton>
              </div>

              <div className="grid gap-3">
                <InfoRow label="선택한 경기 영상" value={uploadedVideoFileName || '-'} />
                <InfoRow label="준비 상태" value={uploadedVideoUrl ? '업로드 완료' : '대기 중'} />
                <InfoRow label="원본 영상 재생" value={uploadedVideoUrl ? '사용 가능' : '업로드 필요'} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="분석할 선수 직접 지정"
            description="영상에서 분석할 선수를 직접 탭해주면 AI가 그 선수만 끝까지 추적합니다. 정확도가 크게 올라가므로 꼭 지정해주세요."
          >
            <div className="space-y-4">
              {/* 상태 배지 */}
              <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ${seeds.length > 0 ? 'bg-[#FF9F02]/15 border border-[#FF9F02]/40' : 'bg-white/[0.04] border border-white/10'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold ${seeds.length > 0 ? 'bg-[#FF9F02] text-black' : 'bg-white/10 text-white/50'}`}>
                  {seeds.length > 0 ? seeds.length : '!'}
                </span>
                <div>
                  <p className={`text-sm font-semibold ${seeds.length > 0 ? 'text-[#FF9F02]' : 'text-white/50'}`}>
                    {seeds.length > 0 ? `${seeds.length}개 프레임에서 선수 지정 완료` : '선수 미지정 (아래에서 지정해주세요)'}
                  </p>
                  <p className="text-xs text-white/40">
                    {seeds.length > 0
                      ? `여러 장면에서 지정할수록 추적 정확도가 올라갑니다`
                      : '지정하지 않으면 자동 인식을 사용합니다 (정확도 낮음)'}
                  </p>
                </div>
                {seeds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSeeds([])}
                    className="ml-auto text-xs text-white/40 hover:text-white/70 underline"
                  >
                    전체 해제
                  </button>
                )}
              </div>

              {/* Step 1: 프레임 불러오기 */}
              {!activeSeedFrame && (
                <div className="rounded-2xl border border-dashed border-white/20 p-4 text-center space-y-3">
                  <p className="text-sm text-white/60">
                    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#FF9F02] text-[11px] font-bold text-black">1</span>
                    영상에서 선수가 잘 보이는 장면들을 불러오세요
                  </p>
                  <ActionButton
                    onClick={loadSeedFrames}
                    variant="outline"
                    disabled={!uploadedVideoFileName || isLoadingSeedFrames}
                  >
                    {isLoadingSeedFrames ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />}
                    {isLoadingSeedFrames ? '장면 불러오는 중...' : '장면 불러오기'}
                  </ActionButton>
                  {!uploadedVideoFileName && (
                    <p className="text-xs text-white/30">영상을 먼저 업로드해주세요</p>
                  )}
                </div>
              )}

              {/* Step 2: 프레임 탭 */}
              {activeSeedFrame && (
                <div className="space-y-3">
                  <p className="text-sm text-white/60">
                    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#FF9F02] text-[11px] font-bold text-black">2</span>
                    각 장면에서 <strong className="text-white">선수 몸통(가슴·등번호)</strong>을 탭하세요 — 옆 선수를 탭하면 다른 사람이 추적됩니다
                  </p>
                  <div
                    className={`relative w-full overflow-hidden rounded-[18px] border-2 transition-colors ${
                      seeds.some(s => s.timeSec === activeSeedFrame.timeSec) ? 'border-[#FF9F02]' : 'border-white/20 hover:border-white/40'
                    }`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <img
                      src={activeSeedFrame.url}
                      alt="선수 지정용 프레임"
                      onClick={handleSeedTap}
                      className="block w-full cursor-crosshair select-none"
                      draggable={false}
                    />
                    {/* 탭 전 안내 오버레이 (3초 후 자동 사라짐) */}
                    {showSeedOverlay && !seeds.some(s => s.timeSec === activeSeedFrame.timeSec) && (
                      <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-4 transition-opacity duration-500">
                        <div className="rounded-xl bg-black/70 px-4 py-2 text-center backdrop-blur-sm">
                          <p className="text-sm font-semibold text-white">👆 분석할 선수를 탭하세요</p>
                        </div>
                      </div>
                    )}
                    {/* 탭 위치 마커 */}
                    {seeds.filter(s => s.timeSec === activeSeedFrame.timeSec).map((s) => (
                      <span key={s.timeSec}>
                        <span
                          className="pointer-events-none absolute z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#FF9F02] bg-[#FF9F02]/20 shadow-[0_0_0_4px_rgba(0,0,0,0.5)]"
                          style={{ left: `${s.nx * 100}%`, top: `${s.ny * 100}%` }}
                        />
                        <span
                          className="pointer-events-none absolute z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF9F02]"
                          style={{ left: `${s.nx * 100}%`, top: `${s.ny * 100}%` }}
                        />
                      </span>
                    ))}
                  </div>

                  {/* 썸네일 선택 — 스크롤 안내 + 좌우 이동 */}
                  {seedFrames.length > 1 && (
                    <SeedFrameStrip
                      frames={seedFrames}
                      activeUrl={activeSeedFrame?.url}
                      tappedTimeSecs={seeds.map((s) => s.timeSec)}
                      onSelect={setActiveSeedFrame}
                    />
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="2. 주요 장면 추출"
            description="AI가 영상에서 코치 분석에 사용할 핵심 장면(클립)을 자동으로 골라냅니다. 클립별로 바로 재생할 수 있습니다."
          >
            <div className="space-y-5">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.02] p-4">
                <p className="text-sm leading-7 text-white/72">
                  업로드된 영상에서 AI가 분석에 필요한 장면만 추출합니다. 추출이 끝나면 아래에서
                  클립별로 재생하거나 AI 코치 분석으로 이어갈 수 있어요.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <ActionButton
                  onClick={handleExtractHighlights}
                  variant="primary"
                  disabled={!uploadedVideoFileName || isExtracting}
                >
                  {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {isExtracting ? '추출 중' : '주요 장면 추출'}
                </ActionButton>

                <ActionButton
                  onClick={handleGoToAiAnalysis}
                  variant="dark"
                  disabled={normalizedClips.length === 0}
                >
                  <Sparkles size={16} />
                  AI 영상분석
                  <ArrowRight size={16} />
                </ActionButton>
              </div>

              <div className="grid gap-3">
                <InfoRow label="분석 대상 선수" value={selectedPlayer.name ? `${selectedPlayer.name} (${selectedPlayer.jerseyNumber || '-'}번)` : '선수 등록 필요'} />
                <InfoRow label="유니폼 색상" value={selectedPlayer.uniformColor || '-'} />
                <InfoRow label="분석 포지션" value={analysisPosition || readSelectedPlayerPosition()} />
                <InfoRow label="선수 특징" value={selectedPlayer.traits || '-'} />
                <InfoRow
                  label="장면 추출 상태"
                  value={
                    normalizedClips.length > 0
                      ? `완료 (${normalizedClips.length}개 클립)`
                      : isExtracting
                        ? '추출 중...'
                        : '아직 추출 전'
                  }
                />
                <InfoRow label="총 클립 길이" value={formatSeconds(totalHighlightDuration)} />
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="mt-6">
          <SectionCard
            title="원본 영상 미리보기"
            description="업로드한 경기 영상을 확인합니다."
          >
            {uploadedVideoUrl ? (
              <video
                src={uploadedVideoUrl}
                controls
                playsInline
                className="w-full overflow-hidden rounded-[22px] border border-white/10 bg-black"
              />
            ) : localPreviewUrl ? (
              <video
                src={localPreviewUrl}
                controls
                playsInline
                className="w-full overflow-hidden rounded-[22px] border border-white/10 bg-black"
              />
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.02] text-white/46">
                업로드할 영상을 선택하면 이 영역에 미리보기가 표시됩니다.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="mt-6">
          <SectionCard
            title="추출된 주요 장면 (클립)"
            description="AI 코치 분석에 사용될 장면별 클립입니다. 각 클립을 눌러 바로 재생할 수 있습니다."
          >
            {normalizedClips.length > 0 ? (
              <div className="grid gap-4">
                {normalizedClips.map((clip: NormalizedClip, index: number) => (
                  <div
                    key={clip.id}
                    className="rounded-[24px] border border-white/8 bg-white/[0.02] p-4 md:p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-base font-bold text-white">
                          <Film size={16} className="text-[#FFB648]" />
                          {clip.label}
                        </p>
                        <p className="mt-2 text-sm text-white/58">
                          {clip.reason || clip.fileName}
                        </p>
                      </div>

                      <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/72">
                        {formatSeconds(clip.start)} ~ {formatSeconds(clip.end || clip.start + clip.duration)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
                      {clip.url ? (
                        <video
                          src={clip.url}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full overflow-hidden rounded-[18px] border border-white/10 bg-black"
                        />
                      ) : (
                        <div className="flex min-h-[180px] items-center justify-center rounded-[18px] border border-white/10 bg-black/40 text-sm text-white/50">
                          클립 영상을 불러올 수 없습니다
                        </div>
                      )}

                      <div className="grid gap-3">
                        {clip.coachComment ? (
                          <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                            <div className="text-xs text-white/48">코치 코멘트</div>
                            <p className="mt-2 text-sm leading-6 text-white/82">{clip.coachComment}</p>
                          </div>
                        ) : null}
                        <InfoRow label="시작 시점" value={formatSeconds(clip.start)} />
                        <InfoRow
                          label="종료 시점"
                          value={formatSeconds(clip.end || clip.start + clip.duration)}
                        />
                        <InfoRow label="길이" value={formatSeconds(clip.duration)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.02] p-6 text-white/60">
                주요 장면이 추출되면 이 영역에서 클립별로 확인할 수 있습니다.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="mt-6 rounded-[26px] border border-emerald-400/14 bg-emerald-400/8 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="mt-[2px] text-emerald-300" />
            <div>
              <p className="text-sm font-semibold text-emerald-200">영상 분석 워크플로우</p>
              <p className="mt-2 text-sm leading-7 text-emerald-100/88">
                ① 영상 업로드 → ② 선수 지정 → ③ 주요 장면 추출 → ④ AI 코치 분석.
                SNS·공유용 하이라이트 영상은 상단 메뉴 「하이라이트 추출」에서 별도로 만듭니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
