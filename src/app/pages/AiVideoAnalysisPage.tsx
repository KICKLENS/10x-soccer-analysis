import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, History, Share2, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toAbsoluteUrl, type SelectedPlayer } from '../lib/api';
import type { GpuAnalysis } from '../lib/analysisFlow';
import PageNav from '../components/PageNav';

const STORAGE_KEY = 'ai-analysis-payload';

type CoachSummary = {
  noticeableScene?: string;
  strength?: string;
  weakness?: string;
  trainingPoint?: string;
  nextTrainingPoint?: string;
};

type AnalysisClip = {
  id?: string;
  url?: string;
  clipUrl?: string;
  outputUrl?: string;
  start?: number;
  end?: number;
  startTime?: number | string;
  endTime?: number | string;
  label?: string;
  reason?: string;
  coachComment?: string;
  importanceScore?: number;
  fileName?: string;
};

type AnalysisPayload = {
  uploadedVideoUrl?: string;
  highlightVideoUrl?: string;
  highlightClips?: AnalysisClip[];
  uploadedVideoFileName?: string;
  analysisId?: string;
  jobId?: string;
  summary?: CoachSummary;
  gpuAnalysis?: GpuAnalysis | null;
  position?: string;
  player?: SelectedPlayer;
};

const PAGE_BG = '#070b14';
const CARD_BG = 'linear-gradient(180deg, rgba(14,19,33,0.96) 0%, rgba(10,14,26,0.98) 100%)';
const STROKE = 'rgba(255,255,255,0.08)';
const TEXT_SUB = 'rgba(225,231,242,0.72)';

function parseStoredPayload(): AnalysisPayload | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as AnalysisPayload;
  } catch {
    return null;
  }
}

function formatSeconds(value: unknown): string {
  const sec = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function SummaryCard({ title, value, tone }: { title: string; value?: string; tone: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: tone }}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{title}</div>
      <div className="mt-2 text-sm leading-7 text-white/88">{value || '-'}</div>
    </div>
  );
}

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl border p-3 text-center md:p-4" style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}>
      <div className="text-[11px] text-white/48 md:text-xs">{label}</div>
      <div className="mt-1 text-xl font-extrabold md:text-2xl">
        {value}
        {unit ? <span className="ml-0.5 text-xs font-semibold text-white/56">{unit}</span> : null}
      </div>
    </div>
  );
}

type HeatmapData = { cols: number; rows: number; grid: number[][] };

