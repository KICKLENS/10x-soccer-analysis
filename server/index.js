'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { analyzeHighlightsWithGemini } = require('./gemini-highlights');

function safeRequire(name) {
  try {
    return require(name);
  } catch (error) {
    return null;
  }
}

const ffmpegStatic = safeRequire('ffmpeg-static');
const ffprobeStatic = safeRequire('ffprobe-static');

const FFMPEG_BIN =
  process.env.FFMPEG_PATH ||
  ffmpegStatic ||
  'ffmpeg';

const FFPROBE_BIN =
  process.env.FFPROBE_PATH ||
  (ffprobeStatic && (ffprobeStatic.path || ffprobeStatic.ffprobePath)) ||
  'ffprobe';

const PORT = Number(process.env.PORT || 4000);
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

const SERVER_ROOT = __dirname;
const STORAGE_ROOT = path.join(SERVER_ROOT, 'storage');
const UPLOAD_DIR = path.join(STORAGE_ROOT, 'uploads');
const TEMP_DIR = path.join(STORAGE_ROOT, 'temp');
const TEMP_ORIGINALS_DIR = path.join(TEMP_DIR, 'originals');
const RENDER_WORK_DIR = path.join(TEMP_DIR, 'render-work');
const OUTPUT_DIR = path.join(STORAGE_ROOT, 'outputs');

const MAX_UPLOAD_BYTES = Number(
  process.env.MAX_FILE_SIZE || 10 * 1024 * 1024 * 1024,
);

// 화질 우선 설정
const VIDEO_CODEC = process.env.HIGHLIGHT_VIDEO_CODEC || 'libx264';
const VIDEO_PRESET = process.env.HIGHLIGHT_VIDEO_PRESET || 'slow';
const VIDEO_CRF = Number(process.env.HIGHLIGHT_VIDEO_CRF || 15);
const AUDIO_CODEC = process.env.HIGHLIGHT_AUDIO_CODEC || 'aac';
const AUDIO_BITRATE = process.env.HIGHLIGHT_AUDIO_BITRATE || '192k';
const AUDIO_SAMPLE_RATE = process.env.HIGHLIGHT_AUDIO_SAMPLE_RATE || '48000';

const app = express();

ensureDir(STORAGE_ROOT);
ensureDir(UPLOAD_DIR);
ensureDir(TEMP_DIR);
ensureDir(TEMP_ORIGINALS_DIR);
ensureDir(RENDER_WORK_DIR);
ensureDir(OUTPUT_DIR);

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/temp', express.static(TEMP_DIR));
app.use('/outputs', express.static(OUTPUT_DIR));

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeId(prefix = 'job') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function sanitizeBaseName(value, fallback = 'file') {
  const cleaned = String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}\-_]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || fallback;
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeExt(fileName, mimeType = '') {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (ext) return ext;

  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('quicktime')) return '.mov';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('x-matroska')) return '.mkv';
  if (mime.includes('x-msvideo')) return '.avi';
  return '.mp4';
}

