/**
 * 오늘의 전술 카드
 * 날짜 기반으로 하루 1개 전술 카드를 보여주고 퀴즈로 XP 획득.
 */
import { useState, useEffect, useRef } from 'react';

// ─── 전술 데이터 ───────────────────────────────────────────────
type QuizOption = { id: string; label: string; correct: boolean };
type Player = { x: number; y: number; team: 'blue' | 'red' | 'yellow'; label?: string };
type Arrow = { from: [number, number]; to: [number, number]; color: string; dashed?: boolean };

type TacticData = {
  id: string;
  title: string;
  subtitle: string;
  concept: string;           // 핵심 개념 한 줄 설명
  description: string;       // 상황 설명
  players: Player[];
  arrows: Arrow[];           // 정답 화살표 (퀴즈 정답 후 표시)
  quizQuestion: string;
  options: QuizOption[];
  explanation: string;       // 정답 후 설명
  xp: number;
};

const TACTICS: TacticData[] = [
  {
    id: 'space_creation',
    title: '공간 만들기',
    subtitle: '움직임의 기본',
    concept: '공 없을 때 달려야 팀이 산다',
    description: '파란 팀이 공을 갖고 있어요. 파란 선수 A는 수비수 근처에 가만히 서 있어요. 공을 받으려면 어떻게 해야 할까요?',
    players: [
      { x: 30, y: 50, team: 'blue', label: 'B' },   // 공 가진 선수
      { x: 65, y: 45, team: 'blue', label: 'A' },   // 움직여야 할 선수
      { x: 60, y: 48, team: 'red' },                  // 수비수
      { x: 75, y: 55, team: 'red' },
    ],
    arrows: [
      { from: [65, 45], to: [75, 30], color: '#60D394', dashed: false },  // A가 달려야 할 방향
      { from: [30, 50], to: [75, 30], color: '#60D394', dashed: true },   // 패스 경로
    ],
    quizQuestion: '파란 선수 A는 어떻게 해야 공을 받을 수 있을까요?',
    options: [
      { id: 'a', label: '공을 향해 달려간다', correct: false },
      { id: 'b', label: '수비수 반대 방향 공간으로 달린다', correct: true },
      { id: 'c', label: '제자리에서 손을 든다', correct: false },
    ],
    explanation: '수비수 반대 방향으로 달리면 "공간"이 생겨요! 수비수가 따라오면 팀원이 그 빈 공간을 쓸 수 있고, 수비수가 안 따라오면 내가 패스를 받을 수 있어요. 공 없을 때의 움직임이 축구의 핵심이에요.',
    xp: 30,
  },
  {
    id: 'triangle_pass',
    title: '삼각형 패스',
    subtitle: '패스의 기본',
    concept: '3명이 삼각형을 만들면 패스가 쉬워진다',
    description: '파란 선수들이 일직선으로 서 있어요. 수비수가 쉽게 막을 수 있는 상황이에요. 어떻게 위치를 바꿔야 할까요?',
    players: [
      { x: 25, y: 50, team: 'blue', label: 'A' },
      { x: 50, y: 50, team: 'blue', label: 'B' },
      { x: 75, y: 50, team: 'blue', label: 'C' },
      { x: 45, y: 50, team: 'red' },
      { x: 70, y: 50, team: 'red' },
    ],
    arrows: [
      { from: [50, 50], to: [50, 30], color: '#60D394' },
    ],
    quizQuestion: '파란 선수 B가 이동해서 삼각형을 만들려면 어디로 가야 할까요?',
    options: [
      { id: 'a', label: '선수 A 옆으로 더 가까이', correct: false },
      { id: 'b', label: '앞으로 나가서 삼각형 꼭짓점 만들기', correct: true },
      { id: 'c', label: '뒤로 빠져서 수비를 돕는다', correct: false },
    ],
    explanation: 'A-B-C가 삼각형이 되면 어느 방향으로든 패스 경로가 생겨요! 수비수 한 명이 한 선수를 막아도 나머지 두 방향은 열려 있어요. 삼각형은 패스 축구의 기본이에요.',
    xp: 30,
  },
  {
    id: 'pressing',
    title: '압박 (프레싱)',
    subtitle: '수비의 기본',
    concept: '공을 잃으면 팀 전체가 함께 되찾는다',
    description: '빨간 팀이 공을 갖게 됐어요. 파란 선수들은 어떻게 해야 할까요?',
    players: [
      { x: 55, y: 45, team: 'red', label: '공' },
      { x: 70, y: 35, team: 'red' },
      { x: 70, y: 60, team: 'red' },
      { x: 35, y: 45, team: 'blue', label: 'A' },
      { x: 45, y: 30, team: 'blue', label: 'B' },
      { x: 45, y: 65, team: 'blue', label: 'C' },
    ],
    arrows: [
      { from: [35, 45], to: [52, 45], color: '#60D394' },
      { from: [45, 30], to: [55, 37], color: '#60D394' },
      { from: [45, 65], to: [55, 55], color: '#60D394' },
    ],
    quizQuestion: '공을 잃었을 때 파란 팀은 어떻게 해야 할까요?',
    options: [
      { id: 'a', label: '빨리 우리 골대 앞으로 돌아간다', correct: false },
      { id: 'b', label: '공 근처로 같이 달려가서 압박한다', correct: true },
      { id: 'c', label: '각자 상대 선수 한 명씩 맡는다', correct: false },
    ],
    explanation: '공을 잃은 직후 5초 안에 바로 압박하면 상대가 패스할 틈이 없어요! 팀 전체가 공 쪽으로 좁혀가면 공간이 줄어들어서 공을 빼앗기 쉬워져요. 이걸 "게겐프레싱"이라고 해요.',
    xp: 35,
  },
  {
    id: 'defensive_line',
    title: '수비 라인',
    subtitle: '팀 수비의 기본',
    concept: '수비수들은 같이 올라가고 같이 내려온다',
    description: '우리 팀이 공격할 때 수비수들이 어디 있어야 할까요? 한 명은 앞에, 한 명은 뒤에 있으면 어떻게 될까요?',
    players: [
      { x: 70, y: 40, team: 'blue' },
      { x: 75, y: 50, team: 'blue', label: '공격' },
      { x: 40, y: 50, team: 'blue', label: 'D1' },
      { x: 55, y: 65, team: 'blue', label: 'D2' },
      { x: 60, y: 35, team: 'red', label: '위험' },
    ],
    arrows: [
      { from: [55, 65], to: [40, 65], color: '#60D394' },
    ],
    quizQuestion: '수비수 D2는 D1과 같은 라인에 맞춰야 할까요?',
    options: [
      { id: 'a', label: '아니요, 제자리에 있는게 안전해요', correct: false },
      { id: 'b', label: '네, 같은 선에 맞춰야 오프사이드 트랩이 돼요', correct: true },
      { id: 'c', label: '더 앞으로 나가야 해요', correct: false },
    ],
    explanation: '수비수들이 같은 라인에 있으면 "오프사이드 트랩"이 돼요! 한 명이 뒤에 처지면 상대 공격수가 오프사이드 없이 뒤 공간으로 달릴 수 있어서 위험해요. 수비는 항상 같이 올라가고 같이 내려와요.',
    xp: 35,
  },
  {
    id: 'corner_kick',
    title: '코너킥',
    subtitle: '세트피스 기본',
    concept: '코너킥은 미리 약속한 대로 움직인다',
    description: '우리 팀이 코너킥을 얻었어요. 선수들이 어디에 서야 할까요? 다 같이 골대 앞에 몰리면 좋을까요?',
    players: [
      { x: 95, y: 10, team: 'blue', label: 'CK' },
      { x: 80, y: 45, team: 'blue', label: 'A' },
      { x: 80, y: 25, team: 'blue', label: 'B' },
      { x: 70, y: 55, team: 'blue', label: 'C' },
      { x: 50, y: 50, team: 'blue', label: 'D' },
      { x: 78, y: 45, team: 'red' },
      { x: 78, y: 25, team: 'red' },
    ],
    arrows: [
      { from: [80, 45], to: [75, 38], color: '#60D394' },
      { from: [80, 25], to: [82, 40], color: '#60D394' },
    ],
    quizQuestion: '코너킥 상황에서 가장 중요한 것은?',
    options: [
      { id: 'a', label: '다 같이 골대 앞으로 몰린다', correct: false },
      { id: 'b', label: '미리 약속한 위치에 서서 신호에 맞춰 움직인다', correct: true },
      { id: 'c', label: '키 큰 선수만 들어가고 나머지는 뒤에 있는다', correct: false },
    ],
    explanation: '세트피스는 "약속 플레이"예요! 선수마다 맡은 자리가 있고, 키커의 신호에 맞춰 동시에 움직여야 해요. 일부는 앞으로, 일부는 공간으로 달리면 수비가 누구를 막아야 할지 헷갈려요. 팀으로 하는 숨겨진 전술이에요.',
    xp: 40,
  },
];

