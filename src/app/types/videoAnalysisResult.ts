// src/app/types/videoAnalysisResult.ts

export type AnalysisStage = 'idle' | 'uploaded' | 'extracted' | 'analyzed' | 'completed';

export interface ResultFocusPlayer {
  playerId?: string;
  playerName?: string;
  jerseyNumber?: string;
  position?: string;
  teamSide?: string;
  identityStatus?: string;
}

export interface ResultHighlightClip {
  id: string;
  startSec: number;
  endSec: number;
  timeLabel: string;
  title: string;
  summary: string;
  recommendationReason: string;
  eventType: string;
  importanceScore: number;
  included: boolean;
  focusPlayer?: ResultFocusPlayer | null;
  previewUrl?: string;
  tags?: string[];
  raw?: any;
}

export interface ResultAnalysisSummary {
  noticeableScene: string;
  strength: string;
  weakness: string;
  trainingPoint: string;
}

export interface ResultSceneAnalysis {
  clipId: string;
  sceneTitle: string;
  timestamp?: string;
  sceneSummary: string;
  analysis: string;
  positionInterpretation: string;
  correctionPoint: string;
  whyReviewAgain: string;
  raw?: any;
}

export interface ResultFinalHighlightInfo {
  videoUrl: string;
  fileName: string;
  sceneCount: number;
  totalDurationSec: number;
  totalDurationLabel: string;
  focusPlayerLabel: string;
  createdAt?: string;
  raw?: any;
}

export interface ResultSetup {
  position: string;
  criteria: string[];
  recommendedSceneCount: number;
}

export interface VideoAnalysisResultViewModel {
  pageTitle: string;
  description: string;

  health: {
    ok: boolean;
    message: string;
    routes: string[];
  };

  uploadedVideo: {
    name: string;
    sizeLabel: string;
    statusText: string;
  };

  progress: {
    currentStage: AnalysisStage;
    steps: Array<{
      key: string;
      label: string;
      status: 'done' | 'current' | 'todo';
      order: number;
    }>;
  };

  setup: ResultSetup;

  focusPlayer: ResultFocusPlayer | null;

  highlights: ResultHighlightClip[];
  selectedHighlights: ResultHighlightClip[];

  highlightStats: {
    recommendedCount: number;
    selectedCount: number;
    selectedDurationSec: number;
    selectedDurationLabel: string;
  };

  analysisSummary: ResultAnalysisSummary | null;
  sceneAnalyses: ResultSceneAnalysis[];
  trainingFocus: string[];

  finalHighlight: ResultFinalHighlightInfo | null;
}