function formatTimestamp(totalSeconds) {
  const sec = Math.max(0, Math.floor(safeNumber(totalSeconds, 0)));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function fileExists(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

function toPublicUrl(absPath) {
  if (!absPath) return '';

  const normalized = path.resolve(absPath);

  if (normalized.startsWith(path.resolve(UPLOAD_DIR))) {
    const rel = path.relative(UPLOAD_DIR, normalized).split(path.sep).join('/');
    return `${PUBLIC_BASE_URL}/uploads/${rel}`;
  }

  if (normalized.startsWith(path.resolve(TEMP_DIR))) {
    const rel = path.relative(TEMP_DIR, normalized).split(path.sep).join('/');
    return `${PUBLIC_BASE_URL}/temp/${rel}`;
  }

  if (normalized.startsWith(path.resolve(OUTPUT_DIR))) {
    const rel = path.relative(OUTPUT_DIR, normalized).split(path.sep).join('/');
    return `${PUBLIC_BASE_URL}/outputs/${rel}`;
  }

  return '';
}

function fromPublicLikePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (fileExists(raw)) {
    return path.resolve(raw);
  }

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      return fromPublicLikePath(url.pathname);
    }
  } catch (error) {
    // ignore
  }

  const clean = raw.replace(/\\/g, '/');

  if (clean.startsWith('/uploads/')) {
    return path.join(UPLOAD_DIR, clean.replace(/^\/uploads\//, ''));
  }

  if (clean.startsWith('/temp/')) {
    return path.join(TEMP_DIR, clean.replace(/^\/temp\//, ''));
  }

  if (clean.startsWith('/outputs/')) {
    return path.join(OUTPUT_DIR, clean.replace(/^\/outputs\//, ''));
  }

  if (clean.startsWith('uploads/')) {
    return path.join(UPLOAD_DIR, clean.replace(/^uploads\//, ''));
  }

  if (clean.startsWith('temp/')) {
    return path.join(TEMP_DIR, clean.replace(/^temp\//, ''));
  }

  if (clean.startsWith('outputs/')) {
    return path.join(OUTPUT_DIR, clean.replace(/^outputs\//, ''));
  }

  const candidateFromServer = path.join(SERVER_ROOT, clean);
  if (fileExists(candidateFromServer)) return candidateFromServer;

  const candidateFromStorage = path.join(STORAGE_ROOT, clean);
  if (fileExists(candidateFromStorage)) return candidateFromStorage;

  return '';
}

function pickFirstExistingPath(...values) {
  for (const value of values) {
    const resolved = fromPublicLikePath(value);
    if (resolved && fileExists(resolved)) return resolved;
  }
  return '';
}

function resolveSourceVideoPath(body = {}) {
  const upload = body.upload && typeof body.upload === 'object' ? body.upload : {};
  const analysis = body.analysis && typeof body.analysis === 'object' ? body.analysis : {};

  return pickFirstExistingPath(
    body.localVideoPath,
    body.videoPath,
    body.filePath,
    body.tempFilePath,
    body.tempOriginalPath,
    body.sourceVideoPath,
    body.originalVideoPath,

    upload.filePath,
    upload.tempFilePath,
    upload.tempOriginalPath,
    upload.sourceVideoPath,
    upload.originalVideoPath,
    upload.videoPath,
    upload.videoUrl,
    upload.previewUrl,

    analysis.sourceVideoPath,
    analysis.tempOriginalPath,
    analysis.videoPath,
    analysis.videoUrl,

    body.videoUrl,
    body.previewUrl,
    body.outputPath,
  );
}

function normalizeHighlightItem(item, index, sourceDurationSec) {
  const obj = item && typeof item === 'object' ? item : {};

  let start = safeNumber(
    obj.start ?? obj.startSec ?? obj.startTime,
    NaN,
  );
  let end = safeNumber(
    obj.end ?? obj.endSec ?? obj.endTime,
    NaN,
  );

  if (!Number.isFinite(start)) start = index * 8;
  if (!Number.isFinite(end)) end = start + 8;

  start = Math.max(0, start);
  end = Math.max(start + 1, end);

  if (sourceDurationSec > 0) {
    start = clamp(start, 0, Math.max(0, sourceDurationSec - 1));
    end = clamp(end, start + 1, sourceDurationSec);
  }

  if (end - start > 18) {
    end = start + 18;
  }

  return {
    index: index + 1,
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
    duration: Number((end - start).toFixed(2)),
    title: String(obj.title || `하이라이트 ${index + 1}`).trim() || `하이라이트 ${index + 1}`,
    description: String(obj.description || '').trim(),
    tags: Array.isArray(obj.tags)
      ? obj.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
      : [],
    score: safeNumber(obj.score, 75),
    startLabel: formatTimestamp(start),
    endLabel: formatTimestamp(end),
  };
}

function normalizeHighlightList(highlights, sourceDurationSec) {
  if (!Array.isArray(highlights)) return [];

  const sorted = highlights
    .map((item, index) => normalizeHighlightItem(item, index, sourceDurationSec))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start);

  const deduped = [];
  for (const item of sorted) {
    const overlap = deduped.some((prev) => {
      const start = Math.max(prev.start, item.start);
      const end = Math.min(prev.end, item.end);
      const overlapSec = Math.max(0, end - start);
      return overlapSec >= Math.min(prev.duration, item.duration) * 0.7;
    });
    if (!overlap) {
      deduped.push({
        ...item,
        index: deduped.length + 1,
      });
    }
  }

  return deduped;
}

function guessMimeType(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  switch (ext) {
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.m4v':
      return 'video/x-m4v';
    case '.mp4':
    default:
      return 'video/mp4';
  }
}

function runCommand(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd || SERVER_ROOT,
      env: process.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(
        new Error(
          `${path.basename(bin)} 실행 실패: ${error.message}\n경로: ${bin}`,
        ),
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${path.basename(bin)} 실행 실패 (code ${code})\n${stderr || stdout || '알 수 없는 오류'}`,
        ),
      );
    });
  });
}

async function getVideoDurationSec(filePath) {
  const args = [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    filePath,
  ];

  const { stdout } = await runCommand(FFPROBE_BIN, args);
  const parsed = JSON.parse(stdout || '{}');
  const duration = safeNumber(parsed?.format?.duration, 0);
  return duration > 0 ? duration : 0;
}

async function uniqueTargetPath(dirPath, preferredName) {
  ensureDir(dirPath);

  const ext = path.extname(preferredName);
  const base = path.basename(preferredName, ext);

  let counter = 0;
  while (counter < 10000) {
    const fileName = counter === 0 ? `${base}${ext}` : `${base}_${counter}${ext}`;
    const target = path.join(dirPath, fileName);
    if (!fileExists(target)) {
      return target;
    }
    counter += 1;
  }

  return path.join(dirPath, `${base}_${Date.now()}${ext}`);
}

async function safeUnlink(filePath) {
  try {
    if (fileExists(filePath)) {
      await fsp.unlink(filePath);
    }
  } catch (error) {
    // ignore
  }
}

async function moveOriginalToTemp(originalPath) {
  if (!originalPath || !fileExists(originalPath)) {
    return {
      moved: false,
      path: '',
      url: '',
    };
  }

  const alreadyTemp = path.resolve(originalPath).startsWith(path.resolve(TEMP_ORIGINALS_DIR));
  if (alreadyTemp) {
    return {
      moved: false,
      path: originalPath,
      url: toPublicUrl(originalPath),
    };
  }

  const target = await uniqueTargetPath(
    TEMP_ORIGINALS_DIR,
    path.basename(originalPath),
  );

  try {
    await fsp.rename(originalPath, target);
  } catch (error) {
    await fsp.copyFile(originalPath, target);
    await fsp.unlink(originalPath);
  }

  return {
    moved: true,
    path: target,
    url: toPublicUrl(target),
  };
}

async function cleanupDir(dirPath) {
  try {
    await fsp.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    // ignore cleanup error
  }
}

async function renderHighlightsVideo({
  inputPath,
  highlights,
  playerName = '',
}) {
  if (!inputPath || !fileExists(inputPath)) {
    throw new Error('렌더링할 원본 영상 경로를 찾지 못했습니다.');
  }

  const sourceDurationSec = await getVideoDurationSec(inputPath).catch(() => 0);
  const normalizedHighlights = normalizeHighlightList(highlights, sourceDurationSec);

  if (!normalizedHighlights.length) {
    throw new Error('렌더링할 하이라이트 구간이 없습니다.');
  }

  const renderJobId = makeId('render');
  const workDir = path.join(RENDER_WORK_DIR, renderJobId);
  ensureDir(workDir);

  const outputBaseName = `${sanitizeBaseName(playerName || 'highlight', 'highlight')}_${Date.now()}`;
  const outputPath = path.join(OUTPUT_DIR, `${outputBaseName}.mp4`);

  try {
    const clipPaths = [];

    // 1) 각 클립을 고품질로 생성
    for (let i = 0; i < normalizedHighlights.length; i += 1) {
      const item = normalizedHighlights[i];
      const clipPath = path.join(workDir, `clip_${String(i + 1).padStart(2, '0')}.mp4`);

      const args = [
        '-y',
        '-ss',
        String(item.start),
        '-i',
        inputPath,
        '-t',
        String(item.duration),
        '-map',
        '0:v:0?',
        '-map',
        '0:a:0?',
        '-c:v',
        VIDEO_CODEC,
        '-preset',
        VIDEO_PRESET,
        '-crf',
        String(VIDEO_CRF),
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        AUDIO_CODEC,
        '-b:a',
        AUDIO_BITRATE,
        '-ar',
        AUDIO_SAMPLE_RATE,
        '-movflags',
        '+faststart',
        clipPath,
      ];

      await runCommand(FFMPEG_BIN, args);
      clipPaths.push(clipPath);
    }

    const listFilePath = path.join(workDir, 'concat.txt');
    const listText = clipPaths
      .map((clipPath) => `file '${clipPath.replace(/'/g, `'\\''`)}'`)
      .join('\n');

    await fsp.writeFile(listFilePath, listText, 'utf8');

    // 2) 1차: 재인코딩 없이 concat 시도 (화질 손실 최소화)
    const concatCopyArgs = [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFilePath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    let concatMode = 'copy';

    try {
      await runCommand(FFMPEG_BIN, concatCopyArgs);
    } catch (copyError) {
      // 3) 실패 시 fallback: 고품질 재인코딩 concat
      concatMode = 'reencode';
      await safeUnlink(outputPath);

      const concatReencodeArgs = [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFilePath,
        '-c:v',
        VIDEO_CODEC,
        '-preset',
        VIDEO_PRESET,
        '-crf',
        String(VIDEO_CRF),
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        AUDIO_CODEC,
        '-b:a',
        AUDIO_BITRATE,
        '-ar',
        AUDIO_SAMPLE_RATE,
        '-movflags',
        '+faststart',
        outputPath,
      ];

      await runCommand(FFMPEG_BIN, concatReencodeArgs);
    }

    return {
      success: true,
      outputPath,
      outputFileName: path.basename(outputPath),
      outputUrl: toPublicUrl(outputPath),
      videoUrl: toPublicUrl(outputPath),
      downloadUrl: toPublicUrl(outputPath),
      highlightsCount: normalizedHighlights.length,
      renderedAt: new Date().toISOString(),
      highlights: normalizedHighlights,
      renderJobId,
      concatMode,
      quality: {
        codec: VIDEO_CODEC,
        preset: VIDEO_PRESET,
        crf: VIDEO_CRF,
        audioCodec: AUDIO_CODEC,
        audioBitrate: AUDIO_BITRATE,
        audioSampleRate: AUDIO_SAMPLE_RATE,
      },
    };
  } finally {
    await cleanupDir(workDir);
  }
}

function normalizeUploadPayload(file, reqBody = {}) {
  const jobId = makeId('upload');

  return {
    success: true,
    message: '영상 업로드가 완료되었습니다.',
    jobId,
    filePath: file.path,
    tempFilePath: file.path,
    originalName: file.originalname,
    fileName: file.filename,
    fileSize: file.size,
    mimeType: file.mimetype || guessMimeType(file.path),
    uploadedAt: new Date().toISOString(),
    videoUrl: toPublicUrl(file.path),
    previewUrl: toPublicUrl(file.path),
    playerName: String(reqBody.playerName || '').trim(),
    position: String(reqBody.position || '').trim(),
    teamName: String(reqBody.teamName || '').trim(),
    jerseyNumber: String(reqBody.jerseyNumber || '').trim(),
    playerTraits: String(reqBody.playerTraits || '').trim(),
  };
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureDir(UPLOAD_DIR);
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const ext = normalizeExt(file.originalname, file.mimetype);
    const base = sanitizeBaseName(file.originalname, 'video');
    cb(null, `${base}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
  fileFilter(req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = normalizeExt(file.originalname, file.mimetype);

    const okMime = mime.startsWith('video/');
    const okExt = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v'].includes(ext);

    if (!okMime && !okExt) {
      cb(new Error('영상 파일(mp4, mov, avi, webm, mkv, m4v)만 업로드할 수 있습니다.'));
      return;
    }

    cb(null, true);
  },
});

async function handleUpload(req, res) {
  if (!req.file) {
    res.status(400).json({
      success: false,
      message: '업로드할 영상 파일이 없습니다. field 이름은 video 여야 합니다.',
    });
    return;
  }

  const payload = normalizeUploadPayload(req.file, req.body);
  res.json(payload);
}

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'server ok',
    ffmpeg: FFMPEG_BIN,
    ffprobe: FFPROBE_BIN,
    quality: {
      codec: VIDEO_CODEC,
      preset: VIDEO_PRESET,
      crf: VIDEO_CRF,
      audioCodec: AUDIO_CODEC,
      audioBitrate: AUDIO_BITRATE,
      audioSampleRate: AUDIO_SAMPLE_RATE,
    },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/upload-video', upload.single('video'), handleUpload);
app.post('/api/upload', upload.single('video'), handleUpload);

app.post('/api/highlight-json', async (req, res) => {
  try {
    const body = req.body || {};
    const player = body.player && typeof body.player === 'object' ? body.player : {};

    const sourceVideoPath = resolveSourceVideoPath(body);
    if (!sourceVideoPath) {
      res.status(400).json({
        success: false,
        message: '분석할 원본 영상 경로를 찾지 못했습니다. 먼저 업로드를 완료해 주세요.',
      });
      return;
    }

    const sourceDurationSec = await getVideoDurationSec(sourceVideoPath).catch(() => 0);

    const analysis = await analyzeHighlightsWithGemini({
      player,
      playerName: body.playerName || player.name,
      teamName: body.teamName || player.teamName,
      jerseyNumber: body.jerseyNumber || player.jerseyNumber,
      position: body.position || player.position,
      playerTraits: body.playerTraits || player.traits,
      localVideoPath: sourceVideoPath,
      videoDurationSec: sourceDurationSec,
    });

    let renderResult = null;
    let renderError = '';

    try {
      renderResult = await renderHighlightsVideo({
        inputPath: sourceVideoPath,
        highlights: analysis.highlights,
        playerName: body.playerName || player.name || 'highlight',
      });
    } catch (error) {
      renderError = error instanceof Error ? error.message : '자동 렌더링에 실패했습니다.';
    }

    let tempOriginal = {
      moved: false,
      path: sourceVideoPath,
      url: toPublicUrl(sourceVideoPath),
    };

    if (renderResult?.success) {
      tempOriginal = await moveOriginalToTemp(sourceVideoPath);
    }

    res.json({
      success: true,
      message: renderResult?.success
        ? '하이라이트 추출 및 자동 렌더링이 완료되었습니다.'
        : '하이라이트 추출은 완료되었지만 자동 렌더링은 실패했습니다.',
      model: analysis.model,
      finishReason: analysis.finishReason,
      rawText: analysis.rawText,
      summary: analysis.summary,
      playerFocus: analysis.playerFocus,
      highlights: analysis.highlights,
      videoDurationSec: analysis.videoDurationSec || sourceDurationSec || undefined,
      totalCandidatesReviewed: analysis.totalCandidatesReviewed || analysis.highlights.length,

      autoRender: Boolean(renderResult?.success),
      autoRenderError: renderError || undefined,

      renderedVideoUrl: renderResult?.videoUrl || '',
      renderedDownloadUrl: renderResult?.downloadUrl || '',
      outputUrl: renderResult?.outputUrl || '',
      outputPath: renderResult?.outputPath || '',
      outputFileName: renderResult?.outputFileName || '',
      renderedAt: renderResult?.renderedAt || '',
      highlightsCount: renderResult?.highlightsCount || analysis.highlights.length,
      concatMode: renderResult?.concatMode || '',
      renderQuality: renderResult?.quality || null,

      tempOriginalPath: tempOriginal.path || '',
      tempOriginalUrl: tempOriginal.url || '',

      sourceVideoPath: tempOriginal.path || sourceVideoPath,

      renderResult: renderResult || null,
      upload: {
        ...(body.upload && typeof body.upload === 'object' ? body.upload : {}),
        filePath: tempOriginal.path || sourceVideoPath,
        tempFilePath: tempOriginal.path || sourceVideoPath,
        tempOriginalPath: tempOriginal.path || sourceVideoPath,
        tempOriginalUrl: tempOriginal.url || toPublicUrl(sourceVideoPath),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '하이라이트 추출에 실패했습니다.',
    });
  }
});

app.post('/api/highlight-render', async (req, res) => {
  try {
    const body = req.body || {};
    const player = body.player && typeof body.player === 'object' ? body.player : {};

    const sourceVideoPath = resolveSourceVideoPath(body);
    if (!sourceVideoPath) {
      res.status(400).json({
        success: false,
        message: '렌더링할 원본 영상 경로를 찾지 못했습니다.',
      });
      return;
    }

    const sourceDurationSec = await getVideoDurationSec(sourceVideoPath).catch(() => 0);
    const highlights = normalizeHighlightList(
      body.highlights || body.analysis?.highlights || [],
      sourceDurationSec,
    );

    if (!highlights.length) {
      res.status(400).json({
        success: false,
        message: '렌더링할 하이라이트 구간이 없습니다.',
      });
      return;
    }

    const renderResult = await renderHighlightsVideo({
      inputPath: sourceVideoPath,
      highlights,
      playerName: body.playerName || player.name || 'highlight',
    });

    const tempOriginal = await moveOriginalToTemp(sourceVideoPath);

    res.json({
      success: true,
      message: '하이라이트 영상 저장이 완료되었습니다.',
      videoUrl: renderResult.videoUrl,
      downloadUrl: renderResult.downloadUrl,
      outputUrl: renderResult.outputUrl,
      outputPath: renderResult.outputPath,
      outputFileName: renderResult.outputFileName,
      highlightsCount: renderResult.highlightsCount,
      renderedAt: renderResult.renderedAt,
      concatMode: renderResult.concatMode,
      renderQuality: renderResult.quality,
      tempOriginalPath: tempOriginal.path || sourceVideoPath,
      tempOriginalUrl: tempOriginal.url || toPublicUrl(sourceVideoPath),
      sourceVideoPath: tempOriginal.path || sourceVideoPath,
      renderResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '하이라이트 저장에 실패했습니다.',
    });
  }
});

app.get('/', (req, res) => {
  res.send('10X AI Sports server is running.');
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
    return;
  }

  if (error) {
    res.status(500).json({
      success: false,
      message: error.message || '서버 오류가 발생했습니다.',
    });
    return;
  }

  next();
});

app.listen(PORT, () => {
  console.log(`10X AI Sports server listening on ${PUBLIC_BASE_URL}`);
  console.log(`FFMPEG_BIN: ${FFMPEG_BIN}`);
  console.log(`FFPROBE_BIN: ${FFPROBE_BIN}`);
  console.log(
    `HIGHLIGHT_QUALITY: codec=${VIDEO_CODEC}, preset=${VIDEO_PRESET}, crf=${VIDEO_CRF}, audio=${AUDIO_CODEC}/${AUDIO_BITRATE}/${AUDIO_SAMPLE_RATE}`,
  );
});
