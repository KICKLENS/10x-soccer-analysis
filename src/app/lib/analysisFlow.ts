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

export type GpuHeatmap = { cols: number; rows: number; grid: number[][] };

export type GpuMetrics = {
  distanceM?: number;
  avgSpeedMS?: number;
  topSpeedMS?: number;
  sprintCount?: number;
  activityIndex?: number;
};

export type GpuAnalysis = {
  success?: boolean;
  source?: string;
  elapsedSec?: number;
  tracking?: {
    available?: boolean;
    matchConfidence?: number;
    targetSelectedBy?: string;
    reason?: string;
    metrics?: GpuMetrics;
    heatmap?: GpuHeatmap;
    note?: string;
  };
  ball?: {
    available?: boolean;
    windows?: Array<{
      startSec?: number;
      endSec?: number;
      ballDetectionRate?: number;
      avgConfidence?: number;
    }>;
  };
};

export type PipelineDiagnostics = {
  captureMode?: string | null;
  modalEnabled?: boolean;
  detectionSource?: string | null;
  cpuYoloSkipped?: boolean;
  gpuFirstAttempted?: boolean;
  seedPointCount?: number;
  detector?: string | null;
  trackingAvailable?: boolean | null;
  targetSelectedBy?: string | null;
  trackingReason?: string | null;
  matchConfidence?: number | null;
  ballSeenFrames?: number | null;
  sampledFrames?: number | null;
  candidateCount?: number;
  cpuFallbackUsed?: boolean;
  gpuRescued?: boolean;
  factFilterDropped?: number | null;
  finalClipCount?: number | null;
  timestamp?: string;
};

export type ExtractResponse = {
  success?: boolean;
  clips?: HighlightClip[];
  mergedHighlightUrl?: string;
  highlightVideoUrl?: string;
  jobId?: string;
  message?: string;
  gpuAnalysis?: GpuAnalysis | null;
  pipelineDiagnostics?: PipelineDiagnostics | null;
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
  gpuAnalysis?: GpuAnalysis | null;
  pipelineDiagnostics?: PipelineDiagnostics | null;
  position?: string;
  player?: SelectedPlayer;
};

export type AnalysisPipelineStep = 'idle' | 'uploading' | 'analyzing' | 'done';

const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB: 모바일 업링크에서도 한 조각이 금방 끝남
const CHUNK_TIMEOUT_MS = 5 * 60 * 1000;
const CHUNK_MAX_RETRY = 4;

type ChunkResult = { received?: number; total?: number; expected?: number };

function postChunk(
  uploadId: string,
  index: number,
  total: number,
  blob: Blob,
): Promise<ChunkResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/upload/chunk`, true);
    xhr.timeout = CHUNK_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('x-upload-id', uploadId);
    xhr.setRequestHeader('x-chunk-index', String(index));
    xhr.setRequestHeader('x-chunk-total', String(total));

    xhr.onload = () => {
      let data: ChunkResult = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else if (xhr.status === 409) {
        // 서버가 기대하는 인덱스로 되감기 (재시도 안전)
        reject(Object.assign(new Error('chunk-order'), { expected: data.expected }));
      } else {
        reject(new Error(`청크 업로드 실패 (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.onabort = () => reject(new Error('aborted'));

    xhr.send(blob);
  });
}

