import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 4000);
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const YOLO_SCRIPT = path.resolve(__dirname, 'yolo-service/detect_ball.py');
const YOLO_CWD = path.resolve(__dirname, 'yolo-service');
const YOLO_PYTHON = fs.existsSync(path.join(YOLO_CWD, '.venv/bin/python3'))
  ? path.join(YOLO_CWD, '.venv/bin/python3')
  : 'python3';

const GEMINI_MODELS = (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.0-flash,gemini-2.0-flash-001')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

// Modal GPU 고급 분석(선수 추적·히트맵·공 SAHI) — 환경변수 미설정 시 자동 건너뜀
const MODAL_ANALYZE_URL = (process.env.MODAL_ANALYZE_URL || '').trim();
const MODAL_AUTH_TOKEN = (process.env.MODAL_AUTH_TOKEN || '').trim();
const MODAL_SAMPLE_FPS = Number(process.env.MODAL_SAMPLE_FPS) || 8;
const MODAL_ENABLED = Boolean(MODAL_ANALYZE_URL);

// 하이라이트 효과 렌더(소개 카드 + 스포트라이트) — Modal 엔드포인트
const MODAL_RENDER_URL = (
  process.env.MODAL_RENDER_URL || 'https://kicklens--soccer-fx-render-highlights.modal.run'
).trim();
const HIGHLIGHT_FX_ENABLED = String(process.env.HIGHLIGHT_FX_ENABLED ?? '1') === '1';

// 비용 최적화: Gemini 시각 검수 단계 파라미터 (환경변수로 조정 가능)
const QC_FRAME_WIDTH = Number(process.env.QC_FRAME_WIDTH) || 768;
const QC_FRAMES_PER_CLIP = Math.max(1, Math.min(2, Number(process.env.QC_FRAMES_PER_CLIP) || 2));
const QC_MAX_CLIPS = Math.max(1, Number(process.env.QC_MAX_CLIPS) || 8);

// ── 분석 정책: 속도보다 정확도. AI 추측·짐작·전망 절대 금지 ─────────────────
const ANALYSIS_ZERO_SPECULATION = String(process.env.ANALYSIS_ZERO_SPECULATION ?? '1') === '1';
const QC_FRAMES_STRICT = Math.max(QC_FRAMES_PER_CLIP, ANALYSIS_ZERO_SPECULATION ? 3 : QC_FRAMES_PER_CLIP);

const ANALYSIS_ZERO_SPECULATION_POLICY = `
[10x.ai.kr 분석 절대 규칙 — 위반 시 해당 문장 무효]
1. 추측·짐작·가능성·전망·확률·"~할 것""~인 듯""아마""추정""보이는 것 같" 표현 금지
2. 영상·프레임·탐지 JSON에 없는 사실 서술 금지
3. 확실하지 않으면 "확인 불가" 또는 빈 문자열/빈 배열 — 지어내지 말 것
4. 등록 선수가 아닌 다른 선수의 플레이를 대상 선수 것처럼 쓰지 말 것
5. 장점·단점·훈련 포인트는 확인된 장면 근거 필수 — 근거 없으면 쓰지 말 것
`.trim();

const SPECULATIVE_TEXT_RE = /(확률|가능성|짐작|추측|추정|~?\s*할\s*(것|듯|거)|~?\s*인\s*(듯|것|거)|아마|보\s*이(?:는\s*것\s*)?같|~?\s*일\s*(것|듯)|먼저\s*골|이길|질\s*것|우위|열세|~?\s*듯\s*하)/i;

function wrapAnalysisPrompt(prompt) {
  return ANALYSIS_ZERO_SPECULATION ? `${ANALYSIS_ZERO_SPECULATION_POLICY}\n\n${prompt}` : prompt;
}

function stripSpeculativeSentences(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .split(/(?<=[.!?。])\s+/)
    .filter((s) => s.trim() && !SPECULATIVE_TEXT_RE.test(s))
    .join(' ')
    .trim();
}

function sanitizeAnalysisField(value) {
  if (typeof value === 'string') return stripSpeculativeSentences(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? stripSpeculativeSentences(item) : item))
      .filter((item) => (typeof item === 'string' ? item.length > 0 : true));
  }
  return value;
}

function sanitizePlayerSummary(summary = {}) {
  if (!summary || typeof summary !== 'object') return summary;
  return {
    ...summary,
    noticeableScene: sanitizeAnalysisField(summary.noticeableScene || ''),
    strength: sanitizeAnalysisField(summary.strength || ''),
    weakness: sanitizeAnalysisField(summary.weakness || ''),
    trainingPoint: sanitizeAnalysisField(summary.trainingPoint || ''),
    nextTrainingPoint: sanitizeAnalysisField(summary.nextTrainingPoint || ''),
  };
}

function sanitizeCoachClips(clips = []) {
  return clips.map((clip) => ({
    ...clip,
    label: sanitizeAnalysisField(clip.label || ''),
    reason: sanitizeAnalysisField(clip.reason || ''),
    coachComment: sanitizeAnalysisField(clip.coachComment || ''),
  }));
}

// Cloudflare R2 (훈련일지 영상 저장용) 설정
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'training-videos';
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
const R2_ENABLED = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_BASE);
const R2_MAX_UPLOAD_MB = Number(process.env.R2_MAX_UPLOAD_MB) || 300;

const r2Client = R2_ENABLED
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      // R2 와일드카드 인증서(*.r2.cloudflarestorage.com)는 버킷 서브도메인을 커버하지 못하므로
      // 가상호스팅 방식 대신 경로 방식(path-style)을 사용해야 브라우저 직접 업로드 TLS가 통과됨
      forcePathStyle: true,
      // AWS SDK v3 기본 무결성 체크섬(x-amz-checksum-crc32)이 presign에 빈 본문 기준으로 붙어
      // 브라우저가 실제 파일을 올리면 체크섬 불일치로 R2가 거부함 → 필요할 때만 계산하도록 비활성화
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

// ── R2 저장 헬퍼(영구 보관: 작업기록·원본영상·하이라이트 출력) ─────────────
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

async function r2PutFile(key, localPath, contentType = 'application/octet-stream') {
  const stat = fs.statSync(localPath);
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: fs.createReadStream(localPath),
    ContentType: contentType,
    ContentLength: stat.size,
  }));
  return `${R2_PUBLIC_BASE}/${key}`;
}

async function r2PutJson(key, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'application/json',
    ContentLength: body.length,
  }));
}

async function r2GetJson(key) {
  try {
    const resp = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return JSON.parse(await streamToString(resp.Body));
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

async function r2GetToFile(key, localPath) {
  const resp = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(localPath);
    resp.Body.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', resolve);
    resp.Body.pipe(ws);
  });
  return localPath;
}

async function r2Delete(key) {
  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.warn('[R2] 삭제 실패:', key, err.message);
  }
}

async function r2List(prefix) {
  const keys = [];
  let token;
  do {
    const resp = await r2Client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
    }));
    (resp.Contents || []).forEach((o) => keys.push(o.Key));
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

const R2_JOB_PREFIX = 'jobs/';
const R2_SRC_PREFIX = 'analysis-src/';
const R2_OUT_PREFIX = 'analysis-out/';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

const uploadsDir = path.resolve(__dirname, 'uploads');
const highlightsDir = path.resolve(__dirname, 'highlights');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(highlightsDir)) fs.mkdirSync(highlightsDir, { recursive: true });

app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Accept-Ranges', 'bytes');
  },
}));
app.use('/highlights', express.static(highlightsDir, {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Accept-Ranges', 'bytes');
  },
}));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, _file, cb) => cb(null, `video-${Date.now()}.mp4`),
  }),
});

