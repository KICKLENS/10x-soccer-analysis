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

export type MatchVideoCoverage = 'full' | 'first_half' | 'second_half' | 'segment';

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
    /** 업로드 영상이 경기의 어느 부분인지 */
    videoCoverage?: MatchVideoCoverage;
    /** 유소년 경기 총 시간(분). 기본 40 (20+5+20) */
    matchTotalMinutes?: number;
    /** segment일 때 경기 시각(분) — 예: 전반 5~12분 */
    segmentStartMin?: number;
    segmentEndMin?: number;
    segmentNote?: string;
    videoDurationSec?: number;
  };
  matchSummary?: string;
  scoreFlow?: string;
  /** 일부 구간 영상일 때 이 구간만 요약 */
  segmentSummary?: string;
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
  /** 리포트 UI에서 어떤 섹션을 보여줄지 */
  reportSections?: MatchReportSections;
};

export type MatchReportSections = {
  isPartial: boolean;
  coverageLabel: string;
  showFirstHalf: boolean;
  showSecondHalf: boolean;
  showSegmentSummary: boolean;
  showTeamStrengths: boolean;
  showTeamWeaknesses: boolean;
  showTacticalNotes: boolean;
  showCoaching: boolean;
};

export const VIDEO_COVERAGE_OPTIONS: { id: MatchVideoCoverage; label: string; hint: string }[] = [
  { id: 'segment', label: '일부 구간', hint: '7분 클립, 하이라이트 등 짧은 영상' },
  { id: 'first_half', label: '전반 전체', hint: '약 20분, 전반만 담긴 영상' },
  { id: 'second_half', label: '후반 전체', hint: '약 20분, 후반만 담긴 영상' },
  { id: 'full', label: '경기 전체', hint: '40~50분 풀영상' },
];

export const MATCH_LENGTH_OPTIONS = [
  { minutes: 40, label: '40분 (전20+휴5+후20)' },
  { minutes: 45, label: '45분' },
  { minutes: 50, label: '50분' },
];

export function buildCoverageLabel(meta: ClubMatchAnalysisResult['meta']): string {
  const videoMin =
    meta.videoDurationSec != null ? Math.round(meta.videoDurationSec / 60) : null;
  const opt = VIDEO_COVERAGE_OPTIONS.find((o) => o.id === meta.videoCoverage);

  if (meta.segmentNote?.trim()) {
    return `${meta.segmentNote.trim()}${videoMin != null ? ` · 영상 ${videoMin}분` : ''}`;
  }
  if (meta.segmentStartMin != null && meta.segmentEndMin != null) {
    const half =
      meta.videoCoverage === 'first_half'
        ? '전반 '
        : meta.videoCoverage === 'second_half'
          ? '후반 '
          : '';
    return `${half}${meta.segmentStartMin}~${meta.segmentEndMin}분${videoMin != null ? ` · 영상 ${videoMin}분` : ''}`;
  }
  return `${opt?.label || '일부 구간'}${videoMin != null ? ` · 영상 ${videoMin}분` : ''}`;
}

/** 영상 길이·구간 입력에 따라 전반/후반·팀 강약점 등 표시 여부 결정 */
export function deriveMatchReportSections(
  meta: ClubMatchAnalysisResult['meta'] = {},
): MatchReportSections {
  const coverage = meta.videoCoverage || 'segment';
  const videoMin = meta.videoDurationSec != null ? meta.videoDurationSec / 60 : 0;
  const matchTotal = meta.matchTotalMinutes ?? 40;
  const fullThreshold = matchTotal * 0.72;

  const isFullVideo = coverage === 'full' && videoMin >= fullThreshold;
  const isPartial = !isFullVideo;

  return {
    isPartial,
    coverageLabel: buildCoverageLabel(meta),
    showFirstHalf: isFullVideo,
    showSecondHalf: isFullVideo,
    showSegmentSummary: isPartial,
    showTeamStrengths: isFullVideo,
    showTeamWeaknesses: isFullVideo,
    showTacticalNotes: isFullVideo,
    showCoaching: true,
  };
}

export function validateVideoCoverage(
  coverage: MatchVideoCoverage,
  videoDurationSec: number,
  matchTotalMinutes: number,
): string | null {
  const videoMin = videoDurationSec / 60;
  if (coverage === 'full' && videoMin < matchTotalMinutes * 0.72) {
    return `영상이 ${Math.round(videoMin)}분뿐입니다. 경기 전체(${matchTotalMinutes}분)가 아니면 「일부 구간」 또는 「전반/후반」을 선택해 주세요.`;
  }
  if (coverage === 'first_half' && videoMin > 28) {
    return null;
  }
  if ((coverage === 'first_half' || coverage === 'second_half') && videoMin < 8) {
    return `영상이 ${Math.round(videoMin)}분으로 짧습니다. 「일부 구간」을 선택하고 경기 시간대(예: 전반 5~12분)를 입력해 주세요.`;
  }
  return null;
}

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
    ourTeamColor: '하늘색',
    videoCoverage: 'segment',
    matchTotalMinutes: 40,
    segmentStartMin: 5,
    segmentEndMin: 12,
    segmentNote: '전반 5~12분',
    videoDurationSec: 420,
  },
  reportSections: deriveMatchReportSections({
    videoCoverage: 'segment',
    matchTotalMinutes: 40,
    segmentNote: '전반 5~12분',
    videoDurationSec: 420,
  }),
  matchSummary: '전반 5~12분 구간: 하늘색 유니폼 팀의 중원 패스 연결과 수비 라인 빌드업 장면이 관찰됨.',
  segmentSummary:
    '해당 7분 영상에서는 수비 진영에서 키퍼·수비수 간 패스 빌드업, 중원 전환 패스가 반복됨. 득점 장면은 이 구간에 포함되지 않음.',
  scoreFlow: '입력 경기 결과: 3-1 승. (이 영상 구간에서는 득점 장면 미확인)',
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
  tacticalNotes: '이 구간: 수비 3rd에서 키퍼 포함 빌드업 패턴이 반복됨.',
  playerStandouts: [],
  coachingRecommendations: [
    '관찰된 빌드업 장면 기준: 키퍼·센터백 패스 각도 훈련',
  ],
  nextMatchFocus: '',
  firstHalf: '',
  secondHalf: '',
  teamStrengths: [],
  teamWeaknesses: [],
};

export const GRADE_OPTIONS = Object.entries(GRADE_INFO).map(([id, g]) => ({
  id,
  label: g.label,
}));
