/** 클럽 포털 — 선수 상태·학년·더미 데이터 (추후 DB 연동) */

export const CLUB_DEMO = {
  name: 'AAFC 충암 FC',
  logo: '⚽',
  coach: '김철수 감독',
  location: '서울 성북구',
  founded: '2018',
  recentGames: [
    { date: '2026.06.21', opponent: 'FC 마포', result: '3-1', win: true as const },
    { date: '2026.06.14', opponent: '강남 유나이티드', result: '2-2', win: null },
    { date: '2026.06.07', opponent: '광진 FC', result: '1-2', win: false as const },
  ],
  stats: {
    totalAnalysis: 47,
    totalHighlights: 312,
    totalPlayers: 86,
  },
};

export type PlayerTrackStatus =
  | 'youth_confirmed'  // 유스 진학 확정
  | 'developing'       // 육성 중
  | 'needs_work'       // 보완 필요
  | 'no_data';         // 분석·기록 없음

export const TRACK_STATUS: Record<PlayerTrackStatus, {
  label: string;
  short: string;
  color: string;
  bg: string;
  border: string;
  icon: string;
  desc: string;
}> = {
  youth_confirmed: {
    label: '유스 진학 확정',
    short: '유스 확정',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    border: 'rgba(167,139,250,0.4)',
    icon: '🏆',
    desc: '프로/유스팀 진학이 확정된 선수',
  },
  developing: {
    label: '육성 중',
    short: '육성 중',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.12)',
    border: 'rgba(52,211,153,0.35)',
    icon: '📈',
    desc: '성장 추세가 좋고 꾸준히 관리 중인 선수',
  },
  needs_work: {
    label: '보완 필요',
    short: '보완 필요',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.12)',
    border: 'rgba(251,191,36,0.35)',
    icon: '⚠️',
    desc: '특정 기술·체력 보완이 필요한 선수',
  },
  no_data: {
    label: '기록 없음',
    short: '미분석',
    color: 'rgba(255,255,255,0.45)',
    bg: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.12)',
    icon: '❓',
    desc: '아직 AI 분석 또는 코치 기록이 없음',
  },
};

export const GRADE_INFO: Record<string, {
  label: string;
  desc: string;
  color: string;
  count: number;
}> = {
  u10: { label: 'U-10', desc: '초등 3~4학년', color: '#3B82F6', count: 16 },
  u11: { label: 'U-11', desc: '초등 4~5학년', color: '#10B981', count: 18 },
  u12: { label: 'U-12', desc: '초등 5~6학년', color: '#FF9F02', count: 20 },
  u13: { label: 'U-13', desc: '중등 1학년', color: '#EF4444', count: 15 },
  u15: { label: 'U-15', desc: '중등 2~3학년', color: '#8B5CF6', count: 17 },
};

const NAMES = [
  '김태윤', '이민준', '박지훈', '최준혁', '정우진', '강동현', '윤서준', '임재원',
  '한승민', '오도현', '신예준', '황민재', '조성현', '류지원', '문태양', '노준서',
  '배현우', '권민혁', '성진우', '유재현',
];

const POSITIONS = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'FW', 'FW'];

const YOUTH_CLUBS = [
  '수원삼성 유스', 'FC서울 유스', '전북 유스', '울산 유스', '포항 유스', '인천 유스',
];

const WEAKNESS_TAGS = [
  '1대1 수비', '볼 트래핑', '체력·지구력', '헤딩', '약발 패스', '포지셔닝', '커뮤니케이션',
];

const STRENGTH_TAGS = [
  '스피드', '패스 감각', '드리블', '슈팅', '수비 인식', '리더십', '공중볼',
];

/** index 기반 결정적 값 (새로고침해도 동일) */
function det(seed: number, mod: number) {
  return ((seed * 9301 + 49297) % 233280) % mod;
}

function assignStatus(grade: string, i: number): PlayerTrackStatus {
  const isHighGrade = grade === 'u12' || grade === 'u13' || grade === 'u15';
  const r = det(i + grade.charCodeAt(1), 100);

  if (r < 8 && isHighGrade) return 'youth_confirmed';
  if (r < 12) return 'no_data';
  if (r < 28) return 'needs_work';
  if (r < 75) return 'developing';
  return 'needs_work';
}

