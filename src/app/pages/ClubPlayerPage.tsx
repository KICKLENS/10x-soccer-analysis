import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageNav from '../components/PageNav';
import {
  getPlayerById,
  GRADE_INFO,
  TRACK_STATUS,
} from '../lib/clubData';

const DUMMY_ANALYSES = [
  {
    date: '2026.06.21',
    opponent: 'FC 마포',
    strength: '빠른 전환 속도, 공격 전환 시 스프린트 타이밍이 매우 좋음. 드리블 후 패스 선택이 안정적.',
    weakness: '수비 시 뒤돌기 반응 속도가 느림. 상대 오른발 공격수 대응 훈련 필요.',
    training: '1대1 수비 전환 드릴, 측면 수비 포지셔닝 반복 훈련',
    highlights: 3,
    ballInvolvement: 12,
    score: 82,
  },
  {
    date: '2026.06.07',
    opponent: '광진 FC',
    strength: '헤딩 경합 우세, 코너킥 상황 판단이 좋음.',
    weakness: '볼 트래핑 불안정. 강한 패스 처리 시 발 앞에서 튀는 경우 있음.',
    training: '트래핑 정확도 훈련, 발 안쪽 트랩 집중 반복',
    highlights: 2,
    ballInvolvement: 8,
    score: 71,
  },
];

const CHECKLIST_ITEMS = [
  { id: 'video', label: '최근 경기 영상 업로드', done: true },
  { id: 'analysis', label: 'AI 분석 리포트 확인', done: true },
  { id: 'training', label: '훈련 포인트 전달 (선수·학부모)', done: false },
  { id: 'portfolio', label: '유스 포트폴리오 영상 갱신', done: false },
];

