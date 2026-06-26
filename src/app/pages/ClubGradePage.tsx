import { useNavigate, useParams } from 'react-router-dom';
import PageNav from '../components/PageNav';

// ── 더미 선수 데이터 ──────────────────────────────────────────
const GRADE_INFO: Record<string, { label: string; desc: string; color: string }> = {
  u10: { label: 'U-10', desc: '초등 3~4학년', color: '#3B82F6' },
  u11: { label: 'U-11', desc: '초등 4~5학년', color: '#10B981' },
  u12: { label: 'U-12', desc: '초등 5~6학년', color: '#FF9F02' },
  u13: { label: 'U-13', desc: '중등 1학년', color: '#EF4444' },
  u15: { label: 'U-15', desc: '중등 2~3학년', color: '#8B5CF6' },
};

const POSITIONS = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'FW', 'FW'];

function generatePlayers(grade: string, count: number) {
  const names = [
    '김태윤', '이민준', '박지훈', '최준혁', '정우진', '강동현', '윤서준', '임재원',
    '한승민', '오도현', '신예준', '황민재', '조성현', '류지원', '문태양', '노준서',
    '배현우', '권민혁', '성진우', '유재현',
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: `${grade}-${i + 1}`,
    name: names[i % names.length],
    number: i + 1,
    position: POSITIONS[i % POSITIONS.length],
    height: 140 + Math.floor(Math.random() * 30),
    weight: 35 + Math.floor(Math.random() * 20),
    foot: i % 3 === 0 ? '왼발' : '오른발',
    analysisCount: Math.floor(Math.random() * 8),
    lastAnalysis: i % 3 === 0 ? '2026.06.21' : i % 3 === 1 ? '2026.06.14' : null,
    highlight: Math.floor(Math.random() * 15),
    emoji: ['😄', '😊', '🙂', '😎', '🤩'][i % 5],
  }));
}

export default function ClubGradePage() {
  const navigate = useNavigate();
  const { grade = 'u12' } = useParams<{ grade: string }>();
  const info = GRADE_INFO[grade] || GRADE_INFO.u12;
  const players = generatePlayers(grade, info === GRADE_INFO.u10 ? 16 : info === GRADE_INFO.u11 ? 18 : 20);

  return (
    <div className="min-h-screen bg-[#0E1016] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <PageNav showBack />

        {/* 헤더 */}
        <div className="mt-6 flex items-center gap-4 mb-6">
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

        {/* 선수 그리드 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {players.map(player => (
            <button
              key={player.id}
              onClick={() => navigate(`/club/player/${player.id}?grade=${grade}`)}
              className="group rounded-3xl border border-white/8 bg-white/3 p-4 text-left hover:border-white/20 hover:bg-white/6 transition flex flex-col items-center gap-3"
            >
              {/* 선수 사진 (더미 - 실제 서비스 시 실제 사진) */}
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl relative"
                style={{ background: `${info.color}15`, border: `1.5px solid ${info.color}30` }}
              >
                {player.emoji}
                {/* 등번호 배지 */}
                <div
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ background: info.color, color: '#0E1016' }}
                >
                  {player.number}
                </div>
              </div>

              {/* 이름 */}
              <div className="text-center">
                <div className="text-sm font-bold text-white">{player.name}</div>
                <div className="text-xs text-white/40 mt-0.5">{player.position}</div>
              </div>

              {/* 신체 정보 */}
              <div className="w-full grid grid-cols-2 gap-1 text-center">
                <div className="rounded-lg bg-white/5 py-1.5">
                  <div className="text-xs text-white/35">키</div>
                  <div className="text-xs font-bold text-white">{player.height}cm</div>
                </div>
                <div className="rounded-lg bg-white/5 py-1.5">
                  <div className="text-xs text-white/35">몸무게</div>
                  <div className="text-xs font-bold text-white">{player.weight}kg</div>
                </div>
              </div>

              {/* 분석 현황 */}
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-xs">🧠</span>
                  <span className="text-xs text-white/45">{player.analysisCount}회</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs">🎬</span>
                  <span className="text-xs text-white/45">{player.highlight}개</span>
                </div>
              </div>

              {player.lastAnalysis ? (
                <div className="w-full text-center">
                  <span className="inline-flex rounded-full bg-green-500/15 border border-green-500/30 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                    최근 {player.lastAnalysis}
                  </span>
                </div>
              ) : (
                <div className="w-full text-center">
                  <span className="inline-flex rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/30">
                    분석 없음
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