// 훈련일지 영상: 서버 경유 업로드용 (한국 ISP의 R2 직접연결 SNI 차단 우회)
const trainingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `training-${Date.now()}.${sanitizeExt(file.originalname)}`),
  }),
  limits: { fileSize: (Number(process.env.R2_MAX_UPLOAD_MB) || 300) * 1024 * 1024 },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function secToMmss(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function robustParse(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 파싱 실패');
    return JSON.parse(text.substring(start, end + 1));
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, options);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function runYoloDetection(videoPath, player = {}, topK = 15, { minScore = 0.58, conf = 0.18, imgsz = 640 } = {}) {
  console.log('[YOLO] 대상 선수 추적 시작...', player.name || player.jerseyNumber || player.position || '미지정');

  const args = [
    YOLO_SCRIPT,
    videoPath,
    '--top-k', String(topK),
    '--sample-seconds', '0',
    '--min-score', String(minScore),
    '--conf', String(conf),
    '--imgsz', String(imgsz),
    '--max-samples', '900',
    '--max-persons', '8',
  ];

  if (player.name) args.push('--player-name', player.name);
  if (player.position) args.push('--player-position', player.position);
  if (player.teamName) args.push('--team-name', player.teamName);
  if (player.jerseyNumber) args.push('--jersey-number', String(player.jerseyNumber));
  if (player.uniformColor) args.push('--uniform-color', player.uniformColor);
  const traitsArg = buildPlayerTraits(player);
  if (traitsArg) args.push('--player-traits', traitsArg);

  const { stdout, stderr } = await runProcess(YOLO_PYTHON, args, { cwd: YOLO_CWD });

  let result;
  try {
    result = robustParse(stdout);
  } catch (parseErr) {
    const detail = stderr.trim() || stdout.trim().slice(0, 240);
    throw new Error(detail || parseErr.message || '영상 분석 결과를 읽지 못했습니다.');
  }
  if (!result.success) {
    throw new Error(result.message || '영상 분석에 실패했습니다.');
  }

  console.log(`[YOLO] 후보 ${result.clips?.length || 0}개 추출`);
  return result;
}

function hasManualSeed(seed) {
  if (!seed || typeof seed !== 'object') return false;
  if (Array.isArray(seed.seeds) && seed.seeds.length > 0) return true;
  return Number.isFinite(Number(seed.nx)) && Number(seed.nx) >= 0
    && Number.isFinite(Number(seed.ny)) && Number(seed.ny) >= 0;
}

async function runGpuAnalysis(videoUrl, player = {}, clips = [], seed = null) {
  if (!MODAL_ENABLED) return null;

  const windows = (clips || [])
    .filter((c) => Number.isFinite(c.startSec) && Number.isFinite(c.endSec))
    .slice(0, 12)
    .map((c) => ({ startSec: c.startSec, endSec: c.endSec }));

  const payload = {
    videoUrl,
    authToken: MODAL_AUTH_TOKEN,
    player: {
      name: player.name || '',
      position: player.position || '',
      jerseyNumber: String(player.jerseyNumber || ''),
      uniformColor: player.uniformColor || '',
      traits: buildPlayerTraits(player) || '',
    },
    clips: windows,
    sampleFps: MODAL_SAMPLE_FPS,
    sahi: true,
    centerSeed: !hasManualSeed(seed),
    seedSeconds: 5.0,
  };

  // 업로드 영상: 사용자가 직접 지정(탭)한 선수를 시드로 전달 (다중 우선)
  if (seed && Number.isFinite(seed.nx) && seed.nx >= 0) {
    payload.seedTimeSec = Number.isFinite(seed.timeSec) ? seed.timeSec : 0;
    payload.seedNx = seed.nx;
    payload.seedNy = seed.ny;
  }
  if (seed && Array.isArray(seed.seeds) && seed.seeds.length > 0) {
    payload.seedPoints = seed.seeds.map(s => ({ timeSec: s.timeSec, nx: s.nx, ny: s.ny }));
    console.log(`[GPU] 다중 시드 ${payload.seedPoints.length}개 전달`);
  }

  try {
    console.log('[GPU] Modal 고급 분석 요청...', videoUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25 * 60 * 1000);
    const resp = await fetch(MODAL_ANALYZE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.warn(`[GPU] Modal 응답 오류 ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (!data.success) {
      console.warn('[GPU] Modal 분석 실패:', data.error);
      return null;
    }
    console.log(`[GPU] 완료 (${data.elapsedSec || '?'}초) 이동거리=${data.tracking?.metrics?.distanceM ?? '-'}m`);
    return data;
  } catch (err) {
    console.warn('[GPU] Modal 호출 예외(건너뜀):', err.message);
    return null;
  }
}

async function runGpuCandidates(videoUrl, player = {}, seed = null) {
  if (!MODAL_ENABLED) return null;

  const payload = {
    videoUrl,
    authToken: MODAL_AUTH_TOKEN,
    player: {
      name: player.name || '',
      position: player.position || '',
      jerseyNumber: String(player.jerseyNumber || ''),
      uniformColor: player.uniformColor || '',
      traits: buildPlayerTraits(player) || '',
    },
    clips: [],
    sahi: false,
    detectCandidates: true,
    candidateFps: Number(process.env.MODAL_CANDIDATE_FPS) || 2,
    centerSeed: !hasManualSeed(seed),
  };

  // 수동 시드: 다중 우선, 단일 폴백
  if (seed && Number.isFinite(seed.nx) && seed.nx >= 0) {
    payload.seedTimeSec = Number.isFinite(seed.timeSec) ? seed.timeSec : 0;
    payload.seedNx = seed.nx;
    payload.seedNy = seed.ny;
    console.log(`[GPU] 단일 시드: t=${payload.seedTimeSec}s (${seed.nx.toFixed(3)}, ${seed.ny.toFixed(3)})`);
  }
  if (seed && Array.isArray(seed.seeds) && seed.seeds.length > 0) {
    payload.seedPoints = seed.seeds.map(s => ({ timeSec: s.timeSec, nx: s.nx, ny: s.ny }));
    console.log(`[GPU] 다중 시드 ${payload.seedPoints.length}개 전달`);
  }

  try {
    console.log('[GPU] SAHI 후보 구제 탐지 요청...', videoUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25 * 60 * 1000);
    const resp = await fetch(MODAL_ANALYZE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.warn(`[GPU] 후보 탐지 응답 오류 ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (!data.success) {
      console.warn('[GPU] 후보 탐지 실패:', data.error);
      return null;
    }
    const count = data.candidates?.candidates?.length || 0;
    const tSel = data.tracking?.targetSelectedBy || '-';
    console.log(`[GPU] SAHI 후보 ${count}개 · detector=${data.detector || '?'} · track=${tSel} · ballFrames=${data.candidates?.ballSeenFrames ?? '?'}`);
    return data;
  } catch (err) {
    console.warn('[GPU] 후보 탐지 예외(건너뜀):', err.message);
    return null;
  }
}

function mapGpuCandidatesToClips(candidates = []) {
  return (candidates || []).map((c, index) => {
    const startSec = Number(c.startSec) || 0;
    const endSec = Number(c.endSec) || startSec + 3;
    const interactionFrames = Number(c.interactionFrames) || 0;
    const ballConf = Number(c.avgBallConfidence) || 0;
    const goalMomentScore = Number(c.goalMomentScore) || 0;
    const isGoalArea = Boolean(c.isGoalAreaMoment) || goalMomentScore >= 0.35;
    const baseScore = 0.55 + interactionFrames * 0.05;
    const score = Math.min(0.98, baseScore + goalMomentScore * 0.25);
    return {
      id: c.id || `gpu-${index}`,
      startSec,
      endSec,
      startTime: c.startTime || secToMmss(startSec),
      endTime: c.endTime || secToMmss(endSec),
      label: c.label || (isGoalArea ? '골대 앞 결정적 순간' : '공 관여 추정 장면'),
      reason: c.reason || (isGoalArea
        ? '골대·페널티박스 구역에서 공과 선수의 결정적 상호작용'
        : 'GPU 정밀 분석(SAHI)으로 공과 선수의 근접이 감지된 구간'),
      score,
      framesMatched: Number(c.ballFrames) || 0,
      interactionFrames,
      ballDetectionsCount: Number(c.ballFrames) || 0,
      avgBallConfidence: ballConf,
      maxBallConfidence: ballConf,
      durationSec: Number(c.durationSec) || Math.max(0, endSec - startSec),
      targetPlayerFrames: interactionFrames,
      targetPlayerInteractionFrames: interactionFrames,
      targetPlayerMatchAvg: Number(c.targetMatchAvg) || 0,
      location: c.location || 'unknown',
      goalMomentScore,
      isGoalAreaMoment: isGoalArea,
      goalMomentType: c.goalMomentType || null,
      source: 'gpu-sahi',
    };
  });
}

function buildGpuPromptSection(gpu) {
  if (!gpu) return '';
  const m = gpu.tracking?.available ? gpu.tracking.metrics : null;
  const ball = gpu.ball?.available ? gpu.ball.windows : null;
  const lines = ['\n[GPU 정밀 분석 데이터 — 실제 측정 수치이므로 코칭에 적극 활용]'];
  if (gpu.tracking?.targetSelectedBy === 'center_seed') {
    lines.push('- 대상 선수: 촬영 시작 시 화면 중앙에 둔 선수를 지목해 끝까지 추적함(등번호 무관). 이 선수 기준으로 분석.');
  } else if (gpu.tracking?.targetSelectedBy === 'manual_seed') {
    lines.push('- 대상 선수: 사용자가 영상 프레임에서 직접 지정(탭)한 선수를 끝까지 추적함(등번호·근접촬영 무관). 이 선수 기준으로 분석.');
  }
  if (m) {
    lines.push(
      `- 대상 선수 추정 이동거리: ${m.distanceM}m, 평균속도 ${m.avgSpeedMS}m/s, 최고속도 ${m.topSpeedMS}m/s, 스프린트 ${m.sprintCount}회, 활동지수 ${m.activityIndex}/100`,
      '  (단안 추정치라 절대값보다는 활동량/성향 해석에 활용)',
    );
  } else {
    lines.push('- 선수 이동 추적: 이번 영상에서는 안정적으로 측정되지 않음');
  }
  if (ball && ball.length) {
    const avgRate = ball.reduce((s, w) => s + (w.ballDetectionRate || 0), 0) / ball.length;
    lines.push(`- 공 정밀탐지(SAHI): 후보 구간 평균 공 검출률 ${(avgRate * 100).toFixed(0)}%`);
  }
  const goalCands = (gpu.candidates?.candidates || []).filter((c) => c.isGoalAreaMoment || (c.goalMomentScore || 0) >= 0.35);
  if (goalCands.length) {
    lines.push(`- ★ 골대·페널티박스 결정적 후보 ${goalCands.length}개 감지 — 슛/선방/수비·득점 빌드업 구간 우선 분석`);
  } else {
    lines.push('- 골대·페널티박스: 후보 JSON의 isGoalAreaMoment·location 필드를 확인해 골 관련 순간을 우선 선정');
  }
  return lines.join('\n');
}

async function generateContentWithFallback(genAI, prompt) {
  return generateMultimodalWithFallback(genAI, [{ text: wrapAnalysisPrompt(prompt) }]);
}

async function generateMultimodalWithFallback(genAI, parts) {
  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      console.log(`[Gemini] 모델 시도: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const wrappedParts = parts.map((part) => {
        if (part.text && ANALYSIS_ZERO_SPECULATION && !part.text.includes('[10x.ai.kr 분석 절대 규칙')) {
          return { text: wrapAnalysisPrompt(part.text) };
        }
        return part;
      });
      const result = await model.generateContent(wrappedParts);
      return result.response.text();
    } catch (err) {
      console.warn(`[Gemini] ${modelName} 실패: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(`AI 분석 호출 실패: ${lastError?.message || 'unknown error'}`);
}

function isGoalkeeperPosition(position = '') {
  const value = String(position).trim().toLowerCase();
  return ['gk', '골키퍼', '키퍼', 'goalkeeper'].includes(value);
}

function buildNoClipsError(summary = {}, player = {}) {
  const sampled = Number(summary.sampledFrames) || 0;
  const ball = Number(summary.ballDetectedFrames) || 0;
  const target = Number(summary.targetInteractionFrames) || 0;
  const candidates = Number(summary.candidateClipsBeforeFilter) || 0;
  const playerLabel = player.name ? `${player.name}(${player.position || '포지션 미지정'})` : '등록한 선수';

  if (ball === 0) {
    return `영상에서 공을 거의 찾지 못했습니다(샘플 ${sampled}프레임). 카메라 각도를 낮추거나 경기장 전체가 보이게 촬영해 주세요.`;
  }

  const ballRatio = sampled > 0 ? ball / sampled : 0;
  if (ballRatio >= 0.12 && target === 0) {
    return `공은 ${ball}회 탐지됐지만, ${playerLabel}를 영상에서 특정하지 못했습니다(너무 멀리·작게 찍히면 어렵습니다). 다음을 확인해 주세요: ① 녹화 시작 5초간 분석할 선수를 화면 중앙에 크게(전신이 잘 보이게) 둔 뒤 천천히 줌아웃, ② '오늘 경기 유니폼 색상' 입력, ③ 등록 포지션이 실제와 일치하는지 확인.`;
  }

  if (candidates > 0) {
    return `후보 장면 ${candidates}개가 있었지만, 품질 기준을 통과한 하이라이트 클립이 없었습니다. ${playerLabel}가 공을 직접 다루는 장면이 더 담긴 영상으로 시도해 주세요.`;
  }

  if (ball > 0) {
    return `공은 ${ball}회 탐지됐지만 하이라이트로 묶을 만한 장면을 찾지 못했습니다. ${playerLabel} 중심으로 더 가까이 촬영해 주세요.`;
  }

  return '영상에서 분석 가능한 장면을 찾지 못했습니다.';
}

function prefilterYoloClipsForCoach(clips, player = {}) {
  const hasTarget = Boolean(player.name || player.jerseyNumber || player.position || player.uniformColor || player.traits);
  const isGk = isGoalkeeperPosition(player.position);

  const strict = (clips || []).filter((clip) => {
    const ballConf = Number(clip.avgBallConfidence) || 0;
    const interactionFrames = Number(clip.interactionFrames) || 0;
    const targetInteractionFrames = Number(clip.targetPlayerInteractionFrames) || 0;
    const targetFrames = Number(clip.targetPlayerFrames) || 0;
    const matchAvg = Number(clip.targetPlayerMatchAvg) || 0;
    const duration = Math.max(0, (Number(clip.endSec) || 0) - (Number(clip.startSec) || 0));

    if (ballConf < 0.36) return false;
    if (interactionFrames < 1) return false;
    if (duration < 2.0 || duration > 16) return false;

    if (!hasTarget) return true;

    if (targetInteractionFrames >= 1) return true;
    if (targetFrames >= 2 && matchAvg >= 0.30 && ballConf >= 0.40) return true;
    if (isGk && interactionFrames >= 2 && matchAvg >= 0.28 && ballConf >= 0.38) return true;

    return false;
  });

  if (strict.length) return strict;

  return (clips || [])
    .filter((clip) => Number(clip.avgBallConfidence) >= 0.24 && Number(clip.interactionFrames) >= 1)
    .sort((a, b) => {
      const scoreA = (Number(a.targetPlayerInteractionFrames) || 0) * 10 + (Number(a.score) || 0);
      const scoreB = (Number(b.targetPlayerInteractionFrames) || 0) * 10 + (Number(b.score) || 0);
      return scoreB - scoreA;
    })
    .slice(0, 12);
}

/**
 * 분석 데이터 품질 평가 — 불확실할 때 엉터리 분석 방지
 * @returns { insufficient: bool, reason: string, guide: string }
 */
function assessDataQuality(candidates, gpuAnalysis) {
  const totalClips = candidates.length;
  const avgBallConf = totalClips > 0
    ? candidates.reduce((s, c) => s + (Number(c.avgBallConfidence) || 0), 0) / totalClips
    : 0;
  const avgInteraction = totalClips > 0
    ? candidates.reduce((s, c) => s + (Number(c.interactionFrames) || 0), 0) / totalClips
    : 0;
  const avgTargetMatch = totalClips > 0
    ? candidates.reduce((s, c) => s + (Number(c.targetPlayerMatchAvg) || 0), 0) / totalClips
    : 0;
  const trackingAvail = gpuAnalysis?.tracking?.available === true;
  const trackingShort = gpuAnalysis?.tracking?.available === false &&
    (gpuAnalysis?.tracking?.reason === 'target_track_too_short'
      || gpuAnalysis?.tracking?.reason === 'manual_seed_miss');

  if (gpuAnalysis?.tracking?.reason === 'manual_seed_miss') {
    return {
      insufficient: true,
      reason: '탭한 위치와 영상 속 선수가 연결되지 않았어요. 10개 장면에서 선수 몸통을 더 정확히 탭해 주세요.',
      guide: '📹 각 장면 썸네일에서 분석할 선수의 가슴·등번호 쪽을 탭하세요. 옆 선수나 심판을 탭하면 다른 사람을 추적합니다.',
      partialStrength: null,
    };
  }

  // 공 탐지 데이터가 너무 적음
  if (avgBallConf < 0.20 && totalClips < 3) {
    return {
      insufficient: true,
      reason: `공이 거의 탐지되지 않았어요 (공 인식률 ${Math.round(avgBallConf * 100)}%, 후보 장면 ${totalClips}개).`,
      guide: '📹 촬영 가이드: 선수와 공이 함께 화면에 나오도록 조금 더 멀리서 촬영해주세요. 공이 작게라도 보여야 분석이 가능해요.',
      partialStrength: null,
    };
  }

  // 선수 추적 데이터가 너무 불안정
  if (trackingShort || (totalClips > 0 && avgTargetMatch < 0.15 && !trackingAvail)) {
    return {
      insufficient: true,
      reason: `선수를 안정적으로 추적하지 못했어요 (선수 매칭률 ${Math.round(avgTargetMatch * 100)}%).`,
      guide: '📹 촬영 가이드: 분석할 선수를 처음 3초간 화면 가운데에 크게 잡아주세요. 또는 영상 분석 페이지에서 "장면 불러오기"로 선수를 직접 탭해서 지정해주세요.',
      partialStrength: null,
    };
  }

  // 공 관여 장면이 너무 적음
  if (avgInteraction < 1.0 && avgBallConf < 0.30) {
    return {
      insufficient: true,
      reason: `선수와 공의 상호작용 장면이 충분하지 않아요 (평균 관여 프레임 ${avgInteraction.toFixed(1)}개).`,
      guide: '📹 촬영 가이드: 선수가 공을 직접 다루는 장면(패스, 슈팅, 드리블)이 많이 담긴 영상을 사용해주세요. 영상이 너무 짧거나 선수가 후방에만 있으면 분석이 어려워요.',
      partialStrength: null,
    };
  }

  return { insufficient: false, reason: null, guide: null };
}

function buildCoachPrompt(yoloResult, player = {}, gpu = null) {
  const position = player.position || '미지정';
  const playerName = player.name || '분석 대상 선수';
  const jerseyNumber = player.jerseyNumber || '-';
  const teamName = player.teamName || '-';
  const uniformColor = player.uniformColor || '-';
  const traits = player.traits || '-';
  const targetPlayer = yoloResult.targetPlayer || null;

  const LOCATION_KR = {
    penalty_box: '페널티 박스 안',
    center_circle: '센터서클 근처',
    unknown: null,
  };

  const candidates = (yoloResult.clips || []).slice(0, 20).map((clip, index) => ({
    rank: index + 1,
    id: clip.id,
    startSec: clip.startSec,
    endSec: clip.endSec,
    startTime: clip.startTime,
    endTime: clip.endTime,
    label: clip.label,
    yoloScore: clip.score,
    reason: clip.reason,
    framesMatched: clip.framesMatched,
    interactionFrames: clip.interactionFrames,
    targetPlayerFrames: clip.targetPlayerFrames,
    targetPlayerInteractionFrames: clip.targetPlayerInteractionFrames,
    targetPlayerMatchAvg: clip.targetPlayerMatchAvg,
    avgBallConfidence: clip.avgBallConfidence,
    ballDetectionsCount: clip.ballDetectionsCount,
    location: LOCATION_KR[clip.location] || null,
    goalMomentScore: clip.goalMomentScore ?? null,
    isGoalAreaMoment: clip.isGoalAreaMoment ?? false,
    goalMomentType: clip.goalMomentType || null,
  }));

  const hasGoalAreaCandidates = candidates.some((c) => c.isGoalAreaMoment || (c.goalMomentScore != null && c.goalMomentScore >= 0.35) || c.location === '페널티 박스 안');
  const isGk = isGoalkeeperPosition(position);
  const isDef = ['df', 'cb', 'lb', 'rb', 'defender', '수비', '수비수', '풀백', '센터백'].some((k) => String(position).toLowerCase().includes(k));

  return `당신은 유소년부터 프로까지 선수를 육성해 온 축구 코치이자 감독입니다.
20년 이상 현장에서 선수의 움직임, 판단, 태도, 팀 플레이를 직접 지도해 왔습니다.

★ 축구의 본질: 공을 골대에 넣는 스포츠 ★
분석과 하이라이트에서 **공(ball)과 골대(goal) 상황**을 최우선으로 다루세요.
- 득점·득점 시도·실점·선방·골대 밖으로 벗어난 슛 — 경기에서 가장 중요한 순간입니다.
- 골이 들어가기 **직전** 어떤 패스·침투·크로스·수비가 있었는지, ${playerName}의 역할을 반드시 짚으세요.
- 골이 들어갔든 막혔든·빗나갔든, **골대 앞에서 무슨 일이 있었는지**가 코칭의 핵심입니다.

분석 대상 선수 (반드시 이 선수 중심으로만 분석):
- 이름: ${playerName}
- 포지션: ${position}
- 팀: ${teamName}
- 등번호: ${jerseyNumber}
- 유니폼 색상: ${uniformColor}
- 선수 특징: ${traits}

AI 영상 분석 시스템이 위 선수만 추적하여 공·움직임을 분석한 후보 장면 데이터입니다.

[영상 메타]
- 파일: ${yoloResult.fileName}
- 길이: ${yoloResult.summary?.durationSec || '?'}초

[후보 장면 JSON]
${JSON.stringify(candidates, null, 2)}
${buildGpuPromptSection(gpu)}

[임무 — 1차 코치 선정]
1. 후보 중 "${playerName}" 선수(${jerseyNumber}번, ${position})의 **실제 경기 하이라이트**만 3~6개 선정하세요.
2. 아래 조건을 **모두** 만족하는 장면만 approved=true 로 포함하세요.
3. approved=false 인 장면은 clips 배열에 넣지 마세요.
4. 전체 영상 종합 코칭 리포트(summary)를 작성하세요.

[반드시 제외할 장면 — approved=false]
- 등록 선수가 가만히 서 있거나 걸어가기만 하는 장면
- 공과 선수가 **직접** 관련 없는 장면 (골대 앞 대기, 셋피스 대기, 워밍업)
- 다른 선수의 플레이 장면
- 공 탐지는 됐지만 선수-공 상호작용(targetPlayerInteractionFrames)이 0~1인 약한 장면
- 경기 중단, 교체, 관중/벤치만 보이는 장면

[포함 기준 — approved=true]
- targetPlayerInteractionFrames >= 2 이거나, GK/등록 선수의 세이브·펀칭·킥·캐치·분배 등 **공을 직접 다루는** 동작
- **골대·페널티박스 순간 (isGoalAreaMoment=true 또는 location=페널티 박스 안)**: 슛·득점 시도·어시스트·키패스·수비 블록·클리어·선방·실점 상황 — 선수가 관여했다면 **importanceScore 85 이상**으로 우선 포함
- coachComment에 **구체적 동작** + **공의 흐름(누가 패스했는지/어디로 공이 갔는지)** + **골대와의 관계**를 반드시 명시
- importanceScore >= 75 (골대 앞 순간은 >= 85 권장)
- location 필드가 있으면 반드시 활용 (예: "페널티 박스 안에서 슈팅 시도", "골대 앞 선방 후 빌드업")
${hasGoalAreaCandidates ? `
[★ 필수 — 골대 앞 순간]
후보 JSON에 isGoalAreaMoment=true 또는 location=페널티 박스 안 인 장면이 있습니다.
${playerName} 선수가 해당 순간에 **조금이라도 관여**했다면 clips에 **최소 1개** 반드시 포함하세요.
${isGk ? '골키퍼: 선방·캐치·펀칭·1대1·실점 상황에서 위치·반응·분배를 분석.' : isDef ? '수비수: 블록·클리어·커버·1대1·실점/실점방지 과정, 공을 골대 밖으로 보낸 수비 선택을 분석.' : '공격수/미드: 득점·어시·키패스·슈팅·골대를 향한 침투·빌드업 연결을 분석.'}
` : ''}

[summary 작성 시]
- noticeableScene: 골대 앞에서의 주요 순간(득점·실점·선방·수비·슈팅)을 반드시 언급
- strength/weakness/trainingPoint: 골대 상황에서의 판단·기술·위치선정 중심

[규칙]
- 반드시 한국어
- 순수 JSON만 출력 (마크도운, 코드블록, 설명 금지)
- startSec/endSec는 후보 값 유지 또는 ±1초 이내 미세 조정
- id는 후보 id 그대로 사용
- **확신이 없으면 해당 clip은 제외** — 추측·짐작으로 coachComment 작성 금지
- coachComment·summary는 **탐지 JSON에서 확인된 동작만** 서술. "~인 듯", "아마" 금지
- strength/weakness는 clips 장면 근거만. 근거 없으면 "확인 불가"

[출력 형식]
{
  "clips": [
    {
      "id": "clip-000120",
      "startSec": 12.0,
      "endSec": 18.5,
      "startTime": "00:12",
      "endTime": "00:18",
      "label": "장면 제목",
      "reason": "선정 이유",
      "coachComment": "코치/감독의 세밀한 분석",
      "importanceScore": 92,
      "approved": true,
      "ballInvolvement": "direct",
      "yoloScore": 0.85
    }
  ],
  "summary": {
    "noticeableScene": "...",
    "strength": "...",
    "weakness": "...",
    "trainingPoint": "...",
    "nextTrainingPoint": "..."
  }
}`;
}

function buildPlayerClipFactPrompt(clip, player = {}) {
  const playerName = player.name || '분석 대상 선수';
  const jerseyNumber = player.jerseyNumber || '-';
  const uniformColor = player.uniformColor || '-';
  const position = player.position || '미지정';
  const startSec = Number(clip.startSec) || 0;
  const endSec = Number(clip.endSec) || startSec + 3;

  return `축구 영상 **관찰 기록**만 작성. 코치 해설·추측·짐작·전망 금지.

[대상 선수 — 이 선수만 기록]
- 이름: ${playerName} / 등번호: ${jerseyNumber} / 유니폼: ${uniformColor} / 포지션: ${position}

[구간] ${clip.startTime || secToMmss(startSec)} ~ ${clip.endTime || secToMmss(endSec)}

첨부 프레임 3장에서 **보이는 사실만** JSON:
{
  "id": "${clip.id}",
  "playerSeen": true | false | "unclear",
  "isTargetPlayer": true | false | "unclear",
  "actionType": "패스|슛|드리블|선방|블록|빌드업|확인 불가",
  "ballInvolvement": "direct|indirect|none|unclear",
  "visibleFacts": ["프레임에서 확인된 사실"],
  "cannotDetermine": "알 수 없는 것"
}`;
}

function buildCoachPromptFromFacts(yoloResult, player = {}, gpu = null, clipFacts = []) {
  const playerName = player.name || '분석 대상 선수';
  const position = player.position || '미지정';
  const jerseyNumber = player.jerseyNumber || '-';
  const uniformColor = player.uniformColor || '-';

  const verifiedFacts = (clipFacts || []).filter(
    (f) => f.playerSeen === true && f.isTargetPlayer !== false && (f.visibleFacts?.length || f.actionType),
  );

  return `선수 분석 리포트 작성. **장면 관찰 기록만** 근거로 사용. 추측·짐작·전망 절대 금지.

[대상 선수] ${playerName} (${jerseyNumber}번, ${position}, ${uniformColor})

[영상 장면별 관찰 기록 — 이 JSON만 근거]
${JSON.stringify(verifiedFacts, null, 2)}
${buildGpuPromptSection(gpu)}

★ 규칙 ★
- clips: isTargetPlayer=true이고 visibleFacts 있는 장면만. coachComment는 visibleFacts만 반복·정리 (새로운 사실 추가 금지)
- 관찰에 없는 장면은 clips에 넣지 않음
- summary.strength/weakness/trainingPoint: **2개 이상 장면에서 반복 확인된 것만**. 없으면 "확인 불가"
- noticeableScene: 관찰된 장면 요약만

순수 JSON:
{
  "clips": [{"id":"","startSec":0,"endSec":0,"label":"","reason":"","coachComment":"","importanceScore":80,"approved":true,"ballInvolvement":"direct","yoloScore":0.8}],
  "summary": {"noticeableScene":"","strength":"","weakness":"","trainingPoint":"","nextTrainingPoint":""}
}`;
}

async function describePlayerClipFacts(genAI, videoPath, clips, player = {}) {
  if (!clips.length) return [];
  const facts = [];
  const batchSize = 2;
  const framesPerClip = QC_FRAMES_STRICT;

  for (let i = 0; i < clips.length; i += batchSize) {
    const batch = clips.slice(i, i + batchSize);
    const parts = [{ text: '각 장면 프레임 관찰 → JSON {"facts":[...]} 만. 추측 금지.' }];

    for (const clip of batch) {
      const startSec = Number(clip.startSec) || 0;
      const endSec = Number(clip.endSec) || startSec + 3;
      const span = Math.max(0.5, endSec - startSec);
      parts.push({ text: buildPlayerClipFactPrompt(clip, player) });
      const offsets = [0.3, span * 0.5, Math.max(span - 0.3, span * 0.85)];
      for (const off of offsets.slice(0, framesPerClip)) {
        try {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: await extractClipFrameBase64(videoPath, startSec + off),
            },
          });
        } catch (err) {
          console.warn(`[player-fact] 프레임 실패 ${clip.id}:`, err.message);
        }
      }
    }

    try {
      const text = await generateMultimodalWithFallback(genAI, parts);
      const parsed = robustParse(text);
      const batchFacts = parsed.facts || (Array.isArray(parsed) ? parsed : [parsed]);
      facts.push(...batchFacts.filter((f) => f && f.id));
    } catch (err) {
      console.warn('[player-fact] 장면 관찰 실패:', err.message);
    }
  }

  return facts;
}

function buildMatchClipFactPrompt(clip, meta = {}) {
  const clubName = meta.clubName || '우리 팀';
  const ourColor = meta.ourTeamColor || '미입력';
  const opponent = meta.opponent || '상대 팀';
  const startSec = Number(clip.startSec) || 0;
  const endSec = Number(clip.endSec) || startSec + 3;

  return `당신은 축구 영상 **관찰 기록자**입니다. 코치·해설가처럼 말하지 마세요.

★ 절대 금지 ★
- "~할 확률", "~일 것", "가능성", "아마", "추정", "우위/열세", 득점·스코어 예측
- 프레임에 없는 전술·감정·결과 평가
- 공격/수빈을 단정할 수 없으면 반드시 "확인 불가"

★ 반드시 할 일 ★
- 첨부 프레임 **3장**만 보고 사실만 기록
- ${clubName} 유니폼 색: **${ourColor}** — 프레임에서 이 색 유니폼이 보이는지, 어느 쪽(왼쪽/오른쪽/화면 아래)인지
- 상대(${opponent})는 ${ourColor}가 아닌 유니폼
- 공 위치, 패스/슛/빌드업/세트피스 등 **눈에 보이는 동작**만
- 수비 3rd / 중원 / 공격 3rd — **확실할 때만** (골대·페널티박스 위치로 판단)

[구간] ${clip.startTime || secToMmss(startSec)} ~ ${clip.endTime || secToMmss(endSec)}

순수 JSON만:
{
  "id": "${clip.id}",
  "ourTeamColorSeen": true | false | "unclear",
  "ourTeamSide": "화면 왼쪽|화면 오른쪽|중앙|확인 불가",
  "ourTeamZone": "수비 진영|중원|공격 진영|확인 불가",
  "ballAction": "패스|슛|빌드업|세트피스|공중볼|확인 불가",
  "phase": "공격|수비|전환|확인 불가",
  "visibleFacts": ["프레임에서 보이는 사실만"],
  "cannotDetermine": "이 구간만으로 알 수 없는 것"
}`;
}

function buildMatchSynthesisPrompt(yoloResult, meta = {}, clipFacts = []) {
  const clubName = meta.clubName || '우리 팀';
  const opponent = meta.opponent || '상대 팀';
  const grade = meta.grade || '미지정';
  const matchDate = meta.matchDate || '';
  const matchResult = meta.matchResult || '';
  const ourTeamColor = meta.ourTeamColor || '';
  const durationSec = yoloResult.summary?.durationSec || meta.videoDurationSec || null;
  const videoMin = durationSec ? Math.round(durationSec / 60) : null;
  const matchTotalMin = Number(meta.matchTotalMinutes) || 40;
  const coverage = meta.videoCoverage || 'segment';
  const sections = deriveMatchReportSectionsServer(meta);
  const coverageLabel = buildCoverageLabelServer(meta);

  const coverageRules = sections.isPartial
    ? `[★ 영상 범위 — 일부 구간 ★]
- 분석 범위: ${coverageLabel}
- 경기 총 ${matchTotalMin}분 중 **이 영상(${videoMin ?? '?'}분)만** 분석. 전반·후반·경기 전체로 확대 금지.
- firstHalf, secondHalf: **반드시 빈 문자열 ""**
- teamStrengths, teamWeaknesses: **반드시 빈 배열 []** (짧은 구간으로 팀 전체 평가 불가)
- tacticalNotes: 이 구간 관찰만 1~2문장. 없으면 ""
- segmentSummary: **필수** — 이 영상 구간에서 확인된 것만 2~4문장
- matchSummary: segmentSummary와 같은 범위만 한 줄 요약
- coachingRecommendations: 관찰된 장면 근거 0~2개만. 없으면 []`
    : `[★ 영상 범위 — 경기 전체 ★]
- 분석 범위: ${coverageLabel} (유소년 ${matchTotalMin}분 경기)
- firstHalf/secondHalf: 관찰 기록 시간대로 전·후반 요약 (없으면 "해당 구간 관찰 데이터 없음")
- segmentSummary: "" (빈 문자열)
- teamStrengths/teamWeaknesses: 관찰에서 **반복 확인된 것만**. 없으면 []`;

  return `당신은 유소년 축구 경기 **관찰 리포트 작성자**입니다. 코치 해설·전망·추측 금지.

${coverageRules}

[경기 정보 — 사용자 입력 (사실로 취급)]
- 우리팀: ${clubName}
- 우리팀 유니폼: ${ourTeamColor || '미입력'} ← 모든 "우리팀" 판단에 이 색 사용
- 상대: ${opponent}
- 학년: ${grade}
- 경기일: ${matchDate || '미입력'}
- **입력 스코어/결과: ${matchResult || '미입력'}** ← 스코어는 여기만 인용. **영상에 없는 전반/후반 득점 흐름을 지어내지 마세요.**

[업로드 영상 길이] ${videoMin != null ? `${videoMin}분 (${Math.round(durationSec)}초)` : '미상'}

[장면별 관찰 기록 — 아래 JSON만 근거로 리포트 작성]
${JSON.stringify(clipFacts, null, 2)}

★ 절대 금지 ★
- "확률", "~할 것", "가능성", "아마", "먼저 골", "이길/질", "우위/열세" 등 **모든 추측·예측**
- **영상에 없는 전반/후반·팀 전체 강약점** 서술 (${sections.isPartial ? '현재: 일부 구간 영상' : '현재: 전체 영상'})
- 관찰 기록에 없는 전술·득점·선수 이름
- 빌드업·패스 장면을 "위협적 공격"으로 과장

★ 작성 규칙 ★
1. scoreFlow: 입력 스코어 인용 + "이 영상 구간에서 득점 장면: 확인됨/미확인"만
2. keyMoments: 관찰 기록 각 1개. description은 visibleFacts만
3. playerStandouts: 등번호 확실할 때만. 없으면 []
4. nextMatchFocus: 관찰 보완점 1개, 없으면 ""

순수 JSON만:
{
  "matchSummary": "",
  "segmentSummary": "",
  "scoreFlow": "",
  "firstHalf": "",
  "secondHalf": "",
  "teamStrengths": [],
  "teamWeaknesses": [],
  "keyMoments": [{"id":"","startSec":0,"endSec":0,"label":"","description":"","impact":"low|medium|high"}],
  "tacticalNotes": "",
  "playerStandouts": [],
  "coachingRecommendations": [],
  "nextMatchFocus": ""
}`;
}

function buildCoverageLabelServer(meta = {}) {
  const videoMin = meta.videoDurationSec != null ? Math.round(meta.videoDurationSec / 60) : null;
  const labels = { full: '경기 전체', first_half: '전반', second_half: '후반', segment: '일부 구간' };
  if (meta.segmentNote?.trim()) {
    return `${meta.segmentNote.trim()}${videoMin != null ? ` · 영상 ${videoMin}분` : ''}`;
  }
  if (meta.segmentStartMin != null && meta.segmentEndMin != null) {
    const half = meta.videoCoverage === 'first_half' ? '전반 ' : meta.videoCoverage === 'second_half' ? '후반 ' : '';
    return `${half}${meta.segmentStartMin}~${meta.segmentEndMin}분${videoMin != null ? ` · 영상 ${videoMin}분` : ''}`;
  }
  const base = labels[meta.videoCoverage] || '일부 구간';
  return `${base}${videoMin != null ? ` · 영상 ${videoMin}분` : ''}`;
}

function deriveMatchReportSectionsServer(meta = {}) {
  const coverage = meta.videoCoverage || 'segment';
  const videoMin = meta.videoDurationSec != null ? meta.videoDurationSec / 60 : 0;
  const matchTotal = Number(meta.matchTotalMinutes) || 40;
  const fullThreshold = matchTotal * 0.72;
  const isFullVideo = coverage === 'full' && videoMin >= fullThreshold;
  const isPartial = !isFullVideo;

  return {
    isPartial,
    isFullVideo,
    coverageLabel: buildCoverageLabelServer(meta),
    showFirstHalf: isFullVideo,
    showSecondHalf: isFullVideo,
    showSegmentSummary: isPartial,
    showTeamStrengths: isFullVideo,
    showTeamWeaknesses: isFullVideo,
    showTacticalNotes: isFullVideo,
    showCoaching: true,
  };
}

function applyCoverageToReport(parsed, sections) {
  const out = { ...parsed };
  if (!sections.showFirstHalf) out.firstHalf = '';
  if (!sections.showSecondHalf) out.secondHalf = '';
  if (!sections.showTeamStrengths) out.teamStrengths = [];
  if (!sections.showTeamWeaknesses) out.teamWeaknesses = [];
  if (!sections.showTacticalNotes) out.tacticalNotes = '';
  if (!sections.showSegmentSummary) out.segmentSummary = '';
  return out;
}

const sanitizeMatchReportField = sanitizeAnalysisField;

function sanitizeMatchReport(parsed, meta = {}, sections = null) {
  const scoreFlow = meta.matchResult
    ? `입력 경기 결과: ${meta.matchResult}. (이 영상 구간에서 득점 장면 ${parsed.keyMoments?.length ? '일부 확인' : '미확인'})`
    : stripSpeculativeSentences(parsed.scoreFlow || '') || '스코어: 영상만으로 확인 불가';

  const base = {
    matchSummary: sanitizeMatchReportField(parsed.matchSummary || ''),
    segmentSummary: sanitizeMatchReportField(parsed.segmentSummary || ''),
    scoreFlow,
    firstHalf: sanitizeMatchReportField(parsed.firstHalf || ''),
    secondHalf: sanitizeMatchReportField(parsed.secondHalf || ''),
    teamStrengths: sanitizeMatchReportField(Array.isArray(parsed.teamStrengths) ? parsed.teamStrengths : []),
    teamWeaknesses: sanitizeMatchReportField(Array.isArray(parsed.teamWeaknesses) ? parsed.teamWeaknesses : []),
    tacticalNotes: sanitizeMatchReportField(parsed.tacticalNotes || ''),
    coachingRecommendations: sanitizeMatchReportField(Array.isArray(parsed.coachingRecommendations) ? parsed.coachingRecommendations : []),
    nextMatchFocus: sanitizeMatchReportField(parsed.nextMatchFocus || ''),
    playerStandouts: Array.isArray(parsed.playerStandouts) ? parsed.playerStandouts : [],
    keyMoments: Array.isArray(parsed.keyMoments) ? parsed.keyMoments.map((km) => ({
      ...km,
      label: sanitizeMatchReportField(km.label || ''),
      description: sanitizeMatchReportField(km.description || ''),
    })) : [],
  };

  return sections ? applyCoverageToReport(base, sections) : base;
}

async function describeMatchClipFacts(genAI, videoPath, clips, meta = {}) {
  if (!clips.length) return [];
  const facts = [];
  const batchSize = 3;
  const framesPerClip = 3;

  for (let i = 0; i < clips.length; i += batchSize) {
    const batch = clips.slice(i, i + batchSize);
    const parts = [{ text: '아래 각 장면의 프레임을 보고 JSON 배열로 fact 기록만 출력하세요. 추측 금지.\n{"facts":[...]}' }];

    for (const clip of batch) {
      const startSec = Number(clip.startSec) || 0;
      const endSec = Number(clip.endSec) || startSec + 3;
      const span = Math.max(0.5, endSec - startSec);
      parts.push({ text: buildMatchClipFactPrompt(clip, meta) });
      const offsets = [0.3, span * 0.5, Math.max(span - 0.3, span * 0.85)];
      for (const off of offsets.slice(0, framesPerClip)) {
        try {
          const sec = startSec + off;
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: await extractClipFrameBase64(videoPath, sec) } });
        } catch (err) {
          console.warn(`[match-fact] 프레임 실패 ${clip.id}:`, err.message);
        }
      }
    }

    try {
      const text = await generateMultimodalWithFallback(genAI, parts);
      const parsed = robustParse(text);
      const batchFacts = parsed.facts || (Array.isArray(parsed) ? parsed : [parsed]);
      facts.push(...batchFacts.filter((f) => f && f.id));
    } catch (err) {
      console.warn('[match-fact] 장면 관찰 실패:', err.message);
    }
  }

  return facts;
}

