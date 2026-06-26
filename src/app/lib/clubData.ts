/** 클럽 포털 — 선수 상태·학년·더미 데이터 (추후 DB 연동) */

export const CLUB_DEMO = {
  name: 'AAFC충암',
  logo: '⚽',
  recentGames: [
    { date: '2026.06.21', opponent: 'FC 마포', result: '3-1', win: true as const },
    { date: '2026.06.14', opponent: '강남 유나이티드', result: '2-2', win: null },
    { date: '2026.06.07', opponent: '광진 FC', result: '1-2', win: false as const },
  ],
  stats: {
    totalAnalysis: 47,
    totalHighlights: 312,
    totalPlayers: 62,
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

/** 2026 시즌 충암 스쿼드 — 공식 명단 기준 */
const GRADE_ROSTERS: Record<string, { name: string; number: number }[]> = {
  u12: [
    { name: '강도윤', number: 1 },
    { name: '배현우', number: 2 },
    { name: '박서준', number: 3 },
    { name: '김산', number: 4 },
    { name: '김근우', number: 5 },
    { name: '권하준', number: 8 },
    { name: '이지민', number: 9 },
    { name: '최용준', number: 10 },
    { name: '김서후', number: 11 },
  ],
  u11: [
    { name: '김민석', number: 13 },
    { name: '이민준', number: 14 },
    { name: '안세현', number: 15 },
    { name: '이원빈', number: 16 },
    { name: '이아준', number: 17 },
    { name: '허유찬', number: 18 },
    { name: '양하준', number: 20 },
    { name: '김도현', number: 21 },
    { name: '정상욱', number: 22 },
    { name: '강라온', number: 23 },
    { name: '강로제', number: 24 },
    { name: '장연우', number: 25 },
    { name: '구승빈', number: 26 },
  ],
  u10: [
    { name: '강이찬', number: 28 },
    { name: '김진영', number: 29 },
    { name: '송윤찬', number: 30 },
    { name: '이은우', number: 31 },
    { name: '임지후', number: 32 },
    { name: '박조윤', number: 34 },
    { name: '최수혁', number: 35 },
    { name: '최정우', number: 36 },
    { name: '최연우', number: 37 },
    { name: '김태윤', number: 41 },
  ],
  u9: [
    { name: '김이한', number: 42 },
    { name: '김재범', number: 43 },
    { name: '김태현', number: 44 },
    { name: '박하루', number: 45 },
    { name: '방주안', number: 47 },
    { name: '이지완', number: 48 },
    { name: '임지한', number: 49 },
    { name: '정승빈', number: 51 },
    { name: '정연우', number: 52 },
    { name: '박건우', number: 53 },
    { name: '김태유', number: 54 },
    { name: '공예준', number: 55 },
  ],
  u8: [
    { name: '안지용', number: 58 },
    { name: '이호민', number: 59 },
    { name: '이지안', number: 60 },
    { name: '박승준', number: 61 },
    { name: '박시준', number: 62 },
    { name: '최정혁', number: 63 },
    { name: '성시훈', number: 67 },
  ],
  u7: [
    { name: '김건우', number: 65 },
    { name: '정시현', number: 66 },
    { name: '김우주', number: 74 },
    { name: '최원종', number: 75 },
    { name: '전우주', number: 76 },
    { name: '정시현', number: 77 },
    { name: '최유호', number: 78 },
    { name: '문유빈', number: 80 },
  ],
};

export const GRADE_INFO: Record<string, {
  label: string;
  desc: string;
  color: string;
  count: number;
}> = {
  u7: { label: 'U-7', desc: '초등 1학년', color: '#F472B6', count: GRADE_ROSTERS.u7.length },
  u8: { label: 'U-8', desc: '초등 2학년', color: '#06B6D4', count: GRADE_ROSTERS.u8.length },
  u9: { label: 'U-9', desc: '초등 3학년', color: '#8B5CF6', count: GRADE_ROSTERS.u9.length },
  u10: { label: 'U-10', desc: '초등 4학년', color: '#3B82F6', count: GRADE_ROSTERS.u10.length },
  u11: { label: 'U-11', desc: '초등 5학년', color: '#10B981', count: GRADE_ROSTERS.u11.length },
  u12: { label: 'U-12', desc: '초등 6학년', color: '#FF9F02', count: GRADE_ROSTERS.u12.length },
};

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

const GRADE_HEIGHT_BASE: Record<string, number> = {
  u7: 118,
  u8: 124,
  u9: 130,
  u10: 136,
  u11: 142,
  u12: 148,
};

/** index 기반 결정적 값 (새로고침해도 동일) */
function det(seed: number, mod: number) {
  return ((seed * 9301 + 49297) % 233280) % mod;
}

function assignStatus(grade: string, i: number): PlayerTrackStatus {
  const isHighGrade = grade === 'u12' || grade === 'u11';
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
  const roster = GRADE_ROSTERS[grade] || GRADE_ROSTERS.u12;
  const heightBase = GRADE_HEIGHT_BASE[grade] ?? GRADE_HEIGHT_BASE.u12;

  return roster.map((entry, i) => {
    const status = assignStatus(grade, i);
    const hasData = status !== 'no_data';
    const avgScore = hasData ? 62 + det(i, 35) : null;
    const analysisCount = hasData ? 1 + det(i + 3, 7) : 0;

    return {
      id: `${grade}-${i + 1}`,
      grade,
      name: entry.name,
      number: entry.number,
      position: POSITIONS[i % POSITIONS.length],
      height: heightBase + det(i, 14),
      weight: 28 + det(i + 1, 18) + (heightBase - 118) / 2,
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
