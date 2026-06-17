// src/app/mappers/videoAnalysisViewModel.ts
import type { VideoAnalysisResultViewModel } from '../types/videoAnalysisResult';

type AnyRecord = Record<string, any>;

export interface LabStateSnapshot {
  selectedFile?: File | null;
  healthResult?: AnyRecord | null;
  clips?: AnyRecord[] | null;
  geminiResult?: AnyRecord | null;
  renderResult?: AnyRecord | null;
  selectedPosition?: string;
  selectedCriteria?: string[];
  recommendedSceneCount?: number;
}

function toArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatTime(seconds?: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatTimeRange(startSec?: number, endSec?: number): string {
  return `${formatTime(startSec)}-${formatTime(endSec)}`;
}

function normalizeUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `http://localhost:4000${url}`;
  return url;
}

function extractRenderVideoUrl(renderResult?: AnyRecord | null): string {
  if (!renderResult) return '';

  const candidates = [
    renderResult.finalVideoUrl,
    renderResult.videoUrl,
    renderResult.renderedVideoUrl,
    renderResult.outputUrl,
    renderResult.downloadUrl,
    renderResult.url,
    renderResult.resultUrl,
    renderResult.fileUrl,
    renderResult?.data?.finalVideoUrl,
    renderResult?.data?.videoUrl,
    renderResult?.data?.url,
  ];

  for (const candidate of candidates) {
    const value = toString(candidate);
    if (value) return normalizeUrl(value);
  }

  return '';
}

function extractRenderFileName(renderResult?: AnyRecord | null): string {
  if (!renderResult) return '';

  const candidates = [
    renderResult.fileName,
    renderResult.outputFileName,
    renderResult.filename,
    renderResult?.data?.fileName,
  ];

  for (const candidate of candidates) {
    const value = toString(candidate);
    if (value) return value;
  }

  const url = extractRenderVideoUrl(renderResult);
  if (!url) return 'final-highlight.mp4';
  return url.split('/').pop() || 'final-highlight.mp4';
}

function normalizeFocusPlayer(source?: AnyRecord | null) {
  if (!source || typeof source !== 'object') return null;

  const jerseyNumber =
    toString(source.jerseyNumber) ||
    toString(source.number) ||
    toString(source.playerNumber);

  const position =
    toString(source.position) ||
    toString(source.role) ||
    toString(source.playerPosition);

  const playerName =
    toString(source.playerName) ||
    toString(source.name) ||
    toString(source.playerLabel);

  const identityStatus =
    toString(source.identityStatus) ||
    toString(source.status) ||
    '';

  if (!jerseyNumber && !position && !playerName && !identityStatus) {
    return null;
  }

  return {
    playerId: toString(source.playerId) || toString(source.id) || '',
    playerName,
    jerseyNumber,
    position,
    teamSide: toString(source.teamSide) || '',
    identityStatus,
  };
}

function buildFocusPlayerLabel(player: any): string {
  if (!player) return '분석 대상 선수';

  const parts = [
    player.jerseyNumber ? `#${player.jerseyNumber}` : '',
    player.position || '',
    player.playerName || '',
  ].filter(Boolean);

  if (!parts.length) {
    return player.identityStatus === '판단 불확실' ? '판단 불확실' : '분석 대상 선수';
  }

  return parts.join(' ');
}

function normalizeClip(raw: AnyRecord, index: number) {
  const startSec =
    toNumber(raw.startSec, NaN) ||
    toNumber(raw.startTime, NaN) ||
    toNumber(raw.start, 0);

  const endSec =
    toNumber(raw.endSec, NaN) ||
    toNumber(raw.endTime, NaN) ||
    toNumber(raw.end, startSec + 5);

  const focusPlayer =
    normalizeFocusPlayer(raw.focusPlayer) ||
    normalizeFocusPlayer(raw.player) ||
    null;

  const included =
    typeof raw.included === 'boolean'
      ? raw.included
      : typeof raw.selected === 'boolean'
      ? raw.selected
      : typeof raw.enabled === 'boolean'
      ? raw.enabled
      : true;

  return {
    id: toString(raw.id) || toString(raw.clipId) || `clip-${index + 1}`,
    startSec,
    endSec,
    timeLabel: formatTimeRange(startSec, endSec),
    title:
      toString(raw.title) ||
      toString(raw.sceneTitle) ||
      toString(raw.label) ||
      `${formatTimeRange(startSec, endSec)} 장면`,
    summary:
      toString(raw.summary) ||
      toString(raw.description) ||
      toString(raw.coachSummary) ||
      '추천 장면 요약이 아직 없습니다.',
    recommendationReason:
      toString(raw.recommendationReason) ||
      toString(raw.reason) ||
      toString(raw.recommendReason) ||
      'AI가 주요 장면으로 판단했습니다.',
    eventType:
      toString(raw.eventType) ||
      toString(raw.type) ||
      toString(raw.category) ||
      'general',
    importanceScore:
      typeof raw.importanceScore === 'number'
        ? raw.importanceScore
        : typeof raw.score === 'number'
        ? raw.score
        : typeof raw.totalScore === 'number'
        ? raw.totalScore
        : 0,
    included,
    focusPlayer,
    previewUrl: normalizeUrl(
      toString(raw.previewUrl) ||
        toString(raw.clipUrl) ||
        toString(raw.videoUrl) ||
        toString(raw.url)
    ),
    tags: toArray<string>(raw.tags).filter(Boolean),
    raw,
  };
}

