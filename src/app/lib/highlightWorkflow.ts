import type { SelectedPlayer } from './api';

export const HIGHLIGHT_WORKFLOW_KEY = 'highlight-workflow-payload';

export type HighlightClip = {
  id?: string;
  url?: string;
  clipUrl?: string;
  outputUrl?: string;
  start?: number | string;
  end?: number | string;
  startTime?: number | string;
  endTime?: number | string;
  duration?: number | string;
  fileName?: string;
  label?: string;
  reason?: string;
  coachComment?: string;
};

export type PlayerSeed = { nx: number; ny: number; timeSec: number };

export type HighlightWorkflowPayload = {
  uploadedVideoUrl?: string;
  uploadedVideoFileName?: string;
  highlightVideoUrl?: string;
  spotlightVideoUrl?: string;
  highlightClips?: HighlightClip[];
  analysisId?: string;
  jobId?: string;
  seeds?: PlayerSeed[];
  player?: SelectedPlayer;
  position?: string;
  summary?: {
    noticeableScene?: string;
    strength?: string;
    weakness?: string;
    trainingPoint?: string;
    nextTrainingPoint?: string;
  };
};

export function saveHighlightWorkflow(payload: HighlightWorkflowPayload) {
  try {
    sessionStorage.setItem(HIGHLIGHT_WORKFLOW_KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

export function readHighlightWorkflow(): HighlightWorkflowPayload | null {
  try {
    const raw = sessionStorage.getItem(HIGHLIGHT_WORKFLOW_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HighlightWorkflowPayload;
  } catch {
    return null;
  }
}

export function patchHighlightWorkflow(patch: Partial<HighlightWorkflowPayload>) {
  const current = readHighlightWorkflow() || {};
  saveHighlightWorkflow({ ...current, ...patch });
}
