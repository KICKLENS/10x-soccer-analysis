import { useNavigate } from 'react-router-dom';
import PageNav from '../components/PageNav';
import {
  CLUB_DEMO,
  getAllClubPlayers,
  countByStatus,
  getGradeStatusSummary,
  GRADE_INFO,
  TRACK_STATUS,
  type PlayerTrackStatus,
} from '../lib/clubData';

function StatusBadge({ status, size = 'sm' }: { status: PlayerTrackStatus; size?: 'sm' | 'xs' }) {
  const s = TRACK_STATUS[status];
  const cls = size === 'xs' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${cls}`}
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      {s.icon} {s.short}
    </span>
  );
}

export default function ClubPage() {
  const navigate = useNavigate();

  const allPlayers = getAllClubPlayers();
  const statusCounts = countByStatus(allPlayers);
  const attentionPlayers = allPlayers
    .filter((p) => p.status === 'needs_work' || p.status === 'no_data')
    .slice(0, 6);
  const youthConfirmed = allPlayers.filter((p) => p.status === 'youth_confirmed');

  return (
    <div className="min-h-screen bg-[#0E1016] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <PageNav showBack />

        {/* 클럽 헤더 */}
        <div className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-r from-[#FF9F02]/10 to-white/3 p-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FF9F02]/20 text-4xl">
              {CLUB_DEMO.logo}
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">{CLUB_DEMO.name}</h1>
            </div>
          </div>
          <span className="rounded-xl border border-[#FF9F02]/30 bg-[#FF9F02]/10 px-4 py-2 text-xs font-semibold text-[#FF9F02]">
            베타 데모 — 로그인 없이 체험
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/club/match-analysis')}
            className="rounded-2xl border border-indigo-400/40 bg-indigo-500/15 px-5 py-2.5 text-sm font-bold text-indigo-100 hover:bg-indigo-500/25 transition"
          >
            📋 경기 전체 분석
          </button>
        </div>

        {/* 통합 커맨드 센터 */}
        <div className="mt-5 rounded-3xl border border-white/10 bg-white/3 p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold text-white">📊 선수 관리 현황판</h2>
              <p className="text-xs text-white/40 mt-0.5">학년·유스 진학·육성 상태를 한눈에 확인</p>
            </div>
            <div className="text-sm text-white/45">
              전체 <span className="font-bold text-white">{allPlayers.length}</span>명
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(Object.keys(TRACK_STATUS) as PlayerTrackStatus[]).map((key) => {
              const s = TRACK_STATUS[key];
              return (
                <div
                  key={key}
                  className="rounded-2xl p-4"
                  style={{ background: s.bg, border: `1px solid ${s.border}` }}
                >
                  <div className="text-xl mb-1">{s.icon}</div>
                  <div className="text-2xl font-black" style={{ color: s.color }}>
                    {statusCounts[key]}
                    <span className="text-sm font-normal text-white/40 ml-1">명</span>
                  </div>
                  <div className="text-xs font-semibold mt-1" style={{ color: s.color }}>
                    {s.label}
                  </div>
                  <div className="text-[10px] text-white/35 mt-1 leading-snug">{s.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 통계 요약 */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          {[
            { label: '전체 선수', value: allPlayers.length, unit: '명', icon: '👥' },
            { label: 'AI 분석 완료', value: CLUB_DEMO.stats.totalAnalysis, unit: '회', icon: '🧠' },
            { label: '하이라이트', value: CLUB_DEMO.stats.totalHighlights, unit: '개', icon: '🎬' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/8 bg-white/3 p-5 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-3xl font-black text-white">
                {s.value}
                <span className="text-base font-normal text-white/50 ml-1">{s.unit}</span>
              </div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            {/* 학년별 팀 — 상태 미니 차트 포함 */}
            <div>
              <h2 className="text-lg font-bold text-white mb-4">📋 학년별 선수 명단</h2>
              <div className="space-y-3">
                {Object.entries(GRADE_INFO).map(([gradeId, grade]) => {
                  const summary = getGradeStatusSummary(gradeId);
                  const total = grade.count;
                  return (
                    <button
                      key={gradeId}
                      onClick={() => navigate(`/club/grade/${gradeId}`)}
                      className="w-full flex items-center gap-4 rounded-2xl border border-white/8 bg-white/3 p-5 hover:border-white/20 hover:bg-white/6 transition text-left"
                    >
                      <div
                        className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-black shrink-0"
                        style={{ background: `${grade.color}22`, border: `1.5px solid ${grade.color}44`, color: grade.color }}
                      >
                        {grade.label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-bold text-white">
                          {grade.label} ({grade.desc})
                        </div>
                        <div className="text-sm text-white/45 mt-0.5">선수 {total}명</div>
                        {/* 상태 바 */}
                        <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-white/8">
                          {(Object.keys(TRACK_STATUS) as PlayerTrackStatus[]).map((key) => {
                            const pct = (summary[key] / total) * 100;
                            if (pct === 0) return null;
                            return (
                              <div
                                key={key}
                                style={{ width: `${pct}%`, background: TRACK_STATUS[key].color }}
                                title={`${TRACK_STATUS[key].label}: ${summary[key]}명`}
                              />
                            );
                          })}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {summary.youth_confirmed > 0 && (
                            <span className="text-[10px] text-purple-300">🏆 유스 {summary.youth_confirmed}</span>
                          )}
                          {summary.needs_work > 0 && (
                            <span className="text-[10px] text-yellow-300">⚠️ 보완 {summary.needs_work}</span>
                          )}
                          {summary.no_data > 0 && (
                            <span className="text-[10px] text-white/35">❓ 미분석 {summary.no_data}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-white/30 text-lg shrink-0">→</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 유스 진학 확정 선수 */}
            {youthConfirmed.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-4">🏆 유스 진학 확정 선수</h2>
                <div className="rounded-2xl border border-purple-500/25 bg-purple-500/8 overflow-hidden">
                  {youthConfirmed.map((p) => {
                    const grade = GRADE_INFO[p.grade];
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/club/player/${p.id}?grade=${p.grade}`)}
                        className="w-full flex items-center gap-4 px-5 py-3.5 border-b border-white/6 last:border-0 hover:bg-white/5 transition text-left"
                      >
                        <span className="text-2xl">{p.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white">{p.name}</span>
                            <span className="text-xs text-white/40">#{p.number} · {p.position}</span>
                            <StatusBadge status="youth_confirmed" size="xs" />
                          </div>
                          <div className="text-xs text-purple-300 mt-0.5">{p.youthClub}</div>
                        </div>
                        <span
                          className="text-xs font-bold shrink-0"
                          style={{ color: grade.color }}
                        >
                          {grade.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* 주의 필요 선수 */}
            <div>
              <h2 className="text-lg font-bold text-white mb-4">🔔 확인 필요</h2>
              <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
                {attentionPlayers.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-white/40">모든 선수 관리 완료</div>
                ) : (
                  attentionPlayers.map((p) => {
                    const grade = GRADE_INFO[p.grade];
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/club/player/${p.id}?grade=${p.grade}`)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-white/6 last:border-0 hover:bg-white/5 transition text-left"
                      >
                        <span className="text-xl">{p.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white">{p.name}</div>
                          <div className="text-xs text-white/40">{grade.label} · {p.position}</div>
                        </div>
                        <StatusBadge status={p.status} size="xs" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* 최근 경기 */}
            <div>
              <h2 className="text-lg font-bold text-white mb-4">📅 최근 경기</h2>
              <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
                {CLUB_DEMO.recentGames.map((game, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      navigate('/club/match-analysis', {
                        state: {
                          opponent: game.opponent,
                          matchDate: game.date,
                          matchResult: game.result,
                        },
                      })
                    }
                    className="flex w-full items-center gap-3 px-5 py-4 border-b border-white/6 last:border-0 hover:bg-white/5 transition text-left"
                  >
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        game.win === true ? 'bg-green-400' : game.win === false ? 'bg-red-400' : 'bg-yellow-400'
                      }`}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white">vs {game.opponent}</div>
                      <div className="text-xs text-white/40">{game.date}</div>
                    </div>
                    <div
                      className={`text-base font-black ${
                        game.win === true ? 'text-green-400' : game.win === false ? 'text-red-400' : 'text-yellow-400'
                      }`}
                    >
                      {game.result}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 경기 전체 분석 — 클럽 코치진용 */}
            <div className="rounded-2xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/15 to-[#FF9F02]/10 p-5">
              <div className="text-sm font-bold text-indigo-200 mb-1">📋 경기 전체 분석</div>
              <p className="text-xs text-white/55 leading-relaxed mb-3">
                VEO·드림캠 영상을 올리면 특정 선수 추적 없이 AI가 경기 흐름·팀 전술·주요 장면을
                정리합니다. 감독·코치진 복기용입니다.
              </p>
              <button
                onClick={() => navigate('/club/match-analysis')}
                className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-bold text-white hover:bg-indigo-400 transition"
              >
                경기 전체 분석 시작 →
              </button>
            </div>

            {/* 선수 개별 분석 */}
            <div className="rounded-2xl border border-[#FF9F02]/30 bg-[#FF9F02]/8 p-5">
              <div className="text-sm font-bold text-[#FF9F02] mb-2">👤 선수 개별 AI 분석</div>
              <p className="text-xs text-white/55 leading-relaxed mb-3">
                가까이 찍은 영상 또는 선수 지정 후, 한 명씩 심층 코칭 리포트를 받을 수 있어요.
              </p>
              <button
                onClick={() => navigate('/video-analysis')}
                className="w-full rounded-xl bg-[#FF9F02] py-2.5 text-sm font-bold text-black hover:bg-[#e8900a] transition"
              >
                선수별 영상 분석 →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
