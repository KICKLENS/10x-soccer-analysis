import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageNav from '../components/PageNav';
import { fetchJson, readSelectedPlayer, toAbsoluteUrl } from '../lib/api';
import {
  patchHighlightWorkflow,
  readHighlightWorkflow,
  saveHighlightWorkflow,
  type HighlightWorkflowPayload,
} from '../lib/highlightWorkflow';

const PAGE_BG = '#070b14';
const CARD_BG = 'linear-gradient(180deg, rgba(14,19,33,0.96) 0%, rgba(10,14,26,0.98) 100%)';
const STROKE = 'rgba(255,255,255,0.08)';
const TEXT_SUB = 'rgba(225,231,242,0.72)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollJob<T = unknown>(
  jobId: string,
  onStage?: (stage: string, progress?: number) => void,
): Promise<T> {
  for (;;) {
    await sleep(4000);
    const s = await fetchJson<{
      status: string;
      stage?: string;
      progress?: number;
      result?: T;
      error?: string;
    }>(`/api/jobs/${jobId}`, { method: 'GET' });
    if (s.stage) onStage?.(s.stage, s.progress);
    if (s.status === 'done') return s.result as T;
    if (s.status === 'error') throw new Error(s.error || '작업 처리 중 오류가 발생했습니다.');
  }
}

export default function HighlightExtractionPage() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<HighlightWorkflowPayload | null>(() => readHighlightWorkflow());
  const [isExtracting, setIsExtracting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!payload?.highlightClips?.length) {
      setErrorMessage('먼저 영상 분석 페이지에서 「분석 장면 추출」을 완료해 주세요.');
    }
  }, [payload?.highlightClips?.length]);

  const spotlightUrl = toAbsoluteUrl(payload?.spotlightVideoUrl || '');
  const fallbackUrl = toAbsoluteUrl(payload?.highlightVideoUrl || '');
  const displayUrl = spotlightUrl || fallbackUrl;
  const clipCount = payload?.highlightClips?.length || 0;

  const playerLabel = useMemo(() => {
    const p = payload?.player || readSelectedPlayer();
    return p.name ? `${p.name}${p.jerseyNumber ? ` (${p.jerseyNumber}번)` : ''}` : '등록 선수';
  }, [payload?.player]);

  const handleExtractHighlight = async () => {
    const clips = payload?.highlightClips || [];
    const clipList = clips.map((c) => c.url || c.clipUrl || c.outputUrl).filter(Boolean);
    if (!clipList.length) {
      setErrorMessage('추출할 클립이 없습니다. 영상 분석 페이지에서 장면을 먼저 추출해 주세요.');
      return;
    }

    const player = payload?.player || readSelectedPlayer();
    setIsExtracting(true);
    setErrorMessage('');
    setStatusMessage('선수 추적 박스(코너 브라켓) 효과를 적용하는 중입니다... (약 1~3분)');

    try {
      const start = await fetchJson<{ jobId?: string }>('/api/jobs/spotlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clips: clipList,
          ...player,
          player,
          seeds: payload?.seeds?.length ? payload.seeds : undefined,
        }),
      });
      if (!start.jobId) throw new Error('하이라이트 추출 작업을 시작하지 못했습니다.');

      const result = await pollJob<{ videoUrl?: string }>(start.jobId, (stage) =>
        setStatusMessage(`하이라이트 추출 중: ${stage}...`),
      );

      const fxUrl = toAbsoluteUrl(result?.videoUrl || '');
      if (!fxUrl) throw new Error('하이라이트 영상을 생성하지 못했습니다.');

      const next: HighlightWorkflowPayload = {
        ...(payload || {}),
        spotlightVideoUrl: fxUrl,
      };
      setPayload(next);
      saveHighlightWorkflow(next);
      setStatusMessage('선수가 눈에 띄게 표시된 하이라이트 영상이 준비되었습니다. 아래에서 재생·다운로드할 수 있어요.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '하이라이트 추출 중 오류가 발생했습니다.');
      setStatusMessage('');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDownload = () => {
    if (!displayUrl) {
      setErrorMessage('다운로드할 하이라이트 영상이 없습니다.');
      return;
    }
    const link = document.createElement('a');
    link.href = displayUrl;
    link.download = payload?.jobId ? `highlight-${payload.jobId}.mp4` : '10x-highlight.mp4';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <main className="min-h-screen text-white" style={{ background: PAGE_BG }}>
      <div className="mx-auto w-full max-w-[1200px] px-3 py-5 md:px-6 md:py-10 pb-[calc(28px+env(safe-area-inset-bottom))]">
        <PageNav />

        <div className="mt-4 mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/48 md:text-xs">
            HIGHLIGHT STUDIO
          </p>
          <h1 className="mt-2 text-2xl font-extrabold md:text-4xl">하이라이트 추출</h1>
          <p className="mt-3 max-w-[720px] text-sm leading-7" style={{ color: TEXT_SUB }}>
            분석에 사용한 {clipCount}개 장면을 이어 붙이고, <strong className="text-white">{playerLabel}</strong> 선수에게
            코너 브라켓 추적 표시를 입힌 <strong className="text-[#FFB648]">공유·저장용 하이라이트 영상</strong>을
            만듭니다. (AI 코치 분석과는 별도 단계예요.)
          </p>
        </div>

        {statusMessage ? (
          <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
            {statusMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <div
          className="rounded-3xl border p-5 md:p-6"
          style={{ borderColor: STROKE, background: CARD_BG }}
        >
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExtractHighlight}
              disabled={!clipCount || isExtracting}
              className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,197,92,1) 0%, rgba(255,159,2,1) 55%, rgba(233,131,0,1) 100%)',
              }}
            >
              {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              {isExtracting ? '하이라이트 추출 중...' : spotlightUrl ? '하이라이트 다시 만들기' : '하이라이트 추출'}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!displayUrl}
              className="inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}
            >
              <Download size={16} />
              영상 다운로드
            </button>

            <button
              type="button"
              onClick={() => navigate('/video-analysis')}
              className="inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold text-white"
              style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}
            >
              <ArrowLeft size={16} />
              영상 분석으로
            </button>

            <button
              type="button"
              onClick={() => navigate('/ai-video-analysis')}
              className="inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold text-white"
              style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}
            >
              <Sparkles size={16} />
              AI 분석 보기
            </button>
          </div>

          <div className="mt-5 grid gap-2 text-sm text-white/60">
            <div>분석 장면: {clipCount}개</div>
            <div>추적 표시: {spotlightUrl ? '코너 브라켓 적용 완료 ✓' : '아직 미적용 — 위 버튼을 눌러 주세요'}</div>
          </div>

          <div className="mt-6">
            {displayUrl ? (
              <div className="space-y-3">
                <h2 className="text-base font-bold md:text-lg">
                  {spotlightUrl ? '선수 추적 표시 하이라이트' : '기본 하이라이트 (추적 표시 전)'}
                </h2>
                <p className="text-xs text-white/45">
                  {spotlightUrl
                    ? '분석 대상 선수 주변에 코너 브라켓이 표시된 최종 영상입니다.'
                    : '「하이라이트 추출」을 누르면 선수 추적 표시가 입혀진 버전으로 교체됩니다.'}
                </p>
                <video
                  src={displayUrl}
                  controls
                  playsInline
                  className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black"
                />
              </div>
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] px-6 text-center text-sm text-white/50">
                {clipCount
                  ? '「하이라이트 추출」 버튼을 누르면 이곳에 영상이 표시됩니다.'
                  : '영상 분석 페이지에서 먼저 「분석 장면 추출」을 진행해 주세요.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