function randomUploadId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* noop */
  }
  return `up-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function uploadVideoFile(
  file: File,
  _player?: SelectedPlayer,
  _extras?: Record<string, string>,
  onProgress?: (percent: number) => void,
): Promise<{ fileName: string; videoUrl: string; analysisId: string }> {
  const uploadId = randomUploadId();
  const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  let index = 0;

  while (index < total) {
    const start = index * CHUNK_SIZE;
    const blob = file.slice(start, Math.min(file.size, start + CHUNK_SIZE));

    let attempt = 0;
    for (;;) {
      try {
        const result = await postChunk(uploadId, index, total, blob);
        index = typeof result.received === 'number' ? result.received : index + 1;
        break;
      } catch (err) {
        const expected = (err as { expected?: number }).expected;
        if (typeof expected === 'number') {
          // 서버가 기대하는 위치로 동기화 후 그 지점부터 다시 전송
          index = expected;
          break;
        }
        attempt += 1;
        if (attempt >= CHUNK_MAX_RETRY) {
          throw new Error(
            '네트워크가 불안정해 업로드에 실패했습니다. 와이파이 환경에서 다시 시도해 주세요.',
          );
        }
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }

    onProgress?.(Math.min(99, Math.round((index / total) * 100)));
  }

  const data = await fetchJson<UploadResponse & { error?: string }>('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, fileName: file.name }),
  });

  const fileName = data.fileName || data.savedFilename || '';
  const videoUrl = toAbsoluteUrl(data.videoUrl || '');

  if (!fileName || !videoUrl) {
    throw new Error('업로드는 완료되었지만 영상 정보를 확인하지 못했습니다.');
  }

  onProgress?.(100);

  return {
    fileName,
    videoUrl,
    analysisId: data.analysisId || '',
  };
}

// 잡 폴링 — 네트워크 일시 오류는 재시도, 404(서버 재시작으로 잡 사라짐)는 일정 횟수 후 포기
async function pollExtractJob<T>(
  jobId: string,
  onStage?: (stage: string, progress?: number) => void,
): Promise<T> {
  const POLL_MS = 4000;
  const MAX_NET_FAILS = 15;
  const MAX_NOT_FOUND = 3;
  let netFails = 0;
  let notFound = 0;
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    let job: {
      success?: boolean;
      status?: string;
      stage?: string;
      progress?: number;
      result?: T;
      error?: string;
      pipelineDiagnostics?: PipelineDiagnostics | null;
    };
    try {
      job = await fetchJson<typeof job>(`/api/jobs/${jobId}`);
      netFails = 0;
      notFound = 0;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        notFound += 1;
        if (notFound >= MAX_NOT_FOUND) {
          const e = new Error('분석 작업을 찾을 수 없습니다. 다시 시도해 주세요.');
          (e as unknown as { jobGone: boolean }).jobGone = true;
          throw e;
        }
        continue;
      }
      netFails += 1;
      if (netFails >= MAX_NET_FAILS) throw new Error('서버와의 연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.');
      continue;
    }
    onStage?.(job.stage || '', job.progress);
    if (job.status === 'done') return job.result as T;
    if (job.status === 'error') {
      const e = new Error(job.error || '분석 중 오류가 발생했습니다.');
      (e as unknown as { pipelineDiagnostics?: PipelineDiagnostics | null }).pipelineDiagnostics =
        job.pipelineDiagnostics ?? null;
      throw e;
    }
  }
}

export async function extractHighlightsForPlayer(
  fileName: string,
  player?: SelectedPlayer,
  onStage?: (stage: string, progress?: number) => void,
  extras?: Record<string, string>,
): Promise<ExtractResponse> {
  const resolvedPlayer = player ?? readSelectedPlayer();

  const body: Record<string, unknown> = {
    fileName,
    savedFilename: fileName,
    ...resolvedPlayer,
    player: resolvedPlayer,
  };

  // 모바일 촬영: 시작 5초간 화면 중앙에 둔 선수를 GPU 추적 시드로 전달
  if (extras?.captureMode === 'landscape-player-focus') {
    const seeds = [0.5, 1.5, 2.5, 3.5, 4.5].map((timeSec) => ({
      timeSec,
      nx: 0.5,
      ny: 0.5,
    }));
    body.seeds = seeds;
    body.seed = seeds[2];
    body.captureMode = extras.captureMode;
  }

  // 비동기 잡 시작
  const start = await fetchJson<{ jobId?: string; success?: boolean }>('/api/jobs/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!start.jobId) throw new Error('주요 장면 추출 작업을 시작하지 못했습니다.');

  // 잡 완료까지 폴링
  return pollExtractJob<ExtractResponse>(start.jobId, onStage);
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
    gpuAnalysis: input.extract.gpuAnalysis ?? null,
    pipelineDiagnostics: input.extract.pipelineDiagnostics ?? null,
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
  onAnalysisStage?: (stage: string, progress?: number) => void,
): Promise<AiAnalysisPayload> {
  onStep?.('uploading');
  const upload = await uploadVideoFile(file, player, extras, onUploadProgress);

  onStep?.('analyzing');
  const extract = await extractHighlightsForPlayer(upload.fileName, player, onAnalysisStage, extras);

  const clips = Array.isArray(extract.clips) ? extract.clips : [];

  if (clips.length === 0) {
    throw new Error('주요 장면을 추출하지 못했습니다. 다른 각도로 다시 촬영해 주세요.');
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
