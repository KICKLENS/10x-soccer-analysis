import { useMemo } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toAbsoluteUrl, type SelectedPlayer } from '../lib/api';

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

export default function AiVideoAnalysisPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const payload = useMemo(() => {
    const statePayload = location.state as AnalysisPayload | null;
    if (statePayload) return statePayload;
    return parseStoredPayload();
  }, [location.state]);

  const clips = payload?.highlightClips || [];
  const summary = payload?.summary;
  const highlightUrl = toAbsoluteUrl(payload?.highlightVideoUrl || '');

  return (
    <main className="min-h-screen text-white" style={{ background: PAGE_BG }}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6 md:py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-white/48">
              AI COACH ANALYSIS
            </p>
            <h1 className="mt-3 text-3xl font-extrabold text-white md:text-4xl">AI 코치 분석 리포트</h1>
            <p className="mt-3 max-w-[760px] text-sm leading-7 md:text-[15px]" style={{ color: TEXT_SUB }}>
              등록한 선수 정보를 바탕으로 AI 코치가 경기 영상을 분석하고, 장면별 코칭 피드백을 정리했습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/video-analysis')}
            className="inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
            style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}
          >
            <ArrowLeft size={16} />
            하이라이트 페이지로
          </button>
        </div>

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
          <div className="space-y-6">
            <div
              className="grid gap-4 md:grid-cols-3"
            >
              <div className="rounded-2xl border p-4" style={{ borderColor: STROKE, background: CARD_BG }}>
                <div className="text-xs text-white/48">분석 포지션</div>
                <div className="mt-2 text-lg font-bold">{payload.position || '골키퍼'}</div>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: STROKE, background: CARD_BG }}>
                <div className="text-xs text-white/48">유니폼 색상</div>
                <div className="mt-2 text-lg font-bold">{payload.player?.uniformColor || '-'}</div>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: STROKE, background: CARD_BG }}>
                <div className="text-xs text-white/48">하이라이트 클립</div>
                <div className="mt-2 text-lg font-bold">{clips.length}개</div>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: STROKE, background: CARD_BG }}>
                <div className="text-xs text-white/48">원본 파일</div>
                <div className="mt-2 truncate text-sm font-semibold">{payload.uploadedVideoFileName || '-'}</div>
              </div>
            </div>

            {highlightUrl ? (
              <div className="rounded-[28px] border p-5" style={{ borderColor: STROKE, background: CARD_BG }}>
                <h2 className="mb-4 text-lg font-bold">최종 하이라이트 영상</h2>
                <video src={highlightUrl} controls playsInline className="w-full rounded-2xl border border-white/10 bg-black" />
              </div>
            ) : null}

            <div className="rounded-[28px] border p-5" style={{ borderColor: STROKE, background: CARD_BG }}>
              <h2 className="mb-4 text-lg font-bold">AI 코치 종합 분석</h2>
              {summary ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <SummaryCard title="눈에 띄는 장면" value={summary.noticeableScene} tone="rgba(59,130,246,0.12)" />
                  <SummaryCard title="잘한 점" value={summary.strength} tone="rgba(34,197,94,0.12)" />
                  <SummaryCard title="아쉬운 점" value={summary.weakness} tone="rgba(245,158,11,0.12)" />
                  <SummaryCard title="훈련 포인트" value={summary.trainingPoint || summary.nextTrainingPoint} tone="rgba(168,85,247,0.12)" />
                </div>
              ) : (
                <p className="text-sm" style={{ color: TEXT_SUB }}>종합 코칭 리포트가 아직 없습니다.</p>
              )}
            </div>

            <div className="rounded-[28px] border p-5" style={{ borderColor: STROKE, background: CARD_BG }}>
              <h2 className="mb-4 text-lg font-bold">장면별 코치 코멘트</h2>
              {clips.length ? (
                <div className="space-y-4">
                  {clips.map((clip, index) => {
                    const clipUrl = toAbsoluteUrl(clip.url || clip.clipUrl || clip.outputUrl || '');
                    return (
                      <div key={clip.id || index} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
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
