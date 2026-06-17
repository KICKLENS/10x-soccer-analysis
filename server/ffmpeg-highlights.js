const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeConcatPath(filePath) {
  return filePath.replace(/'/g, "'\\''");
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} 실행 실패 (code=${code})\n${stderr}`));
      }
    });
  });
}

async function getVideoDurationSeconds(videoPath) {
  const args = [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ];

  const { stdout } = await runCommand('ffprobe', args);
  const duration = Number(stdout.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('ffprobe로 영상 길이를 읽지 못했습니다.');
  }

  return duration;
}

function normalizeHighlights(rawHighlights, videoDuration) {
  const MIN_CLIP_DURATION = 2;
  const MAX_CLIP_DURATION = 25;
  const DEFAULT_PADDING = 1.5;
  const MIN_CONFIDENCE = 0.3;

  const normalized = (Array.isArray(rawHighlights) ? rawHighlights : [])
    .map((item, index) => {
      const start = toSafeNumber(item?.startTime, NaN);
      const end = toSafeNumber(item?.endTime, NaN);
      const confidence = toSafeNumber(item?.confidence, 0);

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return null;
      }

      if (end <= start) {
        return null;
      }

      if (confidence < MIN_CONFIDENCE) {
        return null;
      }

      let paddedStart = clamp(start - DEFAULT_PADDING, 0, videoDuration);
      let paddedEnd = clamp(end + DEFAULT_PADDING, 0, videoDuration);

      if (paddedEnd <= paddedStart) {
        return null;
      }

      let duration = paddedEnd - paddedStart;

      if (duration < MIN_CLIP_DURATION) {
        paddedEnd = clamp(paddedStart + MIN_CLIP_DURATION, 0, videoDuration);
        duration = paddedEnd - paddedStart;
      }

      if (duration > MAX_CLIP_DURATION) {
        paddedEnd = paddedStart + MAX_CLIP_DURATION;
        duration = paddedEnd - paddedStart;
      }

      return {
        id: index + 1,
        type: typeof item?.type === 'string' ? item.type : 'highlight',
        reason: typeof item?.reason === 'string' ? item.reason : 'highlight',
        confidence: clamp(confidence, 0, 1),
        startTime: Number(paddedStart.toFixed(2)),
        endTime: Number(paddedEnd.toFixed(2)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startTime - b.startTime);

  // 겹치는 구간 병합
  const merged = [];
  for (const current of normalized) {
    const last = merged[merged.length - 1];

    if (!last) {
      merged.push({ ...current });
      continue;
    }

    if (current.startTime <= last.endTime + 0.3) {
      last.endTime = Math.max(last.endTime, current.endTime);
      last.confidence = Math.max(last.confidence, current.confidence);
      last.reason = `${last.reason} / ${current.reason}`;
      last.type = last.type || current.type;
    } else {
      merged.push({ ...current });
    }
  }

  return merged.map((item, index) => ({
    ...item,
    id: index + 1,
    startTime: Number(item.startTime.toFixed(2)),
    endTime: Number(item.endTime.toFixed(2)),
  }));
}

async function cutClip({
  inputVideoPath,
  outputClipPath,
  startTime,
  endTime,
}) {
  const duration = Number((endTime - startTime).toFixed(2));

  if (duration <= 0) {
    throw new Error(`잘못된 클립 길이입니다. start=${startTime}, end=${endTime}`);
  }

  const args = [
    '-y',
    '-ss',
    String(startTime),
    '-i',
    inputVideoPath,
    '-t',
    String(duration),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputClipPath,
  ];

  await runCommand('ffmpeg', args);
}

async function concatClips({
  concatListPath,
  outputVideoPath,
}) {
  const args = [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatListPath,
    '-c',
    'copy',
    outputVideoPath,
  ];

  await runCommand('ffmpeg', args);
}

async function renderHighlightsVideo({
  jobId,
  inputVideoPath,
  analysisData,
  outputRootDir,
}) {
  if (!jobId) {
    throw new Error('jobId가 없습니다.');
  }

  if (!inputVideoPath || !fileExists(inputVideoPath)) {
    throw new Error(`원본 영상 파일을 찾을 수 없습니다: ${inputVideoPath}`);
  }

  const rawHighlights = analysisData?.highlights;
  if (!Array.isArray(rawHighlights) || rawHighlights.length === 0) {
    throw new Error('분석 JSON에 highlights가 없습니다.');
  }

  ensureDir(outputRootDir);

  const jobDir = path.join(outputRootDir, jobId);
  ensureDir(jobDir);

  const clipsDir = path.join(jobDir, 'clips');
  ensureDir(clipsDir);

  const videoDuration = await getVideoDurationSeconds(inputVideoPath);
  const highlights = normalizeHighlights(rawHighlights, videoDuration);

  if (highlights.length === 0) {
    throw new Error('유효한 하이라이트 구간이 없습니다.');
  }

  const createdClips = [];

  for (const item of highlights) {
    const clipFileName = `clip-${String(item.id).padStart(2, '0')}.mp4`;
    const clipPath = path.join(clipsDir, clipFileName);

    console.log(`🎬 클립 생성 중: ${clipFileName} (${item.startTime}s ~ ${item.endTime}s)`);

    await cutClip({
      inputVideoPath,
      outputClipPath: clipPath,
      startTime: item.startTime,
      endTime: item.endTime,
    });

    createdClips.push({
      ...item,
      clipFileName,
      clipPath,
    });
  }

  const concatListPath = path.join(jobDir, 'concat-list.txt');
  const concatContent = [
    'ffconcat version 1.0',
    ...createdClips.map((clip) => `file '${escapeConcatPath(clip.clipPath)}'`),
  ].join('\n');

  fs.writeFileSync(concatListPath, concatContent, 'utf-8');

  const outputVideoPath = path.join(jobDir, `${jobId}-highlights.mp4`);

  console.log('🧩 클립 합치기 시작');
  await concatClips({
    concatListPath,
    outputVideoPath,
  });

  return {
    ok: true,
    jobId,
    outputVideoPath,
    clipsDir,
    concatListPath,
    totalClips: createdClips.length,
    highlights: createdClips,
  };
}

module.exports = {
  renderHighlightsVideo,
};
