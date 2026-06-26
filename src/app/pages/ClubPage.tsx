import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageNav from '../components/PageNav';

// ── 클럽 더미 데이터 (실제 서비스 시 DB 연동) ──────────────────────────
const CLUB_DEMO = {
  name: 'AAFC 충암 FC',
  logo: '⚽',
  coach: '김철수 감독',
  location: '서울 성북구',
  founded: '2018',
  grades: [
    {
      id: 'u10',
      label: 'U-10',
      desc: '초등 3~4학년',
      count: 16,
      color: '#3B82F6',
      icon: '🔵',
    },
    {
      id: 'u11',
      label: 'U-11',
      desc: '초등 4~5학년',
      count: 18,
      color: '#10B981',
      icon: '🟢',
    },
    {
      id: 'u12',
      label: 'U-12',
      desc: '초등 5~6학년',
      count: 20,
      color: '#FF9F02',
      icon: '🟡',
    },
    {
      id: 'u13',
      label: 'U-13',
      desc: '중등 1학년',
      count: 15,
      color: '#EF4444',
      icon: '🔴',
    },
    {
      id: 'u15',
      label: 'U-15',
      desc: '중등 2~3학년',
      count: 17,
      color: '#8B5CF6',
      icon: '🟣',
    },
  ],
  recentGames: [
    { date: '2026.06.21', opponent: 'FC 마포', result: '3-1', win: true },
    { date: '2026.06.14', opponent: '강남 유나이티드', result: '2-2', win: null },
    { date: '2026.06.07', opponent: '광진 FC', result: '1-2', win: false },
  ],
  stats: {
    totalAnalysis: 47,
    totalHighlights: 312,
    totalPlayers: 86,
  },
};

const CLUB_ID_KEY = 'kicklens_club_logged_in';

export default function ClubPage() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => !!localStorage.getItem(CLUB_ID_KEY)
  );
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    // 데모: 아무 아이디/비밀번호나 허용
    if (!id.trim() || !pw.trim()) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    localStorage.setItem(CLUB_ID_KEY, id.trim());
    setIsLoggedIn(true);
    setError('');
  };

  const handleLogout = () => {
    localStorage.removeItem(CLUB_ID_KEY);
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0E1016] text-white">
        <div className="mx-auto max-w-md px-6 py-12">
          <PageNav showBack />
          <div className="mt-16 text-center mb-10">
            <div className="text-5xl mb-4">🏟️</div>
            <h1 className="text-3xl font-black text-white">클럽 포털</h1>
            <p className="mt-2 text-white/50 text-sm">클럽 전용 선수 관리 시스템</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/4 p-8 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-white/60 mb-2">클럽 아이디</label>
              <input
                value={id}
                onChange={e => setId(e.target.value)}
                placeholder="클럽 아이디 입력"
                className="w-full rounded-2xl bg-white/8 border border-white/10 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-[#FF9F02]/60"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-white/60 mb-2">비밀번호</label>
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full rounded-2xl bg-white/8 border border-white/10 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-[#FF9F02]/60"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleLogin}
              className="w-full rounded-2xl bg-[#FF9F02] py-4 font-bold text-black text-base hover:bg-[#e8900a] transition"
            >
              클럽 로그인
            </button>
            <p className="text-center text-xs text-white/30">
              베타 기간: 아무 아이디/비밀번호로 체험 가능
            </p>
          </div>
        </div>
      </div>
    );
  }

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
              <div className="flex items-center gap-3 mt-1 text-sm text-white/50">
                <span>👨‍💼 {CLUB_DEMO.coach}</span>
                <span>📍 {CLUB_DEMO.location}</span>
                <span>🗓️ {CLUB_DEMO.founded}년 창단</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/50 hover:text-white hover:border-white/30 transition"
          >
            로그아웃
          </button>
        </div>

        {/* 통계 요약 */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          {[
            { label: '전체 선수', value: CLUB_DEMO.stats.totalPlayers, unit: '명', icon: '👥' },
            { label: 'AI 분석 완료', value: CLUB_DEMO.stats.totalAnalysis, unit: '회', icon: '🧠' },
            { label: '하이라이트', value: CLUB_DEMO.stats.totalHighlights, unit: '개', icon: '🎬' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-white/8 bg-white/3 p-5 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-3xl font-black text-white">{s.value}<span className="text-base font-normal text-white/50 ml-1">{s.unit}</span></div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* 학년별 팀 선택 */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4">📋 학년별 선수 명단</h2>
            <div className="space-y-3">
              {CLUB_DEMO.grades.map(grade => (
                <button
                  key={grade.id}
                  onClick={() => navigate(`/club/grade/${grade.id}`)}
                  className="w-full flex items-center gap-4 rounded-2xl border border-white/8 bg-white/3 p-5 hover:border-white/20 hover:bg-white/6 transition text-left"
                >
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black shrink-0"
                    style={{ background: `${grade.color}22`, border: `1.5px solid ${grade.color}44` }}
                  >
                    <span style={{ color: grade.color }}>{grade.label}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white">{grade.label} ({grade.desc})</span>
                    </div>
                    <div className="text-sm text-white/45 mt-0.5">선수 {grade.count}명 등록</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-white/35">선수 명단 보기</div>
                    </div>
                    <span className="text-white/30 text-lg">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 최근 경기 결과 */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4">📅 최근 경기</h2>
            <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
              {CLUB_DEMO.recentGames.map((game, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-5 py-4 border-b border-white/6 last:border-0"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${game.win === true ? 'bg-green-400' : game.win === false ? 'bg-red-400' : 'bg-yellow-400'}`} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">vs {game.opponent}</div>
                    <div className="text-xs text-white/40">{game.date}</div>
                  </div>
                  <div className={`text-base font-black ${game.win === true ? 'text-green-400' : game.win === false ? 'text-red-400' : 'text-yellow-400'}`}>
                    {game.result}
                  </div>
                  <div className="text-xs text-white/30">
                    {game.win === true ? '승' : game.win === false ? '패' : '무'}
                  </div>
                </div>
              ))}
            </div>

            {/* 영상 업로드 CTA */}
            <div className="mt-4 rounded-2xl border border-[#FF9F02]/30 bg-[#FF9F02]/8 p-5">
              <div className="text-sm font-bold text-[#FF9F02] mb-2">📹 경기 영상 분석</div>
              <p className="text-xs text-white/55 leading-relaxed mb-3">
                드림캠/VEO 등 AI 카메라로 촬영한 경기 영상을 업로드하면 전 선수 자동 분석이 가능해요.
              </p>
              <button
                onClick={() => navigate('/video-analysis')}
                className="w-full rounded-xl bg-[#FF9F02] py-2.5 text-sm font-bold text-black hover:bg-[#e8900a] transition"
              >
                영상 업로드 → 분석 시작
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
