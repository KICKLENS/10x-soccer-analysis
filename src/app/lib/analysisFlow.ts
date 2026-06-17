import { fetchJson, readSelectedPlayer, toAbsoluteUrl, type SelectedPlayer } from './api';

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
  filename?: string;
  label?: string;
  reason?: string;
  coachComment?: string;
};

export type UploadResponse = {
  success?: boolean;
  fileName?: string;
  savedFilename?: string;
  videoUrl?: string;
  analysisId?: string;
  message?: string;
};

export type ExtractResponse = {
  success?: boolean;
  clips?: HighlightClip[];
  mergedHighlightUrl?: string;
  highlightVideoUrl?: string;
  jobId?: string;
  message?: string;
  summary?: {
    noticeableScene?: string;
    strength?: string;
    weakness?: string;
    trainingPoint?: string;
    nextTrainingPoint?: string;
  };
};

export type AiAnalysisPayload = {
  uploadedVideoUrl?: string;
  highlightVideoUrl?: string;
  highlightClips?: HighlightClip[];
  uploadedVideoFileName?: string;
  analysisId?: string;
  jobId?: string;
  summary?: ExtractResponse['summary'];
  position?: string;
  player?: SelectedPlayer;
};

export type AnalysisPipelineStep = 'idle' | 'uploading' | 'analyzing' | 'done';

export async function uploadVideoFile(
  file: File,
  player?: SelectedPlayer,
  extras?: Record<string, string>,
): Promise<{ fileName: string; videoUrl: string; analysisId: string }> {
  const formData = new FormData();
  formData.append('video', file);

  const resolvedPlayer = player ?? readSelectedPlayer();
  if (resolvedPlayer.name) {
    formData.append('playerName', resolvedPlayer.name);
    formData.append('playerPosition', resolvedPlayer.position ?? '');
    formData.append('teamName', resolvedPlayer.teamName ?? '');
    formData.append('jerseyNumber', resolvedPlayer.jerseyNumber ?? '');
    formData.append('uniformColor', resolvedPlayer.uniformColor ?? '');
    formData.append('traits', resolvedPlayer.traits ?? '');
    formData.append('selectedPlayer', JSON.stringify(resolvedPlayer));
  }

  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      formData.append(key, value);
    }
  }

  const data = await fetchJson<UploadResponse>('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const fileName = data.fileName || data.savedFilename || '';
  const videoUrl = toAbsoluteUrl(data.videoUrl || '');

  if (!fileName || !videoUrl) {
    throw new Error('업로드는 완료되었지만 영상 정보를 확인하지 못했습니다.');
  }

  return {
    fileName,
    videoUrl,
    analysisId: data.analysisId || '',
  };
}

export async function extractHighlightsForPlayer(
  fileName: string,
  player?: SelectedPlayer,
): Promise<ExtractResponse> {
  const resolvedPlayer = player ?? readSelectedPlayer();

  return fetchJson<ExtractResponse>('/api/extract-highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName,
      savedFilename: fileName,
      ...resolvedPlayer,
      player: resolvedPlayer,
    }),
  });
}

export function buildAiAnalysisPayload(input: {
  uploadedVideoUrl: string;
  uploadedVideoFileName: string;
  analysisId?: string;
  extract: ExtractResponse;
  player?: SelectedPlayer;
}): AiAnalysisPayload {
  const player = input.player ?? readSelectedPlayer();

  return {
    uploadedVideoUrl: input.uploadedVideoUrl,
    highlightVideoUrl: toAbsoluteUrl(
      input.extract.mergedHighlightUrl || input.extract.highlightVideoUrl || '',
    ),
    highlightClips: Array.isArray(input.extract.clips) ? input.extract.clips : [],
    uploadedVideoFileName: input.uploadedVideoFileName,
    analysisId: input.analysisId || '',
    jobId: input.extract.jobId || '',
    summary: input.extract.summary,
    position: player.position || '골키퍼',
    player,
  };
}

export function persistAiAnalysisPayload(payload: AiAnalysisPayload): void {
  try {
    sessionStorage.setItem('ai-analysis-payload', JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

export async function runMobileAnalysisPipeline(
  file: File,
  player: SelectedPlayer,
  extras?: Record<string, string>,
  onStep?: (step: AnalysisPipelineStep) => void,
): Promise<AiAnalysisPayload> {
  onStep?.('uploading');
  const upload = await uploadVideoFile(file, player, extras);

  onStep?.('analyzing');
  const extract = await extractHighlightsForPlayer(upload.fileName, player);

  const mergedUrl = toAbsoluteUrl(extract.mergedHighlightUrl || extract.highlightVideoUrl || '');
  const clips = Array.isArray(extract.clips) ? extract.clips : [];

  if (!mergedUrl && clips.length === 0) {
    throw new Error('하이라이트를 생성하지 못했습니다. 다른 각도로 다시 촬영해 주세요.');
  }

  const payload = buildAiAnalysisPayload({
    uploadedVideoUrl: upload.videoUrl,
    uploadedVideoFileName: upload.fileName,
    analysisId: upload.analysisId,
    extract,
    player,
  });

  persistAiAnalysisPayload(payload);
  onStep?.('done');
  return payload;
}
