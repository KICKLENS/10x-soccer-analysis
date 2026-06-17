import { FocusTrackPoint } from '../components/PlayerSpotlightOverlay';

export type AnalysisStage =
  | 'idle'
  | 'uploaded'
  | 'extracting'
  | 'extracted'
  | 'analyzing'
  | 'analyzed'
  | 'rendering'
  | 'completed'
  | 'failed';

export type FocusPlayer = {
  playerId?: string;
  playerName?: string;
  jerseyNumber?: string | number | null;
  position?: string | null;
  teamSide?: string | null;
  identityStatus?: string | null;
};

export type HighlightClip = {
  id: string;
  startSec: number;
  endSec: number;
  title: string;
  summary: string;
  reason: string;
  eventType?: string;
  importanceScore?: number | null;
  geminiRank?: number | null;
  included: boolean;
  focusPlayer?: FocusPlayer | null;
  focusTrack?: FocusTrackPoint[];
};

export type AnalysisSummary = {
  standoutScene: string;
  strengths: string;
  improvements: string;
  nextTrainingPoint: string;
};

export type SceneAnalysis = {
  clipId: string;
  sceneSummary: string;
  analysis: string;
  positionInterpretation: string;
  correctionPoint: string;
  whyReviewAgain: string;
};

export type AnalysisSetup = {
  positionLabel: string;
  extractionCriteria: string[];
  analysisModeLabel: string;
  recommendedClipCount: number;
};

export type FinalHighlightInfo = {
  fileName: string;
  videoUrl: string;
  totalDurationLabel: string;
  selectedClipCount: number;
  focusPlayerLabel: string;
  spotlightTrack: FocusTrackPoint[];
};

export type VideoAnalysisViewModel = {
  pageTitle: string;
  description: string;
  stage: AnalysisStage;
  videoName: string;
  fileSizeLabel: string;
  uploadedAtLabel?: string;
  positionLabel: string;
  recommendedClipCount: number;
  selectedClipCount: number;
  totalHighlightDurationLabel: string;
  statusBadges: string[];
  setup: AnalysisSetup;
  clips: HighlightClip[];
  summary: AnalysisSummary;
  sceneAnalyses: SceneAnalysis[];
  finalHighlight?: FinalHighlightInfo | null;
};