function extractSceneAnalyses(geminiResult?: AnyRecord | null) {
  if (!geminiResult) return [];

  const rawList =
    ([
      geminiResult.sceneAnalyses,
      geminiResult.analyses,
      geminiResult.results,
      geminiResult.items,
      geminiResult.scenes,
      geminiResult?.data?.sceneAnalyses,
      geminiResult?.data?.analyses,
    ].find(Array.isArray) as AnyRecord[] | undefined) || [];

  return rawList.map((item, index) => {
    const clipId =
      toString(item.clipId) ||
      toString(item.id) ||
      toString(item.sceneId) ||
      `clip-${index + 1}`;

    const positionInterpretationValue =
      toString(item.positionInterpretation) ||
      toString(item.positionalInterpretation) ||
      toString(item.tacticalMeaning) ||
      toString(item.section3) ||
      '';

    const whyReviewAgainValue =
      toString(item.whyReviewAgain) ||
      toString(item.rewatchReason) ||
      toString(item.educationalValue) ||
      toString(item.section5) ||
      '';

    return {
      clipId,
      sceneTitle:
        toString(item.sceneTitle) ||
        toString(item.title) ||
        toString(item.label) ||
        `${clipId} 분석`,
      timestamp:
        toString(item.timestamp) ||
        toString(item.timeLabel) ||
        toString(item.timeRange) ||
        '',
      sceneSummary:
        toString(item.sceneSummary) ||
        toString(item.summary) ||
        toString(item.section1) ||
        '',
      analysis:
        toString(item.analysis) ||
        toString(item.section2) ||
        '',
      positionInterpretation: positionInterpretationValue,
      correctionPoint:
        toString(item.correctionPoint) ||
        toString(item.improvementPoint) ||
        toString(item.section4) ||
        '',
      whyReviewAgain: whyReviewAgainValue,
      raw: item,
    };
  });
}

function extractSummary(geminiResult?: AnyRecord | null, clips: any[] = []) {
  if (!geminiResult) return null;

  const source =
    geminiResult.summary ||
    geminiResult.overallSummary ||
    geminiResult.resultSummary ||
    geminiResult?.data?.summary ||
    {};

  if (typeof source === 'string' && source.trim()) {
    return {
      noticeableScene: clips[0]?.title || '핵심 장면',
      strength: source.trim(),
      weakness: '세부 아쉬운 점은 장면별 분석에서 확인하세요.',
      trainingPoint: '장면별 교정 포인트를 기준으로 반복 훈련을 권장합니다.',
    };
  }

  return {
    noticeableScene:
      toString(source.noticeableScene) ||
      toString(source.standoutScene) ||
      clips[0]?.title ||
      '핵심 장면',
    strength:
      toString(source.strength) ||
      toString(source.goodPoint) ||
      '잘한 점 분석이 아직 없습니다.',
    weakness:
      toString(source.weakness) ||
      toString(source.improvementPoint) ||
      toString(source.lackingPoint) ||
      '아쉬운 점 분석이 아직 없습니다.',
    trainingPoint:
      toString(source.trainingPoint) ||
      toString(source.nextTrainingPoint) ||
      '다음 훈련 포인트가 아직 없습니다.',
  };
}

function buildFinalHighlightInfo(renderResult?: AnyRecord | null, selectedClips: any[] = [], focusPlayer?: any) {
  const videoUrl = extractRenderVideoUrl(renderResult);
  if (!videoUrl) return null;

  const totalDurationSec =
    typeof renderResult?.totalDurationSec === 'number'
      ? renderResult.totalDurationSec
      : selectedClips.reduce((sum, clip) => {
          return sum + Math.max(0, (clip.endSec || 0) - (clip.startSec || 0));
        }, 0);

  return {
    videoUrl,
    fileName: extractRenderFileName(renderResult),
    sceneCount:
      typeof renderResult?.sceneCount === 'number'
        ? renderResult.sceneCount
        : typeof renderResult?.clipCount === 'number'
        ? renderResult.clipCount
        : selectedClips.length,
    totalDurationSec,
    totalDurationLabel: formatTime(totalDurationSec),
    focusPlayerLabel: buildFocusPlayerLabel(focusPlayer),
    createdAt:
      toString(renderResult?.createdAt) ||
      toString(renderResult?.renderedAt) ||
      '',
    raw: renderResult,
  };
}

