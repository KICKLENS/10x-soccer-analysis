import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageNav from '../components/PageNav';
import {
  generateGradePlayers,
  GRADE_INFO,
  TRACK_STATUS,
  countByStatus,
  type PlayerTrackStatus,
} from '../lib/clubData';

const ALL_STATUS = 'all' as const;
type FilterStatus = PlayerTrackStatus | typeof ALL_STATUS;

function StatusBadge({ status }: { status: PlayerTrackStatus }) {
  const s = TRACK_STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      {s.icon} {s.short}
    </span>
  );
}

export default function ClubGradePage() {
  const navigate = useNavigate();
  const { grade = 'u12' } = useParams<{ grade: string }>();
  const info = GRADE_INFO[grade] || GRADE_INFO.u12;
  const players = useMemo(() => generateGradePlayers(grade), [grade]);
  const summary = useMemo(() => countByStatus(players), [players]);

  const [filter, setFilter] = useState<FilterStatus>(ALL_STATUS);
  const [sortBy, setSortBy] = useState<'number' | 'score' | 'status'>('number');

  const filtered = useMemo(() => {
    let list = filter === ALL_STATUS ? [...players] : players.filter((p) => p.status === filter);
    if (sortBy === 'score') {
      list.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));
    } else if (sortBy === 'status') {
      const order: PlayerTrackStatus[] = ['youth_confirmed', 'needs_work', 'no_data', 'developing'];
      list.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
    } else {
      list.sort((a, b) => a.number - b.number);
    }
    return list;
  }, [players, filter, sortBy]);

  const filterTabs: { key: FilterStatus; label: string; count: number }[] = [
    { key: ALL_STATUS, label: '전체', count: players.length },
    ...(Object.keys(TRACK_STATUS) as PlayerTrackStatus[]).map((key) => ({
      key,
      label: TRACK_STATUS[key].short,
      count: summary[key],
    })),
  ];

  return (
    <div className="min-h-screen bg-[#0E1016] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <PageNav showBack />

        {/* 헤더 */}
        <div className="mt-6 flex items-center gap-4 mb-4">
          <button onClick={() => navigate('/club')} className="text-white/40 hover:text-white transition text-sm">
            ← 클럽 홈
          </button>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black"
            style={{ background: `${info.color}22`, border: `1.5px solid ${info.color}55`, color: info.color }}
          >
            {info.label}
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">{info.label} 선수 명단</h1>
            <p className="text-sm text-white/45">{info.desc} · {players.length}명</p>
          </div>
        </div>

        {/* 학년 요약 바 */}
        <div className="rounded-2xl border border-white/8 bg-white/3 p-4 mb-5">
          <div className="text-xs text-white/40 mb-2">학년별 상태 분포</div>
          <div className="flex h-2 rounded-full overflow-hidden bg-white/8 mb-3">
            {(Object.keys(TRACK_STATUS) as PlayerTrackStatus[]).map((key) => {
              const pct = (summary[key] / players.length) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={key}
                  style={{ width: `${pct}%`, background: TRACK_STATUS[key].color }}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(TRACK_STATUS) as PlayerTrackStatus[]).map((key) => (
              <div key={key} className="text-center rounded-xl py-2" style={{ background: TRACK_STATUS[key].bg }}>
                <div className="text-lg font-black" style={{ color: TRACK_STATUS[key].color }}>
                  {summary[key]}
                </div>
                <div className="text-[10px] text-white/45">{TRACK_STATUS[key].short}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 필터 + 정렬 */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === tab.key
                  ? 'bg-[#FF9F02] text-black'
                  : 'bg-white/8 text-white/50 hover:text-white hover:bg-white/12'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-white/35">정렬</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-xl bg-white/8 border border-white/10 px-3 py-1.5 text-xs text-white outline-none"
            >
              <option value="number">등번호</option>
              <option value="score">분석 점수</option>
              <option value="status">관리 우선순위</option>
            </select>
          </div>
        </div>

        {/* 선수 그리드 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((player) => (
            <button
              key={player.id}
              onClick={() => navigate(`/club/player/${player.id}?grade=${grade}`)}
              className="group rounded-3xl border border-white/8 bg-white/3 p-4 text-left hover:border-white/20 hover:bg-white/6 transition flex flex-col items-center gap-2"
            >
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl relative"
                style={{ background: `${info.color}15`, border: `1.5px solid ${info.color}30` }}
              >
                {player.emoji}
                <div
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ background: info.color, color: '#0E1016' }}
                >
                  {player.number}
                </div>
              </div>

              <div className="text-center w-full">
                <div className="text-sm font-bold text-white">{player.name}</div>
                <div className="text-xs text-white/40 mt-0.5">{player.position}</div>
              </div>

              <StatusBadge status={player.status} />

              {player.youthClub && (
                <div className="w-full text-center text-[10px] text-purple-300 truncate px-1">
                  → {player.youthClub}
                </div>
              )}

              <div className="w-full grid grid-cols-2 gap-1 text-center">
                <div className="rounded-lg bg-white/5 py-1.5">
                  <div className="text-xs text-white/35">키</div>
                  <div className="text-xs font-bold text-white">{player.height}cm</div>
                </div>
                <div className="rounded-lg bg-white/5 py-1.5">
                  <div className="text-xs text-white/35">점수</div>
                  <div className="text-xs font-bold text-white">
                    {player.avgScore ?? '—'}
                  </div>
                </div>
              </div>

              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-xs">🧠</span>
                  <span className="text-xs text-white/45">{player.analysisCount}회</span>
                </div>
                {player.growthTrend && (
                  <span className="text-xs">
                    {player.growthTrend === 'up' ? '📈' : player.growthTrend === 'down' ? '📉' : '➡️'}
                  </span>
                )}
              </div>

              {player.weaknessTags.length > 0 && player.status === 'needs_work' && (
                <div className="w-full text-center">
                  <span className="inline-flex rounded-full bg-yellow-500/10 border border-yellow-500/25 px-2 py-0.5 text-[10px] text-yellow-400">
                    {player.weaknessTags[0]}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-white/40 text-sm">해당 상태의 선수가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
