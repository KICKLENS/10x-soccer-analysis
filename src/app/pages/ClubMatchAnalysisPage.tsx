import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, PlayCircle, Upload, Sparkles } from 'lucide-react';
import PageNav from '../components/PageNav';
import { fetchJson, toAbsoluteUrl } from '../lib/api';
import { uploadVideoFile } from '../lib/analysisFlow';
import { CLUB_DEMO, GRADE_INFO } from '../lib/clubData';
import {
  DEMO_MATCH_ANALYSIS,
  GRADE_OPTIONS,
  listClubMatchAnalyses,
  saveClubMatchAnalysis,
  type ClubMatchAnalysisResult,
} from '../lib/clubMatchAnalysis';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollJob<T>(jobId: string, onStage?: (stage: string, progress?: number) => void): Promise<T> {
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
    if (s.status === 'error') throw new Error(s.error || '경기 분석 중 오류가 발생했습니다.');
  }
}

type LocationState = {
  opponent?: string;
  matchDate?: string;
  matchResult?: string;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 md:p-5">
      <h3 className="mb-3 text-sm font-bold text-[#FFB648] md:text-base">{title}</h3>
      {children}
    </div>
  );
}

function BulletList({ items, tone = 'default' }: { items?: string[]; tone?: 'default' | 'green' | 'amber' }) {
  if (!items?.length) return <p className="text-sm text-white/45">내용 없음</p>;
  const dot =
    tone === 'green' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-white/50';
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm leading-7 text-white/78">
          <span className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current ${dot}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MatchReportView({ report }: { report: ClubMatchAnalysisResult }) {
  const meta = report.meta || {};
  const gradeLabel = meta.grade ? GRADE_INFO[meta.grade]?.label || meta.grade : '';

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="rounded-2xl border border-[#FF9F02]/25 bg-[#FF9F02]/8 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          {gradeLabel ? <span className="rounded-full bg-white/10 px-2.5 py-1">{gradeLabel}</span> : null}
          {meta.matchDate ? <span>{meta.matchDate}</span> : null}
          {meta.matchResult ? (
            <span className="font-bold text-[#FFB648]">{meta.matchResult}</span>
          ) : null}
        </div>
        <h2 className="mt-2 text-lg font-black text-white md:text-xl">
          vs {meta.opponent || '상대팀'}
        </h2>
        <p className="mt-3 text-sm leading-7 text-white/80">{report.matchSummary}</p>
        {report.scoreFlow ? (
          <p className="mt-2 text-sm leading-7 text-white/60">{report.scoreFlow}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="전반">
          <p className="text-sm leading-7 text-white/75">{report.firstHalf || '—'}</p>
        </Section>
        <Section title="후반">
          <p className="text-sm leading-7 text-white/75">{report.secondHalf || '—'}</p>
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="팀 강점">
          <BulletList items={report.teamStrengths} tone="green" />
        </Section>
        <Section title="팀 보완점">
          <BulletList items={report.teamWeaknesses} tone="amber" />
        </Section>
      </div>

      <Section title="전술·조직 관찰">
        <p className="text-sm leading-7 text-white/75">{report.tacticalNotes || '—'}</p>
      </Section>

      {report.keyMoments?.length ? (
        <Section title="주요 장면">
          <div className="space-y-4">
            {report.keyMoments.map((km, i) => (
              <div key={km.id || i} className="rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-white">{km.label || `장면 ${i + 1}`}</div>
                  {km.impact ? (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-white/55">
                      {km.impact}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-7 text-white/70">{km.description}</p>
                {km.url ? (
                  <video
                    src={toAbsoluteUrl(km.url)}
                    controls
                    playsInline
                    className="mt-3 w-full max-w-xl rounded-lg border border-white/10 bg-black"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {report.playerStandouts?.length ? (
        <Section title="눈에 띈 선수 (영상 기준 추정)">
          <div className="grid gap-3 md:grid-cols-2">
            {report.playerStandouts.map((p, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="text-xs font-bold text-[#FFB648]">{p.hint || '선수'}</div>
                <p className="mt-1 text-sm text-white/80">{p.description}</p>
                {p.positives ? (
                  <p className="mt-2 text-xs text-emerald-300/90">+ {p.positives}</p>
                ) : null}
                {p.improvements ? (
                  <p className="mt-1 text-xs text-amber-300/90">△ {p.improvements}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="코칭 스태프 제안">
        <BulletList items={report.coachingRecommendations} />
        {report.nextMatchFocus ? (
          <p className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-400/10 px-3 py-2 text-sm text-indigo-100">
            다음 경기 집중: {report.nextMatchFocus}
          </p>
        ) : null}
      </Section>
    </div>
  );
}

export default function ClubMatchAnalysisPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as LocationState) || {};

  const [file, setFile] = useState<File | null>(null);
  const [opponent, setOpponent] = useState(prefill.opponent || '');
  const [matchDate, setMatchDate] = useState(prefill.matchDate || '');
  const [matchResult, setMatchResult] = useState(prefill.matchResult || '');
  const [grade, setGrade] = useState('u12');
  const [ourTeamColor, setOurTeamColor] = useState('주황');

  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<ClubMatchAnalysisResult | null>(null);
  const [history, setHistory] = useState<ClubMatchAnalysisResult[]>(() => listClubMatchAnalyses());

  useEffect(() => {
    setHistory(listClubMatchAnalyses());
  }, [report]);

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none focus:border-[#FF9F02]/50';

  const handleAnalyze = async () => {
    if (!file) {
      setError('경기 영상 파일을 선택해 주세요.');
      return;
    }
    if (!opponent.trim()) {
      setError('상대팀 이름을 입력해 주세요.');
      return;
    }

    setError('');
    setIsUploading(true);
    setStatus('영상 업로드 중...');

    try {
      const uploaded = await uploadVideoFile(file, undefined, undefined, (pct) =>
        setStatus(`영상 업로드 중... ${pct}%`),
      );
      setIsUploading(false);
      setIsAnalyzing(true);
      setStatus('경기 장면 탐지 및 AI 분석 시작...');

      const start = await fetchJson<{ jobId?: string }>('/api/jobs/match-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedFilename: uploaded.fileName,
          clubName: CLUB_DEMO.name,
          opponent: opponent.trim(),
          matchDate: matchDate.trim(),
          grade: GRADE_INFO[grade]?.label || grade,
          ourTeamColor: ourTeamColor.trim(),
          matchResult: matchResult.trim(),
        }),
      });

      if (!start.jobId) throw new Error('경기 분석 작업을 시작하지 못했습니다.');

      const result = await pollJob<Omit<ClubMatchAnalysisResult, 'id' | 'createdAt'>>(
        start.jobId,
        (stage, progress) =>
          setStatus(`${stage}${typeof progress === 'number' ? ` (${progress}%)` : ''}`),
      );

      const saved = saveClubMatchAnalysis({
        meta: {
          clubName: CLUB_DEMO.name,
          opponent: opponent.trim(),
          matchDate: matchDate.trim(),
          grade: GRADE_INFO[grade]?.label || grade,
          ourTeamColor: ourTeamColor.trim(),
          matchResult: matchResult.trim(),
        },
        ...result,
      });
      setReport(saved);
      setStatus('경기 분석이 완료되었습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '경기 분석에 실패했습니다.');
      setStatus('');
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  const showDemo = () => {
    setReport(DEMO_MATCH_ANALYSIS);
    setError('');
    setStatus('');
  };

  const busy = isUploading || isAnalyzing;

  const gradeOptions = useMemo(() => GRADE_OPTIONS, []);

  return (
    <div className="min-h-screen bg-[#0E1016] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <PageNav showBack />

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate('/club')}
              className="mb-3 text-sm text-white/45 hover:text-white"
            >
              ← 클럽 홈
            </button>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#FFB648]/80">
              CLUB MATCH ANALYSIS
            </p>
            <h1 className="mt-2 text-2xl font-black md:text-3xl">경기 전체 분석</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/55">
              VEO·드림캠 등 멀리서 찍은 경기 영상도 괜찮습니다. 특정 선수 추적 없이 AI가
              <strong className="text-white"> 경기 흐름·팀 전술·주요 장면</strong>을 정리해
              감독·코치진이 빠르게 복기할 수 있게 합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={showDemo}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
          >
            <PlayCircle size={16} />
            데모 리포트 보기
          </button>
        </div>

        {status ? (
          <div className="mt-4 rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
            {status}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {!report ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 md:p-6">
              <h2 className="text-base font-bold">경기 정보 · 영상 업로드</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-white/45">상대팀 *</span>
                  <input className={inputClass} value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="FC 마포" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-white/45">경기일</span>
                  <input className={inputClass} value={matchDate} onChange={(e) => setMatchDate(e.target.value)} placeholder="2026.06.21" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-white/45">스코어</span>
                  <input className={inputClass} value={matchResult} onChange={(e) => setMatchResult(e.target.value)} placeholder="3-1 승" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-white/45">학년/연령</span>
                  <select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value)}>
                    {gradeOptions.map((g) => (
                      <option key={g.id} value={g.id} className="bg-[#1a1a1a]">
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-white/45">우리팀 유니폼 색</span>
                  <input className={inputClass} value={ourTeamColor} onChange={(e) => setOurTeamColor(e.target.value)} placeholder="주황" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-white/45">경기 영상 *</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF9F02] file:px-3 file:py-2 file:text-sm file:font-bold file:text-black"
                  />
                  {file ? (
                    <p className="mt-2 text-xs text-white/45">
                      {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  ) : null}
                </label>
              </div>

              <button
                type="button"
                onClick={handleAnalyze}
                disabled={busy}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF9F02] py-3.5 text-sm font-bold text-black disabled:opacity-50 sm:w-auto sm:px-8"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {busy ? '분석 중...' : '경기 전체 분석 시작'}
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-sm font-bold text-white">분석에 포함되는 내용</div>
                <ul className="mt-3 space-y-2 text-xs leading-6 text-white/55">
                  <li>· 경기 요약 · 전반/후반 흐름</li>
                  <li>· 팀 강점 · 보완점 · 전술 관찰</li>
                  <li>· 주요 장면(클립) · 코칭 제안</li>
                  <li>· 등번호/색상으로 보이는 선수 코멘트</li>
                </ul>
              </div>
              {history.length ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="text-sm font-bold">최근 분석</div>
                  <div className="mt-3 space-y-2">
                    {history.slice(0, 4).map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setReport(h)}
                        className="w-full rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-left text-xs hover:bg-white/5"
                      >
                        <div className="font-semibold text-white">vs {h.meta?.opponent}</div>
                        <div className="text-white/40">{h.meta?.matchDate}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <div className="mb-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setReport(null)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
              >
                <Upload size={16} />
                새 경기 분석
              </button>
              <button
                type="button"
                onClick={() => navigate('/club')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
              >
                <ArrowLeft size={16} />
                클럽 홈
              </button>
            </div>
            <MatchReportView report={report} />
          </div>
        )}
      </div>
    </div>
  );
}
