import { API_BASE_URL, fetchJson, readSelectedPlayer, toAbsoluteUrl, type SelectedPlayer } from './api';

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

const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

function uploadFormDataWithProgress(
  url: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(Math.min(99, percent));
      }
    };

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader('content-type') || '';
      const body = xhr.responseText || '';

      if (!contentType.includes('application/json')) {
        reject(
          new Error(
            body.startsWith('<!DOCTYPE') || body.startsWith('<html')
              ? `서버 연결에 문제가 있습니다 (${xhr.status}). 잠시 후 다시 시도해 주세요.`
              : body || `업로드 응답 오류 (${xhr.status})`,
          ),
        );
        return;
      }

      let data: UploadResponse & { error?: string; message?: string };
      try {
        data = JSON.parse(body);
      } catch {
        reject(new Error('업로드 응답을 해석하지 못했습니다.'));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data.error || data.message || `업로드 실패 (${xhr.status})`));
        return;
      }

      onProgress?.(100);
      resolve(data);
    };

    xhr.onerror = () =>
      reject(new Error('네트워크 오류로 업로드에 실패했습니다. 연결 상태를 확인해 주세요.'));
    xhr.ontimeout = () =>
      reject(new Error('업로드 시간이 초과되었습니다. 와이파이 환경에서 다시 시도하거나 더 짧게 촬영해 주세요.'));
    xhr.onabort = () => reject(new Error('업로드가 취소되었습니다.'));

    xhr.send(formData);
  });
}

export async function uploadVideoFile(
  file: File,
  player?: SelectedPlayer,
  extras?: Record<string, string>,
  onProgress?: (percent: number) => void,
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

  const data = await uploadFormDataWithProgress(
    `${API_BASE_URL}/api/upload`,
    formData,
    onProgress,
  );

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
  onUploadProgress?: (percent: number) => void,
): Promise<AiAnalysisPayload> {
  onStep?.('uploading');
  const upload = await uploadVideoFile(file, player, extras, onUploadProgress);

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