function Heatmap({ heatmap }: { heatmap: HeatmapData }) {
  const grid = heatmap?.grid || [];
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  let max = 1;
  for (const row of grid) for (const v of row) if (v > max) max = v;

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-white/10"
      style={{
        aspectRatio: '3 / 2',
        background: 'linear-gradient(180deg, #0f5a37 0%, #0c4d2f 100%)',
      }}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          border: '2px solid rgba(255,255,255,0.4)',
        }}
      >
        {grid.flatMap((row, r) =>
          row.map((v, c) => {
            const intensity = max > 0 ? v / max : 0;
            const alpha = v === 0 ? 0 : 0.18 + intensity * 0.72;
            return (
              <div
                key={`${r}-${c}`}
                style={{
                  background: alpha
                    ? `rgba(255, ${Math.round(159 - intensity * 110)}, 2, ${alpha})`
                    : 'transparent',
                }}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}

function GpuStatsCard({ gpu, playerName }: { gpu: GpuAnalysis; playerName?: string }) {
  const m = gpu.tracking?.metrics || {};
  const heatmap = gpu.tracking?.heatmap;
  const ball = gpu.ball?.available ? gpu.ball.windows || [] : [];
  const avgBallRate =
    ball.length > 0
      ? Math.round((ball.reduce((s, w) => s + (w.ballDetectionRate || 0), 0) / ball.length) * 100)
      : null;

  return (
    <div className="rounded-3xl border p-4 md:rounded-[28px] md:p-5" style={{ borderColor: STROKE, background: CARD_BG }}>
      <div className="mb-3 flex flex-wrap items-center gap-2 md:mb-4">
        <h2 className="text-base font-bold md:text-lg">정밀 움직임 분석</h2>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">GPU</span>
        {playerName ? <span className="text-xs text-white/48">{playerName} 선수</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
        <StatTile label="이동거리" value={m.distanceM != null ? String(m.distanceM) : '-'} unit="m" />
        <StatTile label="스프린트" value={m.sprintCount != null ? String(m.sprintCount) : '-'} unit="회" />
        <StatTile label="평균속도" value={m.avgSpeedMS != null ? String(m.avgSpeedMS) : '-'} unit="m/s" />
        <StatTile label="활동지수" value={m.activityIndex != null ? String(m.activityIndex) : '-'} unit="/100" />
      </div>

      {heatmap?.grid?.length ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-white/80">활동 히트맵</div>
            {avgBallRate != null ? (
              <div className="text-xs text-white/48">공 검출률 {avgBallRate}%</div>
            ) : null}
          </div>
          <Heatmap heatmap={heatmap} />
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-5 text-white/40">
        {gpu.tracking?.note ||
          '거리·속도는 단안 영상 기반 추정치라 절대값보다 활동량/성향 비교에 활용하세요.'}
      </p>
    </div>
  );
}

export default function AiVideoAnalysisPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [shareNotice, setShareNotice] = useState('');

  const payload = useMemo(() => {
    const statePayload = location.state as AnalysisPayload | null;
    if (statePayload) return statePayload;
    return parseStoredPayload();
  }, [location.state]);

  useEffect(() => {
    if (location.state) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(location.state));
      } catch {
        // ignore
      }
    }
  }, [location.state]);

  const clips = payload?.highlightClips || [];
  const summary = payload?.summary;
  const gpu = payload?.gpuAnalysis;
  const highlightUrl = toAbsoluteUrl(payload?.highlightVideoUrl || '');

  const handleShare = async () => {
    const shareUrl = highlightUrl || window.location.href;
    const title = `${payload?.player?.name || '선수'} AI 코치 분석 리포트`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: title, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareNotice('링크가 복사되었습니다.');
      setTimeout(() => setShareNotice(''), 2500);
    } catch {
      // user cancelled share or clipboard blocked
    }
  };

  const handleDownload = () => {
    if (!highlightUrl) return;
    const a = document.createElement('a');
    a.href = highlightUrl;
    a.download = payload?.uploadedVideoFileName
      ? `highlight_${payload.uploadedVideoFileName}`
      : 'highlight.mp4';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <main className="min-h-screen text-white" style={{ background: PAGE_BG }}>
      <div className="mx-auto w-full max-w-[1200px] px-3 py-5 md:px-6 md:py-10 pb-[calc(28px+env(safe-area-inset-bottom))]">
        <div className="mb-4">
          <PageNav />
        </div>
        <div className="mb-5 flex flex-col gap-3 md:mb-8 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/48 md:text-[12px] md:tracking-[0.32em]">
              AI COACH ANALYSIS
            </p>
            <h1 className="mt-2 text-2xl font-extrabold text-white md:mt-3 md:text-4xl">AI 코치 분석 리포트</h1>
            <p className="mt-2 max-w-[760px] text-[13px] leading-6 md:mt-3 md:text-[15px] md:leading-7" style={{ color: TEXT_SUB }}>
              등록한 선수 정보를 바탕으로 AI 코치가 경기 영상을 분석하고, 장면별 코칭 피드백을 정리했습니다.
            </p>
          </div>

          {payload ? (
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-end md:gap-3">
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-black transition active:scale-[0.98] md:px-5"
                style={{ background: '#FF9F02' }}
              >
                <Share2 size={16} />
                공유하기
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!highlightUrl}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-40 md:px-5"
                style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}
              >
                <Download size={16} />
                영상 저장
              </button>
              <button
                type="button"
                onClick={() => navigate('/analysis-history')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/5 md:px-5"
                style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}
              >
                <History size={16} />
                내 기록
              </button>
              <button
                type="button"
                onClick={() => navigate('/video-analysis')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/5 md:px-5"
                style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}
              >
                <ArrowLeft size={16} />
                하이라이트
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/video-analysis')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/5 md:w-auto md:px-5"
              style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}
            >
              <ArrowLeft size={16} />
              하이라이트 페이지로
            </button>
          )}
        </div>

        {shareNotice ? (
          <div
            className="mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold text-emerald-200"
            style={{ borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.12)' }}
          >
            {shareNotice}
          </div>
        ) : null}

        {!payload ? (
          <div
            className="rounded-[28px] border p-8 text-center"
            style={{ borderColor: STROKE, background: CARD_BG }}
          >
            <Sparkles size={28} className="mx-auto text-[#FFB648]" />
            <h2 className="mt-4 text-xl font-bold">표시할 AI 분석 결과가 없습니다</h2>
            <p className="mt-3 text-sm leading-7" style={{ color: TEXT_SUB }}>
              먼저 <strong>/video-analysis</strong>에서 영상을 업로드하고 하이라이트를 생성한 뒤
              &quot;AI 영상분석&quot; 버튼을 눌러주세요.
            </p>
          </div>
        ) : (
          <div className="space-y-4 md:space-y-6">
            <div
              className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
            >
              <div className="rounded-2xl border p-3 md:p-4" style={{ borderColor: STROKE, background: CARD_BG }}>
                <div className="text-xs text-white/48">분석 포지션</div>
                <div className="mt-1 text-base font-bold md:mt-2 md:text-lg">{payload.position || '골키퍼'}</div>
              </div>
              <div className="rounded-2xl border p-3 md:p-4" style={{ borderColor: STROKE, background: CARD_BG }}>
                <div className="text-xs text-white/48">유니폼 색상</div>
                <div className="mt-1 text-base font-bold md:mt-2 md:text-lg">{payload.player?.uniformColor || '-'}</div>
              </div>
              <div className="rounded-2xl border p-3 md:p-4" style={{ borderColor: STROKE, background: CARD_BG }}>
                <div className="text-xs text-white/48">하이라이트 클립</div>
                <div className="mt-1 text-base font-bold md:mt-2 md:text-lg">{clips.length}개</div>
              </div>
              <div className="rounded-2xl border p-3 md:p-4" style={{ borderColor: STROKE, background: CARD_BG }}>
                <div className="text-xs text-white/48">원본 파일</div>
                <div className="mt-1 truncate text-sm font-semibold md:mt-2">{payload.uploadedVideoFileName || '-'}</div>
              </div>
            </div>

            {highlightUrl ? (
              <div className="rounded-3xl border p-4 md:rounded-[28px] md:p-5" style={{ borderColor: STROKE, background: CARD_BG }}>
                <h2 className="mb-3 text-base font-bold md:mb-4 md:text-lg">최종 하이라이트 영상</h2>
                <video src={highlightUrl} controls playsInline className="w-full rounded-2xl border border-white/10 bg-black" />
              </div>
            ) : null}

            <div className="rounded-3xl border p-4 md:rounded-[28px] md:p-5" style={{ borderColor: STROKE, background: CARD_BG }}>
              <h2 className="mb-3 text-base font-bold md:mb-4 md:text-lg">AI 코치 종합 분석</h2>
              {summary ? (
                <div className="grid gap-3 md:grid-cols-2 md:gap-4">
                  <SummaryCard title="눈에 띄는 장면" value={summary.noticeableScene} tone="rgba(59,130,246,0.12)" />
                  <SummaryCard title="잘한 점" value={summary.strength} tone="rgba(34,197,94,0.12)" />
                  <SummaryCard title="아쉬운 점" value={summary.weakness} tone="rgba(245,158,11,0.12)" />
                  <SummaryCard title="훈련 포인트" value={summary.trainingPoint || summary.nextTrainingPoint} tone="rgba(168,85,247,0.12)" />
                </div>
              ) : (
                <p className="text-sm" style={{ color: TEXT_SUB }}>종합 코칭 리포트가 아직 없습니다.</p>
              )}
            </div>

            {gpu?.tracking?.available ? (
              <GpuStatsCard gpu={gpu} playerName={payload.player?.name} />
            ) : null}

            <div className="rounded-3xl border p-4 md:rounded-[28px] md:p-5" style={{ borderColor: STROKE, background: CARD_BG }}>
              <h2 className="mb-3 text-base font-bold md:mb-4 md:text-lg">장면별 코치 코멘트</h2>
              {clips.length ? (
                <div className="space-y-3 md:space-y-4">
                  {clips.map((clip, index) => {
                    const clipUrl = toAbsoluteUrl(clip.url || clip.clipUrl || clip.outputUrl || '');
                    return (
                      <div key={clip.id || index} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3 md:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-base font-bold">{clip.label || `장면 ${index + 1}`}</div>
                            <div className="mt-1 text-xs text-white/48">
                              {formatSeconds(clip.start ?? clip.startTime)} ~ {formatSeconds(clip.end ?? clip.endTime)}
                            </div>
                          </div>
                          {clip.importanceScore != null ? (
                            <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-semibold text-purple-200">
                              중요도 {clip.importanceScore}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm leading-7 text-white/72">{clip.coachComment || clip.reason || '-'}</p>
                        {clipUrl ? (
                          <video src={clipUrl} controls playsInline className="mt-4 w-full max-w-xl rounded-xl border border-white/10 bg-black" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm" style={{ color: TEXT_SUB }}>표시할 클립이 없습니다.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