async function runMatchAnalysisPipeline(savedFilename, meta = {}, { onProgress } = {}) {
  const report = (stage, progress) => {
    if (typeof onProgress === 'function') {
      try { onProgress(stage, progress); } catch { /* noop */ }
    }
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

  const fullPath = path.join(uploadsDir, savedFilename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`영상 파일을 찾을 수 없습니다: ${savedFilename}`);
  }

  const videoDurationSec = await ffprobeDuration(fullPath);
  meta = {
    ...meta,
    videoDurationSec,
    videoCoverage: meta.videoCoverage || 'segment',
    matchTotalMinutes: Number(meta.matchTotalMinutes) || 40,
  };
  const reportSections = deriveMatchReportSectionsServer(meta);

  const videoUrl = `${PUBLIC_BASE}/uploads/${savedFilename}`;
  const teamCtx = {
    teamName: meta.clubName || '',
    uniformColor: meta.ourTeamColor || '',
    traits: meta.ourTeamColor ? `유니폼 ${meta.ourTeamColor}` : '',
  };
  let yoloResult = { fileName: savedFilename, clips: [], summary: {} };
  let rawClips = [];
  let detectionSource = 'cpu';

  report('경기 장면 탐지 중 (GPU)', 12);
  if (MODAL_ENABLED) {
    console.log('[match] Modal GPU 후보 탐지...', meta.ourTeamColor ? `유니폼=${meta.ourTeamColor}` : '');
    const gpuCand = await runGpuCandidates(videoUrl, teamCtx, null);
    const gpuClips = mapGpuCandidatesToClips(gpuCand?.candidates?.candidates || []);
    if (gpuClips.length) {
      rawClips = gpuClips
        .filter((clip) => Number(clip.interactionFrames) >= 1 || Number(clip.avgBallConfidence) >= 0.22)
        .sort((a, b) => {
          const scoreA = (Number(a.isGoalAreaMoment) ? 50 : 0) + (Number(a.score) || 0) * 10 + (Number(a.interactionFrames) || 0);
          const scoreB = (Number(b.isGoalAreaMoment) ? 50 : 0) + (Number(b.score) || 0) * 10 + (Number(b.interactionFrames) || 0);
          return scoreB - scoreA;
        })
        .slice(0, 15);
      yoloResult = {
        fileName: savedFilename,
        clips: rawClips,
        summary: {
          durationSec: gpuCand?.candidates?.durationSec ?? videoDurationSec,
          ballDetectedFrames: gpuCand?.candidates?.ballSeenFrames,
          sampledFrames: gpuCand?.candidates?.sampledFrames,
          source: 'modal-gpu',
        },
      };
      detectionSource = 'modal-gpu';
      console.log(`[match] GPU 후보 ${rawClips.length}개 사용`);
    }
  }

  if (!rawClips.length) {
    report('경기 장면 탐지 중 (CPU)', 18);
    yoloResult = await runYoloDetection(fullPath, teamCtx, 20, { minScore: 0.42, conf: 0.14, imgsz: 768 });
    if (!yoloResult.clips?.length) {
      console.warn('[match] 1차 장면 탐지 실패, 완화 조건 재시도');
      yoloResult = await runYoloDetection(fullPath, teamCtx, 24, { minScore: 0.32, conf: 0.12, imgsz: 768 });
    }
    rawClips = (yoloResult.clips || [])
      .filter((clip) => Number(clip.interactionFrames) >= 1 || Number(clip.avgBallConfidence) >= 0.28)
      .sort((a, b) => {
        const scoreA = (Number(a.isGoalAreaMoment) ? 50 : 0) + (Number(a.score) || 0) * 10 + (Number(a.interactionFrames) || 0);
        const scoreB = (Number(b.isGoalAreaMoment) ? 50 : 0) + (Number(b.score) || 0) * 10 + (Number(b.interactionFrames) || 0);
        return scoreB - scoreA;
      })
      .slice(0, 15);
    detectionSource = 'cpu-yolo';
  }

  if (!yoloResult.summary?.durationSec) {
    yoloResult.summary = { ...(yoloResult.summary || {}), durationSec: videoDurationSec };
  }

  if (!rawClips.length) {
    throw new Error(
      '경기에서 분석 가능한 장면을 찾지 못했습니다. 경기장 전체가 보이도록 촬영했는지, 공이 충분히 보이는지 확인해 주세요.',
    );
  }

  report('주요 장면 클립 생성 중', 35);
  const clipsWithVideos = await renderClipVideos(fullPath, rawClips);

  const genAI = new GoogleGenerativeAI(apiKey);
  const factClips = rawClips.slice(0, 10);

  report('장면별 영상 관찰 기록 중', 50);
  const clipFacts = await describeMatchClipFacts(genAI, fullPath, factClips, meta);
  if (!clipFacts.length) {
    console.warn('[match] 장면 관찰 기록 없음 — 클립 메타만 사용');
  }

  report('관찰 기록 기반 리포트 작성 중', 72);
  const synthPrompt = buildMatchSynthesisPrompt(yoloResult, meta, clipFacts.length ? clipFacts : factClips.map((c) => ({
    id: c.id,
    startSec: c.startSec,
    endSec: c.endSec,
    visibleFacts: [c.label || '공 활동 구간 (자동 탐지)'],
    phase: '확인 불가',
    ourTeamZone: '확인 불가',
  })));
  const text = await generateContentWithFallback(genAI, synthPrompt);
  const parsedRaw = robustParse(text);
  const parsed = sanitizeMatchReport(parsedRaw, meta, reportSections);

  report('분석 리포트 정리 중', 92);
  const keyMoments = Array.isArray(parsed.keyMoments) ? parsed.keyMoments : [];
  const clipMap = new Map(clipsWithVideos.map((c) => [c.id, c]));

  // keyMoments: 관찰 기록과 클립 id 매칭 보강
  const factById = new Map((clipFacts || []).map((f) => [f.id, f]));

  return {
    meta,
    reportSections,
    matchSummary: parsed.matchSummary || '',
    segmentSummary: parsed.segmentSummary || '',
    scoreFlow: parsed.scoreFlow || '',
    firstHalf: parsed.firstHalf || '',
    secondHalf: parsed.secondHalf || '',
    teamStrengths: parsed.teamStrengths || [],
    teamWeaknesses: parsed.teamWeaknesses || [],
    keyMoments: (keyMoments.length ? keyMoments : factClips.map((c, i) => {
      const f = factById.get(c.id);
      return {
        id: c.id,
        startSec: c.startSec,
        endSec: c.endSec,
        label: f?.ballAction || c.label || `장면 ${i + 1}`,
        description: (f?.visibleFacts || []).join(' ') || '관찰 기록 없음',
        impact: 'medium',
      };
    })).map((km, i) => {
      const clip = clipMap.get(km.id) || clipsWithVideos[i];
      const fact = factById.get(km.id);
      const desc = fact?.visibleFacts?.length
        ? fact.visibleFacts.join(' ')
        : km.description;
      const phaseLabel = fact?.phase && fact.phase !== '확인 불가' ? `[${fact.phase}] ` : '';
      return {
        ...km,
        label: km.label || fact?.ballAction || clip?.label,
        description: phaseLabel + (desc || ''),
        url: clip?.url || clip?.videoUrl || clip?.outputUrl || '',
        startSec: km.startSec ?? clip?.startSec,
        endSec: km.endSec ?? clip?.endSec,
      };
    }),
    tacticalNotes: parsed.tacticalNotes || '',
    playerStandouts: parsed.playerStandouts || [],
    coachingRecommendations: parsed.coachingRecommendations || [],
    nextMatchFocus: parsed.nextMatchFocus || '',
    clipFacts,
    analysisMode: 'fact-only',
    clips: adaptClipsForMainSite(clipsWithVideos),
    yoloSummary: { ...(yoloResult.summary || {}), detectionSource },
    savedFilename,
  };
}