// 날짜 기반으로 오늘의 전술 선택
function getTodayTactic(): TacticData {
  const today = new Date();
  const dayIndex = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
  return TACTICS[dayIndex % TACTICS.length];
}

// ─── SVG 필드 ──────────────────────────────────────────────────
function SoccerField({
  players,
  arrows,
  showArrows,
}: {
  players: Player[];
  arrows: Arrow[];
  showArrows: boolean;
}) {
  const W = 320, H = 180;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl" style={{ background: '#2d7a3a' }}>
      {/* 필드 라인 */}
      <rect x="8" y="8" width={W - 16} height={H - 16} rx="4" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {/* 중앙선 */}
      <line x1={W / 2} y1="8" x2={W / 2} y2={H - 8} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {/* 중앙원 */}
      <circle cx={W / 2} cy={H / 2} r="28" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {/* 왼쪽 골대 */}
      <rect x="8" y={H / 2 - 22} width="18" height="44" rx="2" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      {/* 오른쪽 골대 */}
      <rect x={W - 26} y={H / 2 - 22} width="18" height="44" rx="2" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      {/* 페널티 박스 왼쪽 */}
      <rect x="8" y={H / 2 - 42} width="48" height="84" rx="2" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      {/* 페널티 박스 오른쪽 */}
      <rect x={W - 56} y={H / 2 - 42} width="48" height="84" rx="2" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />

      {/* 정답 화살표 */}
      {showArrows && arrows.map((a, i) => {
        const [x1, y1] = [a.from[0] * W / 100, a.from[1] * H / 100];
        const [x2, y2] = [a.to[0] * W / 100, a.to[1] * H / 100];
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        return (
          <g key={i}>
            <defs>
              <marker id={`arr-${i}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={a.color} />
              </marker>
            </defs>
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={a.color} strokeWidth="2.5"
              strokeDasharray={a.dashed ? '6,4' : undefined}
              markerEnd={`url(#arr-${i})`}
              style={{ animation: 'fadeIn 0.5s ease' }}
            />
          </g>
        );
      })}

      {/* 선수 */}
      {players.map((p, i) => {
        const cx = p.x * W / 100;
        const cy = p.y * H / 100;
        const color = p.team === 'blue' ? '#3B82F6' : p.team === 'red' ? '#EF4444' : '#FACC15';
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="10" fill={color} stroke="white" strokeWidth="1.5" />
            {p.label && (
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────
const TACTIC_XP_KEY = 'tactical-card-xp';

function getTodayKey() {
  const d = new Date();
  return `tactic-done-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type Props = {
  onXpGained?: (xp: number) => void;
};

export default function TacticalCard({ onXpGained }: Props) {
  const tactic = getTodayTactic();
  const todayKey = getTodayKey();

  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [selected, setSelected] = useState<string | null>(null);
  const [alreadyDone, setAlreadyDone] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(todayKey);
    if (done === '1') setAlreadyDone(true);
  }, [todayKey]);

  const correct = tactic.options.find(o => o.id === selected)?.correct ?? false;

  const handleSelect = (id: string) => {
    if (phase !== 'quiz') return;
    setSelected(id);
    setPhase('result');
    if (!alreadyDone) {
      localStorage.setItem(todayKey, '1');
      setAlreadyDone(true);
      const isCorrect = tactic.options.find(o => o.id === id)?.correct;
      if (isCorrect && onXpGained) onXpGained(tactic.xp);
    }
  };

  return (
    <div style={{ background: '#0f2035', border: '1px solid rgba(96,211,148,0.25)', borderRadius: 20, overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ background: 'linear-gradient(135deg, #1a3a2a 0%, #0f2035 100%)', padding: '14px 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 18 }}>🧠</span>
          <span style={{ fontSize: 11, color: '#60D394', fontWeight: 700, letterSpacing: 1 }}>오늘의 전술 카드</span>
          {alreadyDone && (
            <span style={{ marginLeft: 'auto', fontSize: 10, background: 'rgba(96,211,148,0.15)', color: '#60D394', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(96,211,148,0.3)' }}>
              ✓ 완료 +{tactic.xp}XP
            </span>
          )}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>{tactic.title}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{tactic.subtitle}</div>
      </div>

      <div style={{ padding: '14px 18px 18px' }}>
        {/* 핵심 개념 */}
        <div style={{ background: 'rgba(96,211,148,0.1)', border: '1px solid rgba(96,211,148,0.2)', borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#60D394', fontWeight: 600 }}>
          💡 {tactic.concept}
        </div>

        {/* 필드 */}
        <SoccerField players={tactic.players} arrows={tactic.arrows} showArrows={phase === 'result'} />

        {/* 상황 설명 */}
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6, margin: '12px 0' }}>
          {tactic.description}
        </p>

        {/* 인트로 → 퀴즈 시작 */}
        {phase === 'intro' && (
          <button
            onClick={() => setPhase('quiz')}
            style={{ width: '100%', padding: '12px', background: '#60D394', color: '#0a1f14', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}
          >
            퀴즈 풀기 → +{tactic.xp}XP 획득
          </button>
        )}

        {/* 퀴즈 */}
        {phase === 'quiz' && (
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 10 }}>
              ❓ {tactic.quizQuestion}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tactic.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleSelect(opt.id)}
                  style={{
                    padding: '12px 14px', borderRadius: 12, textAlign: 'left',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.85)', fontSize: 13, cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 결과 */}
        {phase === 'result' && (
          <div>
            {/* 정답/오답 배너 */}
            <div style={{
              padding: '10px 14px', borderRadius: 12, marginBottom: 12,
              background: correct ? 'rgba(96,211,148,0.15)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${correct ? 'rgba(96,211,148,0.4)' : 'rgba(239,68,68,0.3)'}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 20 }}>{correct ? '🎉' : '😅'}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: correct ? '#60D394' : '#f87171', margin: 0 }}>
                  {correct ? `정답! +${tactic.xp}XP 획득!` : '아쉽지만 괜찮아요!'}
                </p>
                {!correct && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>
                    정답: {tactic.options.find(o => o.correct)?.label}
                  </p>
                )}
              </div>
            </div>

            {/* 해설 */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontWeight: 600 }}>📖 해설</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, margin: 0 }}>
                {tactic.explanation}
              </p>
            </div>

            {/* 화살표 안내 */}
            <p style={{ fontSize: 11, color: 'rgba(96,211,148,0.7)', textAlign: 'center' }}>
              ↑ 위 필드에서 정답 움직임을 확인해보세요
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