function resolveCurrentStage(params: {
  healthResult?: AnyRecord | null;
  clips?: any[];
  geminiResult?: AnyRecord | null;
  renderResult?: AnyRecord | null;
}) {
  const healthOk = !!params.healthResult?.success;
  const hasClips = (params.clips?.length || 0) > 0;
  const hasGemini = !!params.geminiResult;
  const hasRender = !!extractRenderVideoUrl(params.renderResult);

  if (hasRender) return 'completed' as const;
  if (hasGemini) return 'analyzed' as const;
  if (hasClips) return 'extracted' as const;
  if (healthOk) return 'uploaded' as const;
  return 'idle' as const;
}

function buildProgress(
  currentStage: 'idle' | 'uploaded' | 'extracted' | 'analyzed' | 'completed'
): Array<{
  key: string;
  label: string;
  status: 'done' | 'current' | 'todo';
  order: number;
}> {
  const orderMap = {
    idle: 0,
    uploaded: 1,
    extracted: 2,
    analyzed: 3,
    completed: 4,
  } as const;

  const current = orderMap[currentStage];

  const steps = [
    { key: 'uploaded', label: '업로드', stageValue: 1 },
    { key: 'extracted', label: '하이라이트 추출', stageValue: 2 },
    { key: 'analyzed', label: 'AI 분석', stageValue: 3 },
    { key: 'completed', label: '최종 영상 생성', stageValue: 4 },
  ] as const;

  return steps.map((step, index) => {
    const status: 'done' | 'current' | 'todo' =
      current >= step.stageValue
        ? 'done'
        : current + 1 === step.stageValue
        ? 'current'
        : 'todo';

    return {
      key: step.key,
      label: step.label,
      order: index + 1,
      status,
    };
  });
}

export function toVideoAnalysisViewModel(snapshot: LabStateSnapshot): VideoAnalysisResultViewModel {
  const clips = toArray<AnyRecord>(snapshot.clips).map(normalizeClip);

  const selectedHighlights = clips.filter((clip) => clip.included);
  const effectiveSelectedHighlights =
    selectedHighlights.length > 0 ? selectedHighlights : clips.slice(0, Math.min(4, clips.length));

  const focusPlayer =
    normalizeFocusPlayer(snapshot.renderResult?.focusPlayer) ||
    normalizeFocusPlayer(snapshot.geminiResult?.focusPlayer) ||
    normalizeFocusPlayer(toArray<AnyRecord>(snapshot.clips).find((clip) => clip?.focusPlayer)?.focusPlayer) ||
    null;

  const currentStage = resolveCurrentStage({
    healthResult: snapshot.healthResult,
    clips,
    geminiResult: snapshot.geminiResult,
    renderResult: snapshot.renderResult,
  });

  const selectedDurationSec = effectiveSelectedHighlights.reduce((sum, clip) => {
    return sum + Math.max(0, (clip.endSec || 0) - (clip.startSec || 0));
  }, 0);

  return {
  pageTitle: '영상 분석 결과',
  description: '업로드된 경기 영상을 기반으로 하이라이트 추출, AI 코치 분석, 최종 하이라이트 영상을 확인합니다.',

    health: {
      ok: !!snapshot.healthResult?.success,
      message: toString(snapshot.healthResult?.message) || '서버 상태를 아직 확인하지 않았습니다.',
      routes: toArray<string>(snapshot.healthResult?.routes),
    },

    uploadedVideo: {
      name: snapshot.selectedFile?.name || '업로드된 영상 없음',
      sizeLabel: snapshot.selectedFile ? formatBytes(snapshot.selectedFile.size) : '-',
      statusText: snapshot.selectedFile ? '영상 선택 완료' : '영상 업로드 대기',
    },

    progress: {
      currentStage,
      steps: buildProgress(currentStage),
    },

    // 기존 타입 구조를 모르기 때문에 setup은 최소 충돌 방식으로 any 캐스팅
    setup: {
      position: snapshot.selectedPosition || '미선택',
      criteria:
        snapshot.selectedCriteria?.length
          ? snapshot.selectedCriteria
          : ['주요 장면 추출', 'AI 코치 분석', '최종 하이라이트 생성'],
      recommendedSceneCount: snapshot.recommendedSceneCount || clips.length || 8,
    } as any,

    focusPlayer: focusPlayer as any,

    highlights: clips as any,
    selectedHighlights: effectiveSelectedHighlights as any,

    highlightStats: {
      recommendedCount: clips.length,
      selectedCount: effectiveSelectedHighlights.length,
      selectedDurationSec,
      selectedDurationLabel: formatTime(selectedDurationSec),
    },

    analysisSummary: extractSummary(snapshot.geminiResult, clips) as any,
    sceneAnalyses: extractSceneAnalyses(snapshot.geminiResult) as any,

    trainingFocus: extractSceneAnalyses(snapshot.geminiResult)
      .map((item) => item.correctionPoint)
      .filter(Boolean)
      .slice(0, 5),

    finalHighlight: buildFinalHighlightInfo(
      snapshot.renderResult,
      effectiveSelectedHighlights,
      focusPlayer
    ) as any,
  };
}