function mergeYoloAndCoachClips(yoloClips, coachClips) {
  const yoloMap = new Map((yoloClips || []).map((clip) => [clip.id, clip]));

  return (coachClips || []).map((coachClip, index) => {
    const yoloClip = yoloMap.get(coachClip.id) || yoloClips[index] || {};
    const startSec = coachClip.startSec ?? yoloClip.startSec ?? 0;
    const endSec = coachClip.endSec ?? yoloClip.endSec ?? startSec + 3;

    return {
      ...yoloClip,
      ...coachClip,
      id: coachClip.id || yoloClip.id || `clip-${index + 1}`,
      startSec,
      endSec,
      startTime: coachClip.startTime || yoloClip.startTime || secToMmss(startSec),
      endTime: coachClip.endTime || yoloClip.endTime || secToMmss(endSec),
      yoloScore: yoloClip.score ?? coachClip.yoloScore,
      finalScore: coachClip.importanceScore ?? yoloClip.score,
      approved: coachClip.approved !== false,
      ballInvolvement: coachClip.ballInvolvement || yoloClip.ballInvolvement || 'unknown',
      included: coachClip.approved !== false,
    };
  });
}

async function extractClipFrameBase64(videoPath, sec) {
  const tmpPath = path.join(highlightsDir, `qc-frame-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  // 검수 판정에는 저해상도로 충분하므로 다운스케일하여 Gemini 이미지 토큰 비용 절감
  await runProcess('ffmpeg', [
    '-ss', String(Math.max(0, sec)),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', `scale='min(${QC_FRAME_WIDTH},iw)':-2`,
    '-q:v', '6',
    '-y', tmpPath,
  ]);
  const data = fs.readFileSync(tmpPath).toString('base64');
  fs.unlinkSync(tmpPath);
  return data;
}

function buildVisualVerificationPrompt(clips, player = {}) {
  const playerName = player.name || '분석 대상 선수';
  const position = player.position || '미지정';
  const jerseyNumber = player.jerseyNumber || '-';

  const clipList = clips.map((clip, index) => ({
    index: index + 1,
    id: clip.id,
    startTime: clip.startTime,
    endTime: clip.endTime,
    label: clip.label,
    coachReason: clip.reason,
    targetPlayerInteractionFrames: clip.targetPlayerInteractionFrames,
    avgBallConfidence: clip.avgBallConfidence,
    isGoalAreaMoment: clip.isGoalAreaMoment || false,
    location: clip.location || null,
  }));

  return `당신은 축구 하이라이트 품질 검수관(QA)입니다. 각 장면에 첨부된 **실제 영상 프레임 ${QC_FRAMES_STRICT}장**을 보고 하이라이트 적합 여부를 판정하세요.
추측·짐작 금지 — 프레임에 보이지 않으면 rejected.

축구는 **공을 골대에 넣는** 스포츠입니다. 골대 앞·페널티박스에서의 슛·선방·수비·패스 연결·득점 시도 장면은 **특히 중요**합니다. isGoalAreaMoment=true 이거나 골대/박스 상황이 보이면, 선수가 관여했다면 우선 approved 하세요.

[분석 대상 선수]
- 이름: ${playerName}
- 포지션: ${position}
- 등번호: ${jerseyNumber}

[검수 대상 장면]
${JSON.stringify(clipList, null, 2)}

각 장면 이미지는 순서대로 [장면 id] 라벨 뒤 ${QC_FRAMES_STRICT}장씩 제공됩니다.

[반드시 rejected 처리]
- 선수가 공을 직접 다루지 않고 가만히 서 있거나 대기만 하는 장면
- 골대 앞에 서 있는 것만 보이고 세이브/킥/패스 등 **동작이 없는** 장면
- 등록 선수가 아닌 다른 선수만 보이는 장면
- 공이 거의 보이지 않거나 장면과 무관한 순간

[approved 조건]
- 등록 선수(${playerName}, ${position})가 공과 **직접** 관련된 동작(세이브, 펀칭, 킥, 캐치, 블로킹, 패스 등)이 프레임에서 확인됨
- confidence >= 72

순수 JSON만 출력:
{
  "reviews": [
    {
      "id": "clip-000120",
      "approved": true,
      "confidence": 88,
      "ballInvolvement": "direct",
      "actionType": "punch_save",
      "reason": "판정 근거"
    }
  ]
}`;
}

async function verifyClipsVisually(genAI, videoPath, clips, player = {}) {
  if (!clips.length) return [];

  const reviews = [];
  const batchSize = 4;

  for (let i = 0; i < clips.length; i += batchSize) {
    const batch = clips.slice(i, i + batchSize);
    const parts = [{ text: buildVisualVerificationPrompt(batch, player) }];

    for (const clip of batch) {
      const startSec = Number(clip.startSec) || 0;
      const endSec = Number(clip.endSec) || startSec + 3;
      const midSec = startSec + Math.max(0.4, (endSec - startSec) / 2);

      parts.push({ text: `\n[장면 ${clip.id} ${clip.startTime || secToMmss(startSec)} ~ ${clip.endTime || secToMmss(endSec)}]` });

      try {
        const frameA = await extractClipFrameBase64(videoPath, startSec + 0.4);
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: frameA } });
        if (QC_FRAMES_STRICT >= 2) {
          const frameB = await extractClipFrameBase64(videoPath, midSec);
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: frameB } });
        }
        if (QC_FRAMES_STRICT >= 3) {
          const frameC = await extractClipFrameBase64(videoPath, Math.max(startSec + 0.2, endSec - 0.5));
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: frameC } });
        }
      } catch (err) {
        console.warn(`[QC] 프레임 추출 실패 ${clip.id}:`, err.message);
        reviews.push({
          id: clip.id,
          approved: false,
          confidence: 0,
          ballInvolvement: 'none',
          reason: '프레임 추출 실패',
        });
      }
    }

    try {
      const text = await generateMultimodalWithFallback(genAI, parts);
      const parsed = robustParse(text);
      reviews.push(...(parsed.reviews || []));
    } catch (err) {
      console.warn('[QC] 시각 검수 실패:', err.message);
    }
  }

  return reviews;
}

function applyQualityGate(clips, player = {}, visualReviews = []) {
  const reviewMap = new Map((visualReviews || []).map((review) => [review.id, review]));
  const hasTarget = Boolean(player.name || player.jerseyNumber || player.position);

  return (clips || []).filter((clip) => {
    if (clip.approved === false) return false;
    if (clip.included === false) return false;
    if (clip.ballInvolvement === 'none') return false;
    if (Number(clip.importanceScore) > 0 && Number(clip.importanceScore) < 72) return false;

    const targetInteraction = Number(clip.targetPlayerInteractionFrames) || 0;
    const matchAvg = Number(clip.targetPlayerMatchAvg) || 0;
    const ballConf = Number(clip.avgBallConfidence) || 0;

    if (hasTarget && targetInteraction === 0 && matchAvg < 0.42 && ballConf < 0.55) {
      return false;
    }

    const review = reviewMap.get(clip.id);
    if (review) {
      clip.qcConfidence = review.confidence;
      clip.qcReason = review.reason;
      clip.qcActionType = review.actionType;
      clip.ballInvolvement = review.ballInvolvement || clip.ballInvolvement;
      if (review.approved === false) return false;
      if (Number(review.confidence) < 72) return false;
      if (review.ballInvolvement === 'none') return false;
    }

    return true;
  });
}

async function renderSingleClip(sourcePath, clip, outputPath) {
  const startSec = Number(clip.startSec) || 0;
  const endSec = Number(clip.endSec) || startSec + 3;
  const duration = Math.max(0.5, endSec - startSec);

  await runProcess('ffmpeg', [
    '-ss', String(startSec),
    '-i', sourcePath,
    '-t', String(duration),
    '-vf', 'scale=1280:720,fps=30',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y', outputPath,
  ]);
}

async function renderClipVideos(sourcePath, clips, concurrency = 4) {
  const rendered = new Array(clips.length);

  async function renderOne(clip, index) {
    const clipFileName = `clip-${Date.now()}-${index}-${String(clip.id).replace(/[^a-zA-Z0-9_-]/g, '')}.mp4`;
    const outputPath = path.join(highlightsDir, clipFileName);

    try {
      await renderSingleClip(sourcePath, clip, outputPath);
      rendered[index] = {
        ...clip,
        clipFileName,
        highlightVideoUrl: `${PUBLIC_BASE}/highlights/${clipFileName}`,
        videoUrl: `${PUBLIC_BASE}/highlights/${clipFileName}`,
      };
    } catch (err) {
      console.warn(`[FFmpeg] 클립 ${clip.id} 렌더 실패:`, err.message);
      rendered[index] = clip;
    }
  }

  for (let i = 0; i < clips.length; i += concurrency) {
    const batch = clips.slice(i, i + concurrency);
    await Promise.all(batch.map((clip, batchIndex) => renderOne(clip, i + batchIndex)));
  }

  return rendered.filter(Boolean);
}

async function concatHighlightVideos(clipFileNames, outputPath) {
  const listPath = `${outputPath}.txt`;
  const lines = clipFileNames.map((name) => {
    const abs = path.join(highlightsDir, name);
    return `file '${abs.replace(/'/g, "'\\''")}'`;
  });
  fs.writeFileSync(listPath, lines.join('\n'), 'utf8');

  await runProcess('ffmpeg', [
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-y', outputPath,
  ]);

  fs.unlinkSync(listPath);
}