export interface ClubPlayer {
  id: string;
  grade: string;
  name: string;
  number: number;
  position: string;
  height: number;
  weight: number;
  foot: string;
  emoji: string;
  status: PlayerTrackStatus;
  youthClub?: string;
  avgScore: number | null;
  analysisCount: number;
  highlightCount: number;
  lastAnalysis: string | null;
  strengthTags: string[];
  weaknessTags: string[];
  coachNote: string;
  growthTrend: 'up' | 'flat' | 'down' | null;
}

export function generateGradePlayers(grade: string): ClubPlayer[] {
  const info = GRADE_INFO[grade] || GRADE_INFO.u12;
  return Array.from({ length: info.count }, (_, i) => {
    const status = assignStatus(grade, i);
    const hasData = status !== 'no_data';
    const avgScore = hasData ? 62 + det(i, 35) : null;
    const analysisCount = hasData ? 1 + det(i + 3, 7) : 0;

    return {
      id: `${grade}-${i + 1}`,
      grade,
      name: NAMES[i % NAMES.length],
      number: i + 1,
      position: POSITIONS[i % POSITIONS.length],
      height: 138 + det(i, 28) + (grade === 'u15' ? 12 : grade === 'u13' ? 6 : 0),
      weight: 34 + det(i + 1, 22) + (grade === 'u15' ? 8 : 0),
      foot: i % 4 === 0 ? '왼발' : '오른발',
      emoji: ['😄', '😊', '🙂', '😎', '🤩'][i % 5],
      status,
      youthClub: status === 'youth_confirmed' ? YOUTH_CLUBS[det(i, YOUTH_CLUBS.length)] : undefined,
      avgScore,
      analysisCount,
      highlightCount: hasData ? det(i + 5, 12) : 0,
      lastAnalysis: hasData
        ? (i % 3 === 0 ? '2026.06.21' : i % 3 === 1 ? '2026.06.14' : '2026.05.30')
        : null,
      strengthTags: hasData
        ? [STRENGTH_TAGS[det(i, STRENGTH_TAGS.length)], STRENGTH_TAGS[det(i + 2, STRENGTH_TAGS.length)]]
        : [],
      weaknessTags: status === 'needs_work' || status === 'developing'
        ? [WEAKNESS_TAGS[det(i, WEAKNESS_TAGS.length)]]
        : status === 'youth_confirmed'
          ? [WEAKNESS_TAGS[det(i + 1, WEAKNESS_TAGS.length)]]
          : [],
      coachNote: status === 'youth_confirmed'
        ? `${YOUTH_CLUBS[det(i, YOUTH_CLUBS.length)]} 입단 확정. 경기 영상 포트폴리오 지속 업데이트 필요.`
        : status === 'needs_work'
          ? `${WEAKNESS_TAGS[det(i, WEAKNESS_TAGS.length)]} 집중 훈련 권장.`
          : status === 'developing'
            ? '전반적 성장세 양호. 꾸준한 경기 기록 유지.'
            : 'AI 분석 또는 코치 메모를 등록해주세요.',
      growthTrend: hasData
        ? (avgScore! >= 78 ? 'up' : avgScore! >= 65 ? 'flat' : 'down')
        : null,
    };
  });
}

export function getAllClubPlayers(): ClubPlayer[] {
  return Object.keys(GRADE_INFO).flatMap((g) => generateGradePlayers(g));
}

export function countByStatus(players: ClubPlayer[]) {
  return (Object.keys(TRACK_STATUS) as PlayerTrackStatus[]).reduce(
    (acc, key) => {
      acc[key] = players.filter((p) => p.status === key).length;
      return acc;
    },
    {} as Record<PlayerTrackStatus, number>,
  );
}

export function getPlayerById(id: string, grade: string): ClubPlayer | undefined {
  return generateGradePlayers(grade).find((p) => p.id === id);
}

export function getGradeStatusSummary(grade: string) {
  const players = generateGradePlayers(grade);
  return countByStatus(players);
}
