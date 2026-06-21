import type { AiAnalysisPayload } from './analysisFlow';

const HISTORY_KEY = 'ai-analysis-history';
const MAX_HISTORY = 30;

export type AnalysisHistoryItem = {
  id: string;
  createdAt: string;
  playerName: string;
  position: string;
  uniformColor: string;
  clipCount: number;
  highlightVideoUrl: string;
  payload: AiAnalysisPayload;
};

function makeId(payload: AiAnalysisPayload): string {
  return (
    payload.jobId ||
    payload.analysisId ||
    payload.uploadedVideoFileName ||
    `analysis_${Date.now()}`
  );
}

export function loadAnalysisHistory(): AnalysisHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AnalysisHistoryItem[];
  } catch {
    return [];
  }
}

export function getAnalysisHistoryItem(id: string): AnalysisHistoryItem | null {
  return loadAnalysisHistory().find((item) => item.id === id) || null;
}

export function saveAnalysisToHistory(payload: AiAnalysisPayload): void {
  if (!payload || (!payload.highlightVideoUrl && !(payload.highlightClips?.length))) {
    return;
  }

  try {
    const id = makeId(payload);
    const item: AnalysisHistoryItem = {
      id,
      createdAt: new Date().toISOString(),
      playerName: payload.player?.name || '선수 미지정',
      position: payload.position || payload.player?.position || '',
      uniformColor: payload.player?.uniformColor || '',
      clipCount: Array.isArray(payload.highlightClips) ? payload.highlightClips.length : 0,
      highlightVideoUrl: payload.highlightVideoUrl || '',
      payload,
    };

    const existing = loadAnalysisHistory().filter((entry) => entry.id !== id);
    const next = [item, ...existing].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures (quota, private mode, etc.)
  }
}

export function deleteAnalysisHistoryItem(id: string): AnalysisHistoryItem[] {
  const next = loadAnalysisHistory().filter((item) => item.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function formatHistoryDate(iso: string): string {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}