async function renderFinalFromSource(sourcePath, clips, outputPath) {
  const trimFilters = clips
    .map((c, i) => `[0:v]trim=start=${c.startSec}:end=${c.endSec},setpts=PTS-STARTPTS,fps=30,scale=1280:720[v${i}]`)
    .join(';');
  const concatParts = clips.map((_, i) => `[v${i}]`).join('');
  const filterComplex = `${trimFilters};${concatParts}concat=n=${clips.length}:v=1:a=0[outv]`;

  await runProcess('ffmpeg', [
    '-i', sourcePath,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-y', outputPath,
  ]);
}

async function renderFinalHighlight(sourcePath, clips) {
  const outputName = `highlight-${Date.now()}.mp4`;
  const outputPath = path.join(highlightsDir, outputName);
  const preRendered = clips
    .map((clip) => clip.clipFileName)
    .filter((name) => name && fs.existsSync(path.join(highlightsDir, name)));

  if (preRendered.length === clips.length) {
    console.log('[FFmpeg] 개별 클립 concat으로 최종 영상 생성...');
    await concatHighlightVideos(preRendered, outputPath);
  } else {
    console.log('[FFmpeg] 원본 영상에서 직접 trim/concat...');
    await renderFinalFromSource(sourcePath, clips, outputPath);
  }

  return {
    outputName,
    outputPath: `/highlights/${outputName}`,
    videoUrl: `${PUBLIC_BASE}/highlights/${outputName}`,
  };
}

async function renderHighlightReel(clipsWithVideos, player = {}, seed = null) {
  const clips = (clipsWithVideos || [])
    .map((c) => c.highlightVideoUrl || c.videoUrl)
    .filter(Boolean);
  if (!clips.length) throw new Error('렌더할 클립 URL이 없습니다.');

  const profile = {
    name: player.name || '',
    jerseyNumber: String(player.jerseyNumber || ''),
    position: player.position || '',
    teamName: player.teamName || '',
    dob: player.dob || '',
    heightCm: String(player.heightCm || ''),
    weightKg: String(player.weightKg || ''),
    nationality: player.nationality || '',
    photo: player.photo || '',
    uniformColor: player.uniformColor || '',
    traits: player.traits || '',
  };

  const body = { clips, profile, style: process.env.HIGHLIGHT_FX_STYLE || 'bracket' };
  if (seed && Array.isArray(seed.seeds) && seed.seeds.length > 0) {
    body.seeds = seed.seeds.map((s) => ({
      nx: Number(s.nx),
      ny: Number(s.ny),
      timeSec: Number(s.timeSec) || 0,
    }));
    body.seed = { nx: body.seeds[0].nx, ny: body.seeds[0].ny };
  } else if (seed && Number.isFinite(seed.nx) && Number.isFinite(seed.ny) && seed.nx >= 0 && seed.ny >= 0) {
    body.seed = { nx: seed.nx, ny: seed.ny };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20 * 60 * 1000);
  const resp = await fetch(MODAL_RENDER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);
  if (!resp.ok) throw new Error(`Modal 렌더 오류 ${resp.status}`);

  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length < 1024) throw new Error('렌더 결과가 비어 있습니다.');
  const outputName = `highlight-fx-${Date.now()}.mp4`;
  fs.writeFileSync(path.join(highlightsDir, outputName), buf);

  return {
    outputName,
    outputPath: `/highlights/${outputName}`,
    videoUrl: `${PUBLIC_BASE}/highlights/${outputName}`,
    effects: true,
  };
}

function adaptClipsForMainSite(clips) {
  return (clips || []).map((clip, index) => {
    const startSec = Number(clip.startSec) || 0;
    const endSec = Number(clip.endSec) || startSec + 3;
    const videoUrl = clip.highlightVideoUrl || clip.videoUrl || '';

    return {
      id: clip.id || `clip-${index + 1}`,
      url: videoUrl,
      clipUrl: videoUrl,
      outputUrl: videoUrl,
      start: startSec,
      end: endSec,
      startTime: startSec,
      endTime: endSec,
      duration: Math.max(0, endSec - startSec),
      fileName: clip.clipFileName || clip.label || `clip-${index + 1}.mp4`,
      label: clip.label,
      reason: clip.reason,
      coachComment: clip.coachComment,
      importanceScore: clip.importanceScore,
      clipFileName: clip.clipFileName,
    };
  });
}

function buildPlayerTraits(player = {}) {
  const parts = [];
  if (player.uniformColor) parts.push(`${player.uniformColor} 유니폼`);
  if (player.traits) parts.push(player.traits);
  return parts.join(', ');
}

function gpuTargetLocked(gpuAnalysis) {
  const tracking = gpuAnalysis?.tracking;
  if (!tracking?.available) return false;
  return ['center_seed', 'manual_seed'].includes(tracking.targetSelectedBy);
}

/** Modal GPU(파인튜닝 soccer_best.pt)를 CPU yolo11n보다 먼저 사용할지 */
function shouldPreferGpuFirst(seed, captureMode) {
  if (!MODAL_ENABLED) return false;
  if (process.env.PLAYER_GPU_FIRST === '0') return false;
  if (hasManualSeed(seed)) return true;
  if (captureMode === 'landscape-player-focus') return true;
  // Modal 연결 시 기본 GPU 우선 (PLAYER_GPU_FIRST=0 으로 CPU 1차 복귀)
  return true;
}

function initPipelineDiagnostics(captureMode, seed) {
  const multi = normalizeSeedsArray(seed?.seeds);
  return {
    captureMode: captureMode || null,
    modalEnabled: MODAL_ENABLED,
    detectionSource: null,
    cpuYoloSkipped: false,
    gpuFirstAttempted: false,
    seedPointCount: multi.length || (hasManualSeed(seed) ? 1 : 0),
    detector: null,
    trackingAvailable: null,
    targetSelectedBy: null,
    trackingReason: null,
    matchConfidence: null,
    ballSeenFrames: null,
    sampledFrames: null,
    candidateCount: 0,
    cpuFallbackUsed: false,
    gpuRescued: false,
    factFilterDropped: null,
    finalClipCount: null,
    timestamp: new Date().toISOString(),
  };
}

function applyGpuToDiagnostics(diag, gpuCand, gpuAnalysis) {
  if (!diag) return;
  const tracking = gpuAnalysis?.tracking || gpuCand?.tracking || null;
  const candMeta = gpuCand?.candidates || {};
  diag.detector = gpuCand?.detector || gpuAnalysis?.detector || diag.detector;
  if (tracking) {
    diag.trackingAvailable = tracking.available ?? null;
    diag.targetSelectedBy = tracking.targetSelectedBy ?? null;
    diag.trackingReason = tracking.reason ?? null;
    diag.matchConfidence = tracking.matchConfidence ?? null;
  }
  if (candMeta.ballSeenFrames != null) diag.ballSeenFrames = candMeta.ballSeenFrames;
  if (candMeta.sampledFrames != null) diag.sampledFrames = candMeta.sampledFrames;
  if (Array.isArray(candMeta.candidates)) diag.candidateCount = candMeta.candidates.length;
}

function buildGpuYoloSummary(gpuCand, clipCount) {
  const meta = gpuCand?.candidates || {};
  return {
    source: 'modal-gpu',
    durationSec: meta.durationSec,
    ballDetectedFrames: meta.ballSeenFrames,
    sampledFrames: meta.sampledFrames,
    clipCount: clipCount || 0,
    detector: gpuCand?.detector || null,
  };
}

async function attemptGpuPlayerDetection(videoUrl, player, seed, report) {
  report('정밀 추적·장면 탐지 중 (GPU)', 12);
  const gpuCand = await runGpuCandidates(videoUrl, player, seed);
  const mapped = mapGpuCandidatesToClips(gpuCand?.candidates?.candidates || []);
  let gpuAnalysis = null;
  if (mapped.length) {
    gpuAnalysis = await runGpuAnalysis(videoUrl, player, mapped, seed);
    gpuAnalysis = gpuAnalysis || gpuCand;
  }
  return { gpuCand, mapped, gpuAnalysis };
}