export default function ClubPlayerPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const grade = searchParams.get('grade') || 'u12';
  const info = GRADE_INFO[grade] || GRADE_INFO.u12;

  const player = useMemo(() => getPlayerById(id, grade), [id, grade]);

  if (!player) {
    return (
      <div className="min-h-screen bg-[#0E1016] text-white flex items-center justify-center">
        <p className="text-white/50">선수를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const statusInfo = TRACK_STATUS[player.status];
  const analyses = player.status === 'no_data' ? [] : DUMMY_ANALYSES;
  const avgScore = player.avgScore ?? (analyses.length
    ? Math.round(analyses.reduce((s, a) => s + a.score, 0) / analyses.length)
    : null);

  const checklist = CHECKLIST_ITEMS.map((item) => ({
    ...item,
    done: player.status === 'no_data'
      ? item.id === 'video' ? false : false
      : player.status === 'youth_confirmed'
        ? item.id !== 'portfolio' ? true : false
        : item.done,
  }));

  return (
    <div className="min-h-screen bg-[#0E1016] text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <PageNav showBack />

        <div className="mt-4 flex items-center gap-2 text-sm text-white/35 mb-6">
          <button onClick={() => navigate('/club')} className="hover:text-white transition">클럽 홈</button>
          <span>/</span>
          <button onClick={() => navigate(`/club/grade/${grade}`)} className="hover:text-white transition">{info.label} 명단</button>
          <span>/</span>
          <span className="text-white/70">{player.name}</span>
        </div>

        {/* 선수 프로필 */}
        <div
          className="rounded-3xl border p-6 mb-6"
          style={{ borderColor: `${info.color}44`, background: `${info.color}0a` }}
        >
          <div className="flex items-start gap-6 flex-wrap">
            <div
              className="w-28 h-28 rounded-3xl flex items-center justify-center text-6xl relative shrink-0"
              style={{ background: `${info.color}18`, border: `2px solid ${info.color}40` }}
            >
              {player.emoji}
              <div
                className="absolute -top-3 -right-3 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black"
                style={{ background: info.color, color: '#0E1016' }}
              >
                {player.number}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-3xl font-black text-white">{player.name}</h1>
                <span
                  className="rounded-full px-3 py-1 text-sm font-bold"
                  style={{ background: `${info.color}25`, color: info.color }}
                >
                  {player.position}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: statusInfo.bg, border: `1px solid ${statusInfo.border}`, color: statusInfo.color }}
                >
                  {statusInfo.icon} {statusInfo.label}
                </span>
              </div>

              {player.youthClub && (
                <div className="rounded-xl bg-purple-500/12 border border-purple-500/30 px-4 py-2 mb-3 inline-block">
                  <span className="text-sm text-purple-300">🏆 {player.youthClub} 입단 확정</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: '키', value: `${player.height}cm` },
                  { label: '몸무게', value: `${player.weight}kg` },
                  { label: '주발', value: player.foot },
                  { label: '학년', value: info.label },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl bg-white/5 px-3 py-2.5">
                    <div className="text-xs text-white/40 mb-0.5">{item.label}</div>
                    <div className="text-sm font-bold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 w-full sm:w-auto">
              {[
                { label: 'AI 분석', value: player.analysisCount, unit: '회', icon: '🧠' },
                { label: '하이라이트', value: player.highlightCount, unit: '개', icon: '🎬' },
                { label: '평균 점수', value: avgScore ?? '—', unit: avgScore ? '점' : '', icon: '⭐' },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl bg-white/5 p-3 text-center">
                  <div className="text-xl">{s.icon}</div>
                  <div className="text-xl font-black text-white mt-1">
                    {s.value}
                    <span className="text-xs font-normal text-white/40 ml-0.5">{s.unit}</span>
                  </div>
                  <div className="text-xs text-white/35">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* 육성 로드맵 */}
          <div className="rounded-3xl border border-white/8 bg-white/3 p-6">
            <h2 className="text-base font-bold text-white mb-4">🎯 육성 현황</h2>

            {player.strengthTags.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-white/40 mb-2">강점</div>
                <div className="flex flex-wrap gap-2">
                  {player.strengthTags.map((tag) => (
                    <span key={tag} className="rounded-full bg-green-500/12 border border-green-500/30 px-3 py-1 text-xs text-green-400">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {player.weaknessTags.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-white/40 mb-2">보완 포인트</div>
                <div className="flex flex-wrap gap-2">
                  {player.weaknessTags.map((tag) => (
                    <span key={tag} className="rounded-full bg-amber-500/12 border border-amber-500/30 px-3 py-1 text-xs text-amber-400">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {player.growthTrend && (
              <div className="rounded-2xl bg-white/5 p-4 mb-4">
                <div className="text-xs text-white/40 mb-1">성장 추세</div>
                <div className="text-sm font-semibold text-white">
                  {player.growthTrend === 'up' && '📈 상승세 — 최근 분석 점수 개선'}
                  {player.growthTrend === 'flat' && '➡️ 유지 — 안정적 성장 중'}
                  {player.growthTrend === 'down' && '📉 주의 — 집중 관리 필요'}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-white/5 p-4">
              <div className="text-xs text-white/40 mb-1">코치 메모</div>
              <p className="text-sm text-white/70 leading-relaxed">{player.coachNote}</p>
            </div>
          </div>

          {/* 관리 체크리스트 */}
          <div className="rounded-3xl border border-white/8 bg-white/3 p-6">
            <h2 className="text-base font-bold text-white mb-4">✅ 코치 관리 체크리스트</h2>
            <div className="space-y-3">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                    item.done ? 'bg-green-500/8 border border-green-500/20' : 'bg-white/5 border border-white/8'
                  }`}
                >
                  <span className="text-lg">{item.done ? '✅' : '⬜'}</span>
                  <span className={`text-sm ${item.done ? 'text-white/60 line-through' : 'text-white'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-white/30 mt-4">
              * 실제 서비스에서는 코치가 직접 체크·메모를 저장할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 분석 이력 */}
        <h2 className="text-lg font-bold text-white mb-4">📊 경기별 분석 리포트</h2>

        {analyses.length === 0 ? (
          <div className="rounded-3xl border border-white/8 bg-white/3 p-10 text-center mb-6">
            <div className="text-4xl mb-3">📹</div>
            <p className="text-white/50 text-sm mb-4">아직 AI 분석 기록이 없습니다.</p>
            <button
              onClick={() => navigate('/video-analysis')}
              className="rounded-xl bg-[#FF9F02] px-6 py-2.5 text-sm font-bold text-black hover:bg-[#e8900a] transition"
            >
              첫 분석 시작하기
            </button>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            {analyses.map((analysis, i) => (
              <div key={i} className="rounded-3xl border border-white/8 bg-white/3 p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <div className="text-sm font-bold text-white">vs {analysis.opponent}</div>
                    <div className="text-xs text-white/40">{analysis.date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 rounded-xl bg-white/6 px-3 py-1.5">
                      <span className="text-xs text-white/50">공 관여</span>
                      <span className="text-sm font-bold text-white">{analysis.ballInvolvement}회</span>
                    </div>
                    <div
                      className="flex items-center gap-1 rounded-xl px-3 py-1.5 font-black text-sm"
                      style={{
                        background: analysis.score >= 80 ? '#10B98120' : analysis.score >= 70 ? '#FF9F0220' : '#EF444420',
                        color: analysis.score >= 80 ? '#10B981' : analysis.score >= 70 ? '#FF9F02' : '#EF4444',
                      }}
                    >
                      ⭐ {analysis.score}점
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-green-500/8 border border-green-500/20 p-4">
                    <div className="text-xs font-bold text-green-400 mb-2">💪 잘한 점</div>
                    <p className="text-xs text-white/70 leading-relaxed">{analysis.strength}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-4">
                    <div className="text-xs font-bold text-amber-400 mb-2">📌 보완할 점</div>
                    <p className="text-xs text-white/70 leading-relaxed">{analysis.weakness}</p>
                  </div>
                  <div className="rounded-2xl bg-blue-500/8 border border-blue-500/20 p-4">
                    <div className="text-xs font-bold text-blue-400 mb-2">🏋️ 훈련 포인트</div>
                    <p className="text-xs text-white/70 leading-relaxed">{analysis.training}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-3xl border border-[#FF9F02]/30 bg-[#FF9F02]/8 p-6 text-center">
          <div className="text-2xl mb-2">📹</div>
          <div className="text-base font-bold text-white mb-1">{player.name} 선수 새 경기 분석</div>
          <p className="text-sm text-white/50 mb-4">경기 영상을 업로드하면 AI가 자동으로 분석 리포트를 생성해요.</p>
          <button
            onClick={() => navigate('/video-analysis')}
            className="rounded-2xl bg-[#FF9F02] px-8 py-3 font-bold text-black hover:bg-[#e8900a] transition"
          >
            영상 업로드 → 분석 시작
          </button>
        </div>
      </div>
    </div>
  );
}
