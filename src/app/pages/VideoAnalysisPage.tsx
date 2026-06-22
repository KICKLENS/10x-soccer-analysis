import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ChangeEvent, ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
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

const UPLOAD_ENDPOINT = '/api/upload';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 비동기 작업(job) 상태를 폴링한다. 네트워크 일시 오류는 재시도, 작업 자체 오류는 전파.
async function pollJob<T = unknown>(
  jobId: string,
  onStage?: (stage: string, progress?: number) => void,
): Promise<T> {
  let fails = 0;
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
      if (s.stage) onStage?.(s.stage, s.progress);
      if (s.status === 'done') return s.result as T;
      if (s.status === 'error') {
        const err = new Error(s.error || '작업 처리 중 오류가 발생했습니다.') as Error & { jobError?: boolean };
        err.jobError = true;
        throw err;
      }
    } catch (e) {
      if ((e as { jobError?: boolean })?.jobError) throw e;
      fails += 1;
      if (fails >= 10) throw new Error('서버와 통신이 끊겼습니다. 잠시 후 다시 시도해주세요.');
    }
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
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);

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
        label: clip.label || `하이라이트 ${index + 1}`,
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

      setStatusMessage('업로드가 완료되었습니다. 이제 AI가 하이라이트를 분석합니다.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다.');
      setStatusMessage('');
    } finally {
      setIsUploading(false);
    }
  };

  const enhanceWithSpotlight = async (clips: HighlightClip[], player: ReturnType<typeof readSelectedPlayer>) => {
    const clipList = (Array.isArray(clips) ? clips : [])
      .map((c) => c.url || c.clipUrl || c.outputUrl)
      .filter(Boolean);
    if (!clipList.length) return;

    try {
      setIsEnhancing(true);
      setStatusMessage('하이라이트에 선수 포착(스포트라이트) 효과를 적용하는 중입니다... (약 1~3분)');
      const start = await fetchJson<{ jobId?: string }>('/api/jobs/spotlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: clipList, ...player, player }),
      });
      if (!start.jobId) return;
      const result = await pollJob<{ videoUrl?: string }>(start.jobId, (stage) =>
        setStatusMessage(`선수 포착(스포트라이트) ${stage}...`),
      );
      const fxUrl = toAbsoluteUrl(result?.videoUrl || '');
      if (fxUrl) {
        setHighlightVideoUrl(fxUrl);
        setStatusMessage('선수 포착(스포트라이트) 효과가 적용된 하이라이트가 준비되었습니다.');
      }
    } catch {
      // 효과 적용 실패해도 기본 하이라이트는 그대로 유지
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleExtractHighlights = async () => {
    if (!uploadedVideoFileName) {
      setErrorMessage('먼저 영상을 업로드해주세요.');
      return;
    }

    setIsExtracting(true);
    setErrorMessage('');
    setStatusMessage('하이라이트 자동추출을 시작합니다...');

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
        }),
      });
      if (!start.jobId) throw new Error('하이라이트 추출 작업을 시작하지 못했습니다.');

      const data = await pollJob<ExtractResponse>(start.jobId, (stage, progress) =>
        setStatusMessage(
          `하이라이트 추출 중: ${stage}${typeof progress === 'number' ? ` (${progress}%)` : ''}`,
        ),
      );

      const nextClips = Array.isArray(data.clips) ? data.clips : [];
      const mergedUrl = toAbsoluteUrl(data.mergedHighlightUrl || data.highlightVideoUrl || '');

      if (!mergedUrl && nextClips.length === 0) {
        throw new Error('하이라이트 영상을 생성하지 못했습니다. 다른 영상으로 다시 시도해주세요.');
      }

      setHighlightClips(nextClips);
      setHighlightVideoUrl(mergedUrl);
      setHighlightJobId(start.jobId);
      setCoachSummary(data.summary || null);

      setStatusMessage(data.message || '하이라이트 생성이 완료되었습니다. AI 분석으로 이어서 확인할 수 있습니다.');

      // 스포트라이트 효과는 별도 작업으로 적용(완료되면 영상 교체)
      void enhanceWithSpotlight(nextClips, player);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '하이라이트 추출 중 오류가 발생했습니다.');
      setStatusMessage('');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGoToAiAnalysis = () => {
    if (!highlightVideoUrl && normalizedClips.length === 0) {
      setErrorMessage('먼저 하이라이트를 생성해주세요.');
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

  const handleDownloadHighlight = () => {
    if (!highlightVideoUrl) {
      setErrorMessage('저장할 하이라이트 영상이 없습니다.');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = highlightVideoUrl;
      link.download = highlightJobId ? `highlight-${highlightJobId}.mp4` : 'highlight-video.mp4';
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();

      window.setTimeout(() => {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      }, 0);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '하이라이트 저장 처리 중 오류가 발생했습니다.'
      );
    }
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
              경기 영상을 하이라이트와 분석으로 연결하세요
            </h1>
            <p className="mt-3 max-w-[860px] text-[13px] leading-6 md:mt-4 md:text-[16px] md:leading-7" style={{ color: TEXT_SUB }}>
              경기 영상을 업로드하면 AI가 주요 이벤트 구간을 자동으로 선별해 하이라이트를 구성하고,
              이어서 분석 흐름까지 자연스럽게 연결해줍니다. 복잡한 설정 없이 빠르게 핵심 장면을
              확인하고 인사이트를 정리할 수 있도록 설계했습니다.
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

        <div className="mt-8 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionCard
            title="1. 영상 업로드"
            description="경기 영상을 업로드하면 AI 분석을 위한 준비가 자동으로 진행되며, 이후 하이라이트 추출과 분석 단계로 자연스럽게 이어집니다."
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
            title="2. 하이라이트 자동 추출"
            description="AI가 영상 속 주요 이벤트와 흐름을 바탕으로 핵심 장면을 자동 선별하여 하이라이트 영상을 구성합니다."
          >
            <div className="space-y-5">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.02] p-4">
                <p className="text-sm leading-7 text-white/72">
                  복잡한 구간 설정 없이, 업로드된 영상을 기반으로 AI가 핵심 장면을 자동 추출해
                  하이라이트 영상을 만들어줍니다.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <ActionButton
                  onClick={handleExtractHighlights}
                  variant="primary"
                  disabled={!uploadedVideoFileName || isExtracting}
                >
                  {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {isExtracting ? '추출 중' : '하이라이트 자동 추출'}
                </ActionButton>

                <ActionButton
                  onClick={handleDownloadHighlight}
                  variant="outline"
                  disabled={!highlightVideoUrl}
                >
                  <Download size={16} />
                  하이라이트 저장
                </ActionButton>

                <ActionButton
                  onClick={handleGoToAiAnalysis}
                  variant="dark"
                  disabled={!highlightVideoUrl}
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
                  label="하이라이트 상태"
                  value={
                    isEnhancing
                      ? '스포트라이트 효과 적용 중...'
                      : highlightVideoUrl
                        ? '생성 완료'
                        : '아직 생성 전'
                  }
                />
                <InfoRow label="하이라이트 영상" value={highlightVideoUrl ? '재생 가능' : '추출 필요'} />
                <InfoRow label="추출된 클립 수" value={`${normalizedClips.length}개`} />
                <InfoRow label="총 하이라이트 길이" value={formatSeconds(totalHighlightDuration)} />
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <SectionCard
            title="원본 영상 미리보기"
            description="업로드한 경기 영상을 먼저 확인하고, 이후 생성된 하이라이트와 비교해볼 수 있습니다."
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

          <SectionCard
            title="하이라이트 영상 재생"
            description="추출된 장면들을 이어 붙인 전체 하이라이트 영상입니다."
          >
            {highlightVideoUrl ? (
              <video
                src={highlightVideoUrl}
                controls
                playsInline
                className="w-full overflow-hidden rounded-[22px] border border-white/10 bg-black"
              />
            ) : normalizedClips.length > 0 ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.02] px-6 text-center text-white/60">
                개별 클립은 아래 목록에서 확인할 수 있습니다. 전체 하이라이트 영상은 생성되지 않았습니다.
              </div>
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.02] text-white/46">
                하이라이트를 추출하면 이 영역에 전체 하이라이트 영상이 표시됩니다.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="mt-6">
          <SectionCard
            title="하이라이트 클립 목록"
            description="장면별로 나눈 클립을 개별 재생할 수 있습니다. 각 클립은 해당 하이라이트 순간만 담고 있습니다."
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
                하이라이트가 생성되면 이 영역에서 장면별로 확인할 수 있습니다.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="mt-6 rounded-[26px] border border-emerald-400/14 bg-emerald-400/8 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="mt-[2px] text-emerald-300" />
            <div>
              <p className="text-sm font-semibold text-emerald-200">AI 기반 자동 하이라이트 워크플로우</p>
              <p className="mt-2 text-sm leading-7 text-emerald-100/88">
                영상 업로드부터 하이라이트 생성, 그리고 AI 분석 연결까지 한 흐름으로 이어지도록 구성했습니다.
                사용자는 별도 설정 없이 핵심 장면을 빠르게 확인하고, 분석 결과까지 자연스럽게 이어볼 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