// 업로드 영상에서 사용자가 직접 지정(탭)한 선수 시드 정규화. 유효하지 않으면 null.
function normalizeSeedInput(seed) {
  if (!seed || typeof seed !== 'object') return null;
  const nx = Number(seed.nx);
  const ny = Number(seed.ny);
  const timeSec = Number(seed.timeSec);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  return {
    nx,
    ny,
    timeSec: Number.isFinite(timeSec) && timeSec >= 0 ? timeSec : 0,
  };
}

function normalizeSeedsArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => normalizeSeedInput(s)).filter(Boolean);
}

function buildSeedPayload(bodySeed, bodySeeds) {
  const seeds = normalizeSeedsArray(bodySeeds);
  const single = normalizeSeedInput(bodySeed);
  if (seeds.length > 0) {
    const primary = single || seeds[0];
    return { ...primary, seeds };
  }
  return single;
}

function normalizePlayerInput(body = {}) {
  const nested = body.player && typeof body.player === 'object' ? body.player : {};
  const uniformColor = String(body.uniformColor || nested.uniformColor || '').trim();
  const traits = String(body.playerTraits || body.traits || nested.traits || '').trim();

  return {
    name: String(body.playerName || nested.name || '').trim(),
    position: String(body.position || body.playerPosition || nested.position || '').trim(),
    teamName: String(body.teamName || nested.teamName || '').trim(),
    jerseyNumber: String(body.jerseyNumber || nested.jerseyNumber || '').trim(),
    uniformColor,
    traits,
    dob: String(body.dob || nested.dob || '').trim(),
    heightCm: String(body.heightCm || nested.heightCm || '').trim(),
    weightKg: String(body.weightKg || nested.weightKg || '').trim(),
    nationality: String(body.nationality || nested.nationality || '').trim(),
    photo: String(body.photo || nested.photo || '').trim(),
  };
}

async function runFullHighlightPipeline(savedFilename, player = {}, {
  renderFinal = false, onProgress, seed = null, captureMode = null,
} = {}) {
  const report = (stage, progress) => {
    if (typeof onProgress === 'function') {
      try { onProgress(stage, progress); } catch { /* noop */ }
    }
  };

  const pipelineDiagnostics = initPipelineDiagnostics(captureMode, seed);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const fullPath = path.join(uploadsDir, savedFilename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`영상 파일을 찾을 수 없습니다: ${savedFilename}`);
  }

  const videoUrl = `${PUBLIC_BASE}/uploads/${savedFilename}`;
  let yoloResult = { clips: [], summary: {} };
  let coachCandidates = [];
  let gpuAnalysis = null;
  let rescued = false;
  let gpuFirstAttempted = false;

  const preferGpuFirst = shouldPreferGpuFirst(seed, captureMode);
  if (preferGpuFirst) {
    gpuFirstAttempted = true;
    pipelineDiagnostics.gpuFirstAttempted = true;
    pipelineDiagnostics.cpuYoloSkipped = true;
    console.log(`[QC] GPU 우선 경로 (detector=soccer_best) capture=${captureMode || '-'} seeds=${pipelineDiagnostics.seedPointCount}`);
    const gpuPath = await attemptGpuPlayerDetection(videoUrl, player, seed, report);
    applyGpuToDiagnostics(pipelineDiagnostics, gpuPath.gpuCand, gpuPath.gpuAnalysis);
    if (gpuPath.mapped.length) {
      coachCandidates = gpuPath.mapped;
      yoloResult = {
        clips: gpuPath.mapped,
        summary: buildGpuYoloSummary(gpuPath.gpuCand, gpuPath.mapped.length),
      };
      gpuAnalysis = gpuPath.gpuAnalysis;
      rescued = true;
      pipelineDiagnostics.detectionSource = 'modal-gpu-first';
      pipelineDiagnostics.gpuRescued = true;
      console.log(`[QC] GPU 우선 ${coachCandidates.length}개 후보 (ballSeen=${pipelineDiagnostics.ballSeenFrames ?? '?'})`);
    } else {
      console.warn('[QC] GPU 우선 경로 후보 없음 → CPU yolo11n 폴백');
      pipelineDiagnostics.cpuFallbackUsed = true;
    }
  }

  if (!coachCandidates.length) {
    report('영상에서 후보 장면 탐지 중 (CPU)', 8);
    yoloResult = await runYoloDetection(fullPath, player);
    if (!yoloResult.clips?.length) {
      console.warn('[YOLO] 1차 분석에서 클립 없음, 완화 조건으로 재시도...');
      const relaxed = await runYoloDetection(fullPath, player, 15, { minScore: 0.45, conf: 0.15, imgsz: 768 });
      if (relaxed.clips?.length) {
        Object.assign(yoloResult, relaxed);
      }
    }
    coachCandidates = yoloResult.clips?.length
      ? prefilterYoloClipsForCoach(yoloResult.clips, player)
      : [];
    if (!pipelineDiagnostics.detectionSource) {
      pipelineDiagnostics.detectionSource = 'cpu-yolo11n';
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // 수동 시드(탭) + CPU 후보만 있을 때: GPU 재탐색 (GPU 우선을 이미 시도했으면 생략)
  if (hasManualSeed(seed) && MODAL_ENABLED && !gpuFirstAttempted) {
    if (coachCandidates.length) {
      console.log('[QC] 수동 시드 있음 → CPU 후보 무시, GPU 탭 추적으로 교체');
    }
    coachCandidates = [];
  }

  if (!coachCandidates.length && MODAL_ENABLED && !gpuFirstAttempted) {
    report('정밀 추적·이동 분석 중 (GPU 구제)', 40);
    console.warn('[QC] CPU가 대상-공 장면을 못 찾음 → GPU SAHI + seed 구제 시도');
    const gpuPath = await attemptGpuPlayerDetection(videoUrl, player, seed, report);
    applyGpuToDiagnostics(pipelineDiagnostics, gpuPath.gpuCand, gpuPath.gpuAnalysis);
    if (gpuPath.mapped.length) {
      coachCandidates = gpuPath.mapped;
      yoloResult.clips = gpuPath.mapped;
      yoloResult.summary = buildGpuYoloSummary(gpuPath.gpuCand, gpuPath.mapped.length);
      gpuAnalysis = gpuPath.gpuAnalysis;
      rescued = true;
      pipelineDiagnostics.detectionSource = 'modal-gpu-rescue';
      pipelineDiagnostics.gpuRescued = true;
      console.log(`[QC] GPU 구제 ${coachCandidates.length}개 (target=${pipelineDiagnostics.targetSelectedBy || '?'})`);
    }
  }

  if (!coachCandidates.length) {
    const summary = yoloResult.summary || {};
    const error = new Error(buildNoClipsError(summary, player));
    error.yoloSummary = summary;
    error.pipelineDiagnostics = pipelineDiagnostics;
    throw error;
  }

  yoloResult.clips = coachCandidates;
  console.log(`[QC] 1차 품질 필터 통과 ${coachCandidates.length}개${rescued ? ' (GPU)' : ' (CPU)'}`);

  report('정밀 추적·이동 분석 중', 40);
  if (!rescued && MODAL_ENABLED) {
    gpuAnalysis = await runGpuAnalysis(videoUrl, player, coachCandidates, seed);
    applyGpuToDiagnostics(pipelineDiagnostics, gpuAnalysis, gpuAnalysis);
  }

  // ── 데이터 품질 검사: 불확실하면 엉터리 분석 대신 솔직한 안내 ──
  const dataQuality = assessDataQuality(coachCandidates, gpuAnalysis);
  if (dataQuality.insufficient) {
    console.log(`[QC] 데이터 품질 부족 → 엉터리 분석 방지: ${dataQuality.reason}`);
    pipelineDiagnostics.finalClipCount = Math.min(coachCandidates.length, 3);
    return {
      clips: coachCandidates.slice(0, 3),
      summary: {
        dataInsufficient: true,
        insufficientReason: dataQuality.reason,
        filmingGuide: dataQuality.guide,
        noticeableScene: '데이터 부족으로 정확한 분석이 어렵습니다.',
        strength: dataQuality.partialStrength || '영상 데이터가 부족해 장점을 정확히 파악하기 어렵습니다.',
        weakness: '분석 불가',
        trainingPoint: dataQuality.guide,
        nextTrainingPoint: '더 좋은 영상으로 다시 분석해보세요.',
      },
      gpuAnalysis,
      pipelineDiagnostics,
    };
  }

  report('AI 코치가 장면 선정 중', 60);
  let clipFacts = [];
  let prompt;
  if (ANALYSIS_ZERO_SPECULATION) {
    report('선수 장면 영상 관찰 중 (정확도 우선)', 58);
    const candidatesBeforeFacts = coachCandidates.slice();
    clipFacts = await describePlayerClipFacts(
      genAI,
      fullPath,
      coachCandidates.slice(0, QC_MAX_CLIPS),
      player,
    );
    const factById = new Map(clipFacts.map((f) => [f.id, f]));
    const targetLocked = gpuTargetLocked(gpuAnalysis);
    coachCandidates = coachCandidates.filter((c) => {
      const f = factById.get(c.id);
      if (!f) return targetLocked || rescued;
      if (f.isTargetPlayer === false) return false;
      if (f.playerSeen === true) return true;
      return targetLocked && f.playerSeen !== false;
    });
    pipelineDiagnostics.factFilterDropped = candidatesBeforeFacts.length - coachCandidates.length;
    if (!coachCandidates.length && targetLocked && candidatesBeforeFacts.length) {
      console.warn('[QC] Gemini 장면 확인 실패 → GPU 추적 확정으로 후보 유지');
      coachCandidates = candidatesBeforeFacts;
    }
    if (!coachCandidates.length) {
      throw new Error(
        '영상에서 지정한 선수가 명확히 보이는 장면을 찾지 못했습니다. 선수를 화면 중앙에 크게 두고 촬영하거나, 유니폼 색·등번호를 확인해 주세요.',
      );
    }
    yoloResult.clips = coachCandidates;
    prompt = buildCoachPromptFromFacts(yoloResult, player, gpuAnalysis, clipFacts);
  } else {
    prompt = buildCoachPrompt(yoloResult, player, gpuAnalysis);
  }
  const text = await generateContentWithFallback(genAI, prompt);
  const parsed = robustParse(text);
  const coachSelected = sanitizeCoachClips((parsed.clips || []).filter((clip) => clip.approved !== false));
  let mergedClips = mergeYoloAndCoachClips(yoloResult.clips, coachSelected.length ? coachSelected : parsed.clips);

  if (rescued && !ANALYSIS_ZERO_SPECULATION) {
    // GPU 구제 경로: 야간/원거리라 프레임 시각검수가 과하게 탈락시키므로 생략하고 상위 후보를 사용
    mergedClips = (mergedClips || []).filter((clip) => clip.included !== false);
    if (!mergedClips.length) mergedClips = yoloResult.clips;
    mergedClips = mergedClips.slice(0, QC_MAX_CLIPS);
    console.log(`[QC] GPU 구제 경로 → 시각검수 생략, ${mergedClips.length}개 렌더`);
  } else {
    report('장면 품질 검수 중', 75);
    console.log(`[QC] 2차 AI 코치 선정 ${mergedClips.length}개 → 시각 검수 시작...`);
    const visualReviews = await verifyClipsVisually(genAI, fullPath, mergedClips.slice(0, QC_MAX_CLIPS), player);
    mergedClips = applyQualityGate(mergedClips, player, visualReviews);
  }

  if (!mergedClips.length) {
    throw new Error(
      '하이라이트로 적합한 장면이 검수를 통과하지 못했습니다. 키퍼/선수가 공을 직접 다루는 장면이 더 많이 담긴 영상으로 다시 시도해 주세요.',
    );
  }

  console.log(`[QC] 최종 승인 ${mergedClips.length}개`);
  pipelineDiagnostics.finalClipCount = mergedClips.length;
  console.log('[QC] pipelineDiagnostics', JSON.stringify(pipelineDiagnostics));

  report('하이라이트 클립 렌더링 중', 88);
  console.log('[FFmpeg] 개별 클립 렌더링 시작...');
  const clipsWithVideos = await renderClipVideos(fullPath, mergedClips);

  let finalHighlight = null;
  if (renderFinal) {
    report('하이라이트 영상 합치는 중', 95);
    // 스포트라이트(Modal) 렌더는 응답을 막지 않도록 분리 → /api/jobs/spotlight 에서 처리
    finalHighlight = await renderFinalHighlight(fullPath, clipsWithVideos);
  }

  return {
    savedFilename,
    clipsWithVideos,
    summary: sanitizePlayerSummary(parsed.summary),
    clipFacts: clipFacts.length ? clipFacts : undefined,
    analysisMode: ANALYSIS_ZERO_SPECULATION ? 'fact-only-player' : 'standard',
    yoloSummary: yoloResult.summary,
    gpuAnalysis,
    finalHighlight,
    message: renderFinal
      ? `대상 선수 ${player.name || ''} · 후보 ${yoloResult.clips.length}개 → AI 코치 ${clipsWithVideos.length}개 → 최종 하이라이트 완료`
      : `대상 선수 ${player.name || ''} · 후보 ${yoloResult.clips.length}개 → AI 코치 ${clipsWithVideos.length}개 → 클립 생성 완료`,
    targetPlayer: yoloResult.targetPlayer || null,
    player,
    pipelineDiagnostics,
  };
}

function handleUpload(req, res) {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: '업로드할 영상 파일이 없습니다. field 이름은 video 여야 합니다.',
    });
    return;
  }

  res.json({
    success: true,
    savedFilename: req.file.filename,
    fileName: req.file.filename,
    videoUrl: `${PUBLIC_BASE}/uploads/${req.file.filename}`,
    fileUrl: `${PUBLIC_BASE}/uploads/${req.file.filename}`,
  });
}

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'server ok',
    ffmpegAvailable: true,
    ffprobeAvailable: true,
    geminiKey: Boolean(process.env.GEMINI_API_KEY),
    geminiModels: GEMINI_MODELS,
    yoloScript: fs.existsSync(YOLO_SCRIPT),
    r2Enabled: R2_ENABLED,
    modalEnabled: MODAL_ENABLED,
    playerPipeline: {
      gpuFirstDefault: MODAL_ENABLED && process.env.PLAYER_GPU_FIRST !== '0',
      cpuDetector: 'yolo11n.pt (Railway)',
      gpuDetector: 'soccer_best.pt (Modal volume)',
      analysisZeroSpeculation: ANALYSIS_ZERO_SPECULATION,
    },
    timestamp: new Date().toISOString(),
  });
});

function sanitizeExt(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return match ? match[1] : 'mp4';
}

