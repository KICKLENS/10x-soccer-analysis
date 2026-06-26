import { CLUB_DEMO, GRADE_INFO } from './clubData';

export type MatchKeyMoment = {
  id?: string;
  startSec?: number;
  endSec?: number;
  label?: string;
  description?: string;
  impact?: string;
  url?: string;
};

export type MatchPlayerStandout = {
  hint?: string;
  description?: string;
  positives?: string;
  improvements?: string;
};

export type ClubMatchAnalysisResult = {
  id: string;
  createdAt: string;
  meta: {
    clubName?: string;
    opponent?: string;
    matchDate?: string;
    grade?: string;
    ourTeamColor?: string;
    matchResult?: string;
  };
  matchSummary?: string;
  scoreFlow?: string;
  firstHalf?: string;
  secondHalf?: string;
  teamStrengths?: string[];
  teamWeaknesses?: string[];
  keyMoments?: MatchKeyMoment[];
  tacticalNotes?: string;
  playerStandouts?: MatchPlayerStandout[];
  coachingRecommendations?: string[];
  nextMatchFocus?: string;
  clips?: Array<{ id?: string; url?: string; label?: string; start?: number; end?: number }>;
};

const STORAGE_KEY = 'club-match-analyses-v1';

export function saveClubMatchAnalysis(result: Omit<ClubMatchAnalysisResult, 'id' | 'createdAt'>): ClubMatchAnalysisResult {
  const entry: ClubMatchAnalysisResult = {
    ...result,
    id: `match-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  const list = listClubMatchAnalyses();
  list.unshift(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* noop */
  }
  return entry;
}

export function listClubMatchAnalyses(): ClubMatchAnalysisResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getClubMatchAnalysis(id: string): ClubMatchAnalysisResult | null {
  return listClubMatchAnalyses().find((item) => item.id === id) || null;
}

export const DEMO_MATCH_ANALYSIS: ClubMatchAnalysisResult = {
  id: 'demo-match',
  createdAt: new Date().toISOString(),
  meta: {
    clubName: CLUB_DEMO.name,
    opponent: 'FC 마포',
    matchDate: '2026.06.21',
    grade: 'U-12',
    matchResult: '3-1 승',
    ourTeamColor: '주황',
  },
  matchSummary: '전반 압박과 측면 전개가 좋았고, 후반 실점 이후 빌드업 안정성을 회복하며 3-1 승리.',
  scoreFlow: '전반 2-0 리드 → 후반 초반 실점 2-1 → 후반 중반 추가 득점 3-1 마무리.',
  firstHalf: '전반에는 상대를 높은 위치에서 압박하며 공을 빠르게 탈취했습니다. 좌측 측면에서 크로스와 컷백 연결로 두 번의 득점 기회를 만들었고, 세트피스 상황에서도 박스 안 침투가 적시에 이뤄졌습니다.',
  secondHalf: '후반 시작 후 체력 저하로 수비 라인 간격이 벌어지며 실점했습니다. 이후 감독 지시에 따라 빌드업 속도를 줄이고 안정적인 패스 연결로 경기를 통제했고, 역습 상황에서 세 번째 골을 넣으며 승리를 확정했습니다.',
  teamStrengths: [
    '전반 높은 압박과 빠른 공 탈취 후 전환',
    '측면 크로스·컷백을 통한 박스 침투',
    '실점 후 경기 운영을 안정화하는 팀 대응',
  ],
  teamWeaknesses: [
    '후반 체력 저하 시 수비 라인 간격 관리',
    '빌드업 시 압박 받을 때 옵션 부족',
    '세트피스 수비 시 2차 볼 처리',
  ],
  keyMoments: [
    {
      label: '전반 첫 득점 빌드업',
      startSec: 420,
      endSec: 438,
      description: '좌측 측면 돌파 후 크로스, 박스 안 2명이 침투하며 득점.',
      impact: 'high',
    },
    {
      label: '후반 실점 장면',
      startSec: 2880,
      endSec: 2898,
      description: '수비 라인이 올라간 상태에서 역패스에 뚫리며 실점.',
      impact: 'high',
    },
  ],
  tacticalNotes:
    '4-3-3에 가까운 형태로 전반 압박, 후반에는 4-4-2에 가깝게 낮춰 수비 안정화. 미드필더와 풀백 간 간격 유지가 핵심.',
  playerStandouts: [
    {
      hint: '7번 · 주황 유니폼',
      description: '전반 좌측 측면에서 돌파와 크로스를 반복적으로 성공.',
      positives: '1대1 돌파, 크로스 타이밍',
      improvements: '수비 가담·역추적',
    },
    {
      hint: '4번 · 수비수',
      description: '후반 실점 장면 이후 수비 라인 조율에 기여.',
      positives: '커뮤니케이션, 클리어',
      improvements: '역패스 상황 대응',
    },
  ],
  coachingRecommendations: [
    '후반 체력 구간(60~75분) 수비 라인 간격 유지 훈련',
    '압박 받을 때 미드필더 3각 패스 패턴 반복',
    '세트피스 수비 시 마킹·2차 볼 담당 역할 명확화',
  ],
  nextMatchFocus: '실점 후 빌드업 안정성과 후반 수비 조직력',
};

export const GRADE_OPTIONS = Object.entries(GRADE_INFO).map(([id, g]) => ({
  id,
  label: g.label,
}));