// 훈련일지 영상 업로드용 presigned URL 발급 (영상은 R2로 직접 업로드 → 서버 트래픽 0)
app.post('/api/training-journal/presign-upload', async (req, res) => {
  try {
    if (!R2_ENABLED || !r2Client) {
      res.status(503).json({ success: false, error: '영상 저장소(R2)가 아직 설정되지 않았습니다.' });
      return;
    }

    const { fileName, contentType, fileSize } = req.body || {};
    const ct = String(contentType || '').toLowerCase();
    if (!ct.startsWith('video/')) {
      res.status(400).json({ success: false, error: '영상 파일만 업로드할 수 있습니다.' });
      return;
    }

    const sizeMb = Number(fileSize) / (1024 * 1024);
    if (Number.isFinite(sizeMb) && sizeMb > R2_MAX_UPLOAD_MB) {
      res.status(413).json({
        success: false,
        error: `영상 용량이 너무 큽니다. (최대 ${R2_MAX_UPLOAD_MB}MB) 더 짧게 촬영하거나 화질을 낮춰 주세요.`,
      });
      return;
    }

    const ext = sanitizeExt(fileName);
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const key = `training/${datePart}/${crypto.randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: ct,
    });
    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 600 });

    res.json({
      success: true,
      uploadUrl,
      publicUrl: `${R2_PUBLIC_BASE}/${key}`,
      key,
    });
  } catch (error) {
    console.error('[R2] presign 실패:', error);
    res.status(500).json({ success: false, error: '업로드 주소 발급에 실패했습니다.' });
  }
});

// 훈련일지 영상: 서버 경유 업로드 (브라우저 → 우리 서버 → R2)
// 한국 ISP가 <account>.r2.cloudflarestorage.com 직접 연결을 SNI 차단하므로 서버에서 대신 업로드함
app.post('/api/training-journal/upload', trainingUpload.single('video'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!R2_ENABLED || !r2Client) {
      res.status(503).json({ success: false, error: '영상 저장소(R2)가 아직 설정되지 않았습니다.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: '영상 파일이 없습니다.' });
      return;
    }

    const ct = String(req.file.mimetype || '').toLowerCase();
    if (!ct.startsWith('video/')) {
      res.status(400).json({ success: false, error: '영상 파일만 업로드할 수 있습니다.' });
      return;
    }

    const ext = sanitizeExt(req.file.originalname);
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const key = `training/${datePart}/${crypto.randomUUID()}.${ext}`;

    const stat = fs.statSync(filePath);
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: ct,
        Body: fs.createReadStream(filePath),
        ContentLength: stat.size,
      }),
    );

    res.json({
      success: true,
      publicUrl: `${R2_PUBLIC_BASE}/${key}`,
      key,
    });
  } catch (error) {
    console.error('[R2] 서버 경유 업로드 실패:', error);
    const isTls = String(error?.message || '').includes('handshake');
    res.status(isTls ? 503 : 500).json({
      success: false,
      error: isTls
        ? '영상 저장소를 준비 중입니다(인증서 발급 대기). 몇 시간 후 다시 시도해 주세요.'
        : '영상 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    });
  } finally {
    if (filePath) {
      fs.promises.unlink(filePath).catch(() => {});
    }
  }
});

app.get('/api/lab/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Lab API is active',
    geminiKey: Boolean(process.env.GEMINI_API_KEY),
    geminiModels: GEMINI_MODELS,
    yoloScript: fs.existsSync(YOLO_SCRIPT),
  });
});

app.post('/api/upload', upload.single('video'), handleUpload);

// ── 청크(조각) 업로드: 20분 등 대용량 영상도 끊기지 않게 ──────────────────
// uploadId별로 순차 도착하는 조각을 한 파일에 이어붙인다(재시도 안전).
const chunkUploads = new Map();
const CHUNK_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of chunkUploads.entries()) {
    if (now - entry.updatedAt > CHUNK_UPLOAD_TTL_MS) {
      fs.promises.unlink(entry.filePath).catch(() => {});
      chunkUploads.delete(id);
    }
  }
}, 30 * 60 * 1000).unref?.();

function safeUploadId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

app.post('/api/upload/chunk', express.raw({ type: 'application/octet-stream', limit: '32mb' }), (req, res) => {
  try {
    const uploadId = safeUploadId(req.get('x-upload-id'));
    const index = Number(req.get('x-chunk-index'));
    const total = Number(req.get('x-chunk-total'));

    if (!uploadId || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {
      res.status(400).json({ success: false, error: '청크 헤더가 올바르지 않습니다.' });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ success: false, error: '빈 청크입니다.' });
      return;
    }

    let entry = chunkUploads.get(uploadId);
    if (!entry) {
      entry = {
        filePath: path.join(uploadsDir, `chunk-${uploadId}.mp4`),
        nextIndex: 0,
        total,
        updatedAt: Date.now(),
      };
      // 이전 잔여 파일 제거 후 새로 시작
      try { fs.existsSync(entry.filePath) && fs.unlinkSync(entry.filePath); } catch {}
      chunkUploads.set(uploadId, entry);
    }

    // 이미 받은 조각의 재시도 → 멱등 처리
    if (index < entry.nextIndex) {
      res.json({ success: true, received: entry.nextIndex, total: entry.total });
      return;
    }
    // 순서가 어긋나면 클라이언트가 nextIndex부터 다시 보내도록 안내
    if (index !== entry.nextIndex) {
      res.status(409).json({ success: false, expected: entry.nextIndex, received: entry.nextIndex });
      return;
    }

    fs.appendFileSync(entry.filePath, req.body);
    entry.nextIndex += 1;
    entry.updatedAt = Date.now();

    res.json({ success: true, received: entry.nextIndex, total: entry.total });
  } catch (error) {
    console.error('[upload/chunk]', error);
    res.status(500).json({ success: false, error: '청크 저장에 실패했습니다.' });
  }
});

app.post('/api/upload/complete', (req, res) => {
  try {
    const uploadId = safeUploadId(req.body?.uploadId);
    const entry = chunkUploads.get(uploadId);
    if (!entry) {
      res.status(400).json({ success: false, error: '업로드 세션을 찾을 수 없습니다. 다시 시도해 주세요.' });
      return;
    }
    if (entry.nextIndex < entry.total) {
      res.status(400).json({
        success: false,
        error: `업로드가 완료되지 않았습니다(${entry.nextIndex}/${entry.total}).`,
        received: entry.nextIndex,
        total: entry.total,
      });
      return;
    }

    const savedFilename = `video-${Date.now()}.mp4`;
    const finalPath = path.join(uploadsDir, savedFilename);
    fs.renameSync(entry.filePath, finalPath);
    chunkUploads.delete(uploadId);

    res.json({
      success: true,
      savedFilename,
      fileName: savedFilename,
      videoUrl: `${PUBLIC_BASE}/uploads/${savedFilename}`,
      fileUrl: `${PUBLIC_BASE}/uploads/${savedFilename}`,
    });
  } catch (error) {
    console.error('[upload/complete]', error);
    res.status(500).json({ success: false, error: '업로드 마무리에 실패했습니다.' });
  }
});

app.post('/api/lab/extract-highlights-yolo', async (req, res) => {
  try {
    const { savedFilename } = req.body || {};
    if (!savedFilename) {
      res.status(400).json({ success: false, error: 'savedFilename이 필요합니다.' });
      return;
    }

    const fullPath = path.join(uploadsDir, savedFilename);
    if (!fs.existsSync(fullPath)) {
      res.status(400).json({ success: false, error: `영상 파일을 찾을 수 없습니다: ${savedFilename}` });
      return;
    }

    const yoloResult = await runYoloDetection(fullPath);
    res.json({ success: true, source: 'yolo', ...yoloResult });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/lab/analyze-highlights-gemini', async (req, res) => {
  try {
    const { savedFilename, yoloClips = [], yoloSummary = null, player: bodyPlayer, ...rest } = req.body || {};
    const player = normalizePlayerInput({ ...rest, player: bodyPlayer });
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      res.status(500).json({ success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
      return;
    }

    const yoloResult = {
      fileName: savedFilename,
      summary: yoloSummary,
      clips: yoloClips,
      targetPlayer: req.body?.targetPlayer || null,
    };

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = buildCoachPrompt(yoloResult, player);
    const text = await generateContentWithFallback(genAI, prompt);
    const parsed = robustParse(text);
    const mergedClips = mergeYoloAndCoachClips(yoloClips, parsed.clips);

    res.json({
      success: true,
      source: 'gemini',
      clips: mergedClips,
      summary: parsed.summary,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/lab/extract-highlights', async (req, res) => {
  try {
    const { savedFilename, fileName, player: bodyPlayer, ...rest } = req.body || {};
    const filename = savedFilename || fileName;
    const player = normalizePlayerInput({ ...rest, player: bodyPlayer });
    if (!filename) {
      res.status(400).json({ success: false, error: 'savedFilename이 필요합니다.' });
      return;
    }

    const result = await runFullHighlightPipeline(filename, player, { renderFinal: false });

    res.json({
      success: true,
      source: 'yolo+gemini',
      savedFilename: filename,
      clips: result.clipsWithVideos,
      summary: result.summary,
      yoloSummary: result.yoloSummary,
      targetPlayer: result.targetPlayer,
      player: result.player,
      message: result.message,
    });
  } catch (err) {
    console.error('[extract-highlights]', err);
    res.status(500).json({
      success: false,
      error: err.message,
      yoloSummary: err.yoloSummary,
    });
  }
});

app.post('/api/extract-highlights', async (req, res) => {
  try {
    const { savedFilename, fileName, player: bodyPlayer, ...rest } = req.body || {};
    const filename = savedFilename || fileName;
    const player = normalizePlayerInput({ ...rest, player: bodyPlayer });
    if (!filename) {
      res.status(400).json({ success: false, message: 'fileName 또는 savedFilename이 필요합니다.' });
      return;
    }

    const result = await runFullHighlightPipeline(filename, player, { renderFinal: true });
    const mainClips = adaptClipsForMainSite(result.clipsWithVideos);
    const mergedHighlightUrl = result.finalHighlight?.videoUrl || '';

    try {
      const originalPath = path.join(uploadsDir, filename);
      if (fs.existsSync(originalPath)) {
        fs.unlinkSync(originalPath);
        console.log('[cleanup] 원본 영상 삭제:', filename);
      }
    } catch (cleanupErr) {
      console.warn('[cleanup] 원본 영상 삭제 실패:', cleanupErr.message);
    }

    res.json({
      success: true,
      fileName: filename,
      savedFilename: filename,
      clips: mainClips,
      mergedHighlightUrl,
      highlightVideoUrl: mergedHighlightUrl,
      jobId: `job-${Date.now()}`,
      summary: result.summary,
      yoloSummary: result.yoloSummary,
      gpuAnalysis: result.gpuAnalysis || null,
      targetPlayer: result.targetPlayer,
      player: result.player,
      message: result.message,
    });
  } catch (err) {
    console.error('[api/extract-highlights]', err);
    res.status(500).json({
      success: false,
      message: err.message,
      error: err.message,
    });
  }
});

// 로컬 하이라이트 출력 URL → 실제 파일 경로
function localHighlightFileFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/highlights\/([^/?#]+)$/);
  if (!m) return null;
  const fullPath = path.join(highlightsDir, m[1]);
  return fs.existsSync(fullPath) ? { name: m[1], path: fullPath } : null;
}

// 하이라이트 출력(영상)을 R2로 미러링하고 결과 URL을 R2 주소로 교체.
// 서버가 재시작돼도 결과 링크가 살아있도록 함. (실패 시 로컬 URL 유지)
async function mirrorJobResultOutputs(result) {
  if (!R2_ENABLED || !result) return result;
  const cache = new Map();
  const mirror = async (url) => {
    const info = localHighlightFileFromUrl(url);
    if (!info) return url;
    if (cache.has(info.name)) return cache.get(info.name);
    try {
      const publicUrl = await r2PutFile(`${R2_OUT_PREFIX}${info.name}`, info.path, 'video/mp4');
      cache.set(info.name, publicUrl);
      return publicUrl;
    } catch (err) {
      console.warn('[R2] 출력 미러 실패:', info.name, err.message);
      return url;
    }
  };

  if (result.mergedHighlightUrl) result.mergedHighlightUrl = await mirror(result.mergedHighlightUrl);
  if (result.highlightVideoUrl) result.highlightVideoUrl = await mirror(result.highlightVideoUrl);
  if (result.videoUrl) result.videoUrl = await mirror(result.videoUrl);
  if (Array.isArray(result.clips)) {
    for (const clip of result.clips) {
      for (const field of ['url', 'clipUrl', 'outputUrl', 'videoUrl', 'highlightVideoUrl']) {
        if (clip[field]) clip[field] = await mirror(clip[field]);
      }
    }
  }
  return result;
}

// ── 비동기 작업(job) 시스템: 긴 작업이 단일 요청 타임아웃에 안 걸리도록 분리 ──
// 작업 기록을 R2에 영구 저장(write-through) → 서버가 재시작돼도 결과 유지/재개 가능.
const jobs = new Map(); // 빠른 조회용 메모리 캐시(원본은 R2)

// R2에 저장할 때 영상 데이터(base64 등 큰 값)는 빼고 메타데이터만 보관
function jobToPersist(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    result: job.result,
    error: job.error,
    yoloSummary: job.yoloSummary || null,
    createdAt: job.createdAt,
    // 재개(resume)에 필요한 정보
    filename: job.filename || null,
    srcKey: job.srcKey || null,
    player: job.player || null,
    seed: job.seed || null,
  };
}

function persistJob(job) {
  if (!R2_ENABLED) return;
  r2PutJson(`${R2_JOB_PREFIX}${job.id}.json`, jobToPersist(job))
    .catch((err) => console.warn('[job] 영구저장 실패:', job.id, err.message));
}

// 메모리 캐시에 반영 + R2에 write-through
function setJob(job) {
  jobs.set(job.id, job);
  persistJob(job);
}

async function getJob(id) {
  if (jobs.has(id)) return jobs.get(id);
  if (R2_ENABLED) {
    try {
      const j = await r2GetJson(`${R2_JOB_PREFIX}${id}.json`);
      if (j) {
        jobs.set(j.id, j);
        return j;
      }
    } catch (err) {
      console.warn('[job] R2 조회 실패:', id, err.message);
    }
  }
  return null;
}

function createJob(type, meta = {}) {
  // 1시간 지난 메모리 캐시 정리
  const now = Date.now();
  for (const [key, value] of jobs) {
    if (now - value.createdAt > 60 * 60 * 1000) jobs.delete(key);
  }
  const id = `${type}-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const job = { id, type, status: 'running', stage: '대기 중', progress: 0,
    result: null, error: null, createdAt: now, ...meta };
  setJob(job);
  return job;
}

// 추출 작업 실행(신규 시작 + 재시작 후 재개 공용). job에는 filename/player/srcKey가 들어있음.
async function runExtractJob(job) {
  const filename = job.filename;
  const player = job.player || {};
  const localPath = path.join(uploadsDir, filename);

  try {
    // 로컬 원본이 없으면(=서버 재시작 후 재개) R2에서 복구
    if (!fs.existsSync(localPath)) {
      if (job.srcKey && R2_ENABLED) {
        console.log('[resume] R2에서 원본 복구:', job.srcKey);
        job.stage = '영상 복구 중';
        setJob(job);
        await r2GetToFile(job.srcKey, localPath);
      } else {
        throw new Error('원본 영상을 찾을 수 없어 재개할 수 없습니다. 다시 업로드해 주세요.');
      }
    }

    const result = await runFullHighlightPipeline(filename, player, {
      renderFinal: true,
      seed: job.seed || null,
      captureMode: job.captureMode || null,
      onProgress: (stage, progress) => {
        job.stage = stage;
        if (typeof progress === 'number') job.progress = progress;
        setJob(job);
      },
    });

    // 원본 영상은 처리 후 삭제(개인정보·저장공간)
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        console.log('[cleanup] 원본 영상 삭제:', filename);
      }
    } catch (cleanupErr) {
      console.warn('[cleanup] 원본 영상 삭제 실패:', cleanupErr.message);
    }

    const jobResult = {
      fileName: filename,
      savedFilename: filename,
      clips: adaptClipsForMainSite(result.clipsWithVideos),
      mergedHighlightUrl: result.finalHighlight?.videoUrl || '',
      highlightVideoUrl: result.finalHighlight?.videoUrl || '',
      summary: result.summary,
      yoloSummary: result.yoloSummary,
      gpuAnalysis: result.gpuAnalysis || null,
      pipelineDiagnostics: result.pipelineDiagnostics || null,
      targetPlayer: result.targetPlayer,
      player: result.player,
      message: result.message,
    };
    // 하이라이트 출력물을 R2로 미러링 → 재시작돼도 결과 링크 유지
    await mirrorJobResultOutputs(jobResult);

    job.result = jobResult;
    job.status = 'done';
    job.stage = '완료';
    job.progress = 100;
    setJob(job);
  } catch (err) {
    console.error('[job/extract]', err);
    job.status = 'error';
    job.error = err.message;
    job.yoloSummary = err.yoloSummary;
    job.pipelineDiagnostics = err.pipelineDiagnostics || null;
    setJob(job);
  } finally {
    // 작업이 끝나면(성공/실패) R2 원본 백업은 더 이상 필요 없음
    if (job.srcKey && R2_ENABLED) r2Delete(job.srcKey);
  }
}

async function runMatchAnalysisJob(job) {
  const filename = job.filename;
  const meta = job.matchMeta || {};
  const localPath = path.join(uploadsDir, filename);

  try {
    if (!fs.existsSync(localPath)) {
      if (job.srcKey && R2_ENABLED) {
        job.stage = '영상 복구 중';
        setJob(job);
        await r2GetToFile(job.srcKey, localPath);
      } else {
        throw new Error('원본 영상을 찾을 수 없습니다. 다시 업로드해 주세요.');
      }
    }

    const result = await runMatchAnalysisPipeline(filename, meta, {
      onProgress: (stage, progress) => {
        job.stage = stage;
        if (typeof progress === 'number') job.progress = progress;
        setJob(job);
      },
    });

    try {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch { /* noop */ }

    await mirrorJobResultOutputs(result);
    job.result = result;
    job.status = 'done';
    job.stage = '완료';
    job.progress = 100;
    setJob(job);
  } catch (err) {
    console.error('[job/match-analysis]', err);
    job.status = 'error';
    job.error = err.message;
    setJob(job);
  } finally {
    if (job.srcKey && R2_ENABLED) r2Delete(job.srcKey);
  }
}

// 하이라이트 자동추출 시작 → jobId 즉시 반환(백그라운드 진행)
function ffprobeDuration(videoPath) {
  return runProcess('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ])
    .then(({ stdout }) => Number(String(stdout).trim()) || 0)
    .catch(() => 0);
}

// 오래된 시드 프레임 폴더 정리(2시간 경과)
function cleanupOldSeedFrames() {
  const base = path.join(uploadsDir, 'seed-frames');
  if (!fs.existsSync(base)) return;
  const now = Date.now();
  for (const name of fs.readdirSync(base)) {
    const dir = path.join(base, name);
    try {
      const stat = fs.statSync(dir);
      if (now - stat.mtimeMs > 2 * 60 * 60 * 1000) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (_e) { /* ignore */ }
  }
}

// 업로드 영상에서 선수 지정용 후보 프레임 추출 → 프론트가 보여주고 사용자가 탭
app.post('/api/videos/seed-frames', async (req, res) => {
  try {
    const { savedFilename, fileName, count } = req.body || {};
    const filename = savedFilename || fileName;
    if (!filename) {
      res.status(400).json({ success: false, error: 'savedFilename이 필요합니다.' });
      return;
    }
    const localPath = path.join(uploadsDir, filename);
    if (!fs.existsSync(localPath)) {
      res.status(400).json({ success: false, error: '업로드된 영상을 찾을 수 없습니다. 다시 업로드해 주세요.' });
      return;
    }

    cleanupOldSeedFrames();

    const dur = await ffprobeDuration(localPath);
    const n = Math.min(16, Math.max(5, Number(count) || 10));
    const startFrac = 0.04;
    const endFrac = 0.90;
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dir = path.join(uploadsDir, 'seed-frames', token);
    fs.mkdirSync(dir, { recursive: true });

    const frames = [];
    for (let i = 0; i < n; i += 1) {
      const frac = n === 1 ? 0.5 : startFrac + (endFrac - startFrac) * (i / (n - 1));
      const t = dur > 0 ? dur * frac : i * 3;
      const out = path.join(dir, `frame-${i}.jpg`);
      try {
        await runProcess('ffmpeg', [
          '-ss', String(t),
          '-i', localPath,
          '-frames:v', '1',
          '-vf', "scale='min(1100,iw)':-2",
          '-q:v', '3',
          '-y', out,
        ]);
        if (fs.existsSync(out)) {
          frames.push({
            url: `${PUBLIC_BASE}/uploads/seed-frames/${token}/frame-${i}.jpg`,
            timeSec: Math.round(t * 10) / 10,
          });
        }
      } catch (_e) { /* 일부 프레임 실패는 건너뜀 */ }
    }

    if (!frames.length) {
      res.status(500).json({ success: false, error: '프레임을 추출하지 못했습니다.' });
      return;
    }
    res.json({ success: true, durationSec: dur, frames });
  } catch (err) {
    console.error('[seed-frames]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/jobs/extract', (req, res) => {
  const { savedFilename, fileName, player: bodyPlayer, seed: bodySeed, seeds: bodySeeds, ...rest } = req.body || {};
  const filename = savedFilename || fileName;
  if (!filename) {
    res.status(400).json({ success: false, error: 'fileName 또는 savedFilename이 필요합니다.' });
    return;
  }
  const localPath = path.join(uploadsDir, filename);
  if (!fs.existsSync(localPath)) {
    res.status(400).json({ success: false, error: '업로드된 영상을 찾을 수 없습니다. 다시 업로드해 주세요.' });
    return;
  }
  const player = normalizePlayerInput({ ...rest, player: bodyPlayer });
  const normalizedSeeds = normalizeSeedsArray(bodySeeds);
  const seedWithMulti = buildSeedPayload(bodySeed, bodySeeds);
  if (normalizedSeeds.length > 0) {
    console.log(`[extract] 수동 시드 ${normalizedSeeds.length}개 수신${rest.captureMode ? ` (${rest.captureMode})` : ''}`);
  }
  const captureMode = typeof rest.captureMode === 'string' ? rest.captureMode.trim() : null;
  const job = createJob('extract', { filename, player, seed: seedWithMulti, captureMode, srcKey: null });
  res.json({ success: true, jobId: job.id });

  (async () => {
    // 원본 영상을 R2에 백업(서버가 도중에 죽어도 재개 가능하도록)
    if (R2_ENABLED) {
      try {
        job.stage = '영상 안전 보관 중';
        job.progress = 3;
        setJob(job);
        const srcKey = `${R2_SRC_PREFIX}${crypto.randomUUID()}-${filename}`;
        await r2PutFile(srcKey, localPath, 'video/mp4');
        job.srcKey = srcKey;
        setJob(job);
      } catch (err) {
        console.warn('[R2] 원본 백업 실패(재개 불가, 분석은 계속):', err.message);
      }
    }
    await runExtractJob(job);
  })();
});

app.post('/api/jobs/match-analysis', (req, res) => {
  const {
    savedFilename,
    fileName,
    clubName,
    opponent,
    matchDate,
    grade,
    ourTeamColor,
    matchResult,
    videoCoverage,
    matchTotalMinutes,
    segmentStartMin,
    segmentEndMin,
    segmentNote,
  } = req.body || {};
  const filename = savedFilename || fileName;
  if (!filename) {
    res.status(400).json({ success: false, error: 'fileName 또는 savedFilename이 필요합니다.' });
    return;
  }
  const localPath = path.join(uploadsDir, filename);
  if (!fs.existsSync(localPath)) {
    res.status(400).json({ success: false, error: '업로드된 영상을 찾을 수 없습니다. 다시 업로드해 주세요.' });
    return;
  }

  const matchMeta = {
    clubName: clubName || '우리 팀',
    opponent: opponent || '',
    matchDate: matchDate || '',
    grade: grade || '',
    ourTeamColor: ourTeamColor || '',
    matchResult: matchResult || '',
    videoCoverage: videoCoverage || 'segment',
    matchTotalMinutes: Number(matchTotalMinutes) || 40,
    segmentStartMin: segmentStartMin != null && segmentStartMin !== '' ? Number(segmentStartMin) : undefined,
    segmentEndMin: segmentEndMin != null && segmentEndMin !== '' ? Number(segmentEndMin) : undefined,
    segmentNote: segmentNote || '',
  };

  const job = createJob('match-analysis', { filename, matchMeta, srcKey: null });
  res.json({ success: true, jobId: job.id });

  (async () => {
    if (R2_ENABLED) {
      try {
        job.stage = '영상 안전 보관 중';
        job.progress = 3;
        setJob(job);
        const srcKey = `${R2_SRC_PREFIX}${crypto.randomUUID()}-${filename}`;
        await r2PutFile(srcKey, localPath, 'video/mp4');
        job.srcKey = srcKey;
        setJob(job);
      } catch (err) {
        console.warn('[R2] match-analysis 원본 백업 실패:', err.message);
      }
    }
    await runMatchAnalysisJob(job);
  })();
});

// 스포트라이트(선수 포착) 효과 적용 작업 시작
app.post('/api/jobs/spotlight', (req, res) => {
  if (!HIGHLIGHT_FX_ENABLED || !MODAL_ENABLED) {
    res.status(503).json({ success: false, error: '스포트라이트 효과가 비활성화되어 있습니다.' });
    return;
  }
  const { clips, player: bodyPlayer, seed: bodySeed, ...rest } = req.body || {};
  const player = normalizePlayerInput({ ...rest, player: bodyPlayer });
  const seed = normalizeSeedInput(bodySeed);
  const clipObjs = (Array.isArray(clips) ? clips : [])
    .map((c) => (typeof c === 'string'
      ? { highlightVideoUrl: c }
      : { highlightVideoUrl: c.url || c.clipUrl || c.outputUrl || c.videoUrl || c.highlightVideoUrl }))
    .filter((c) => c.highlightVideoUrl);
  if (!clipObjs.length) {
    res.status(400).json({ success: false, error: '효과를 적용할 클립이 없습니다.' });
    return;
  }
  const job = createJob('spotlight');
  res.json({ success: true, jobId: job.id });

  (async () => {
    try {
      job.stage = '선수 포착 효과 적용 중';
      job.progress = 30;
      setJob(job);
      const out = await renderHighlightReel(clipObjs, player, seed);
      const jobResult = { videoUrl: out.videoUrl, outputPath: out.outputPath };
      await mirrorJobResultOutputs(jobResult);
      job.result = jobResult;
      job.status = 'done';
      job.stage = '완료';
      job.progress = 100;
      setJob(job);
    } catch (err) {
      console.error('[job/spotlight]', err);
      job.status = 'error';
      job.error = err.message;
      setJob(job);
    }
  })();
});

// 작업 상태 조회(폴링) — 메모리에 없으면 R2에서 복구
app.get('/api/jobs/:id', async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) {
    res.status(404).json({ success: false, error: '작업을 찾을 수 없습니다.' });
    return;
  }
  res.json({
    success: true,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    result: job.result,
    error: job.error,
    yoloSummary: job.yoloSummary,
    pipelineDiagnostics: job.pipelineDiagnostics || job.result?.pipelineDiagnostics || null,
  });
});

app.post('/api/lab/render-final-highlights', async (req, res) => {
    try {
    const { savedFilename, clips = [] } = req.body || {};
    if (!savedFilename) {
      res.status(400).json({ success: false, error: 'savedFilename이 필요합니다.' });
      return;
    }

        const fullPath = path.join(uploadsDir, savedFilename);
    if (!fs.existsSync(fullPath)) {
      res.status(400).json({ success: false, error: '파일 없음' });
      return;
    }

    const targetClips = clips.filter((c) => c.included !== false);
    if (!targetClips.length) {
      res.status(400).json({ success: false, error: '렌더링할 클립이 없습니다.' });
      return;
    }

        const outputName = `highlight-${Date.now()}.mp4`;
        const outputPath = path.join(highlightsDir, outputName);
    const preRendered = targetClips
      .map((clip) => clip.clipFileName)
      .filter((name) => name && fs.existsSync(path.join(highlightsDir, name)));

    if (preRendered.length === targetClips.length) {
      console.log('[FFmpeg] 개별 클립 concat으로 최종 영상 생성...');
      await concatHighlightVideos(preRendered, outputPath);
    } else {
      console.log('[FFmpeg] 원본 영상에서 직접 trim/concat...');
      await renderFinalFromSource(fullPath, targetClips, outputPath);
    }

    res.json({
      success: true,
      outputFileName: outputName,
      outputPath: `/highlights/${outputName}`,
      videoUrl: `${PUBLIC_BASE}/highlights/${outputName}`,
      clipCount: targetClips.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, error: 'API route not found' });
});

app.use((err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  res.status(500).json({
    success: false,
    error: err instanceof Error ? err.message : '서버 오류가 발생했습니다.',
  });
});

// 서버 재시작으로 중단된 추출 작업을 R2 기록에서 찾아 자동 재개
async function resumeInterruptedJobs() {
  if (!R2_ENABLED) return;
  try {
    const keys = await r2List(R2_JOB_PREFIX);
    const now = Date.now();
    for (const key of keys) {
      let job;
      try {
        job = await r2GetJson(key);
      } catch {
        continue;
      }
      if (!job || job.status !== 'running') continue;
      // 너무 오래된 작업은 재개하지 않고 실패 처리
      if (now - (job.createdAt || 0) > 60 * 60 * 1000) {
        job.status = 'error';
        job.error = '서버 재시작으로 중단됨(시간 초과)';
        setJob(job);
        continue;
      }
      // 추출 작업만 자동 재개(원본 영상이 R2에 백업된 경우)
      if (job.type === 'extract' && job.srcKey && job.filename) {
        console.log('[resume] 중단된 추출 작업 재개:', job.id);
        jobs.set(job.id, job);
        runExtractJob(job); // 백그라운드 재실행
      } else {
        job.status = 'error';
        job.error = '서버 재시작으로 중단되었습니다. 다시 시도해 주세요.';
        setJob(job);
      }
    }
  } catch (err) {
    console.warn('[resume] 중단 작업 점검 실패:', err.message);
  }
}

app.listen(PORT, () => {
  console.log(`🟢 BACKEND ON: ${PORT}`);
  resumeInterruptedJobs();
});
