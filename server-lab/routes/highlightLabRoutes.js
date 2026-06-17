import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from "@google/generative-ai/server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// ── 헬퍼: 영상 파일 로컬 경로 확인 ──────────────────────────────────────────
function resolveVideoPath(videoPath, savedFilename) {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (savedFilename) {
    const p = path.join(uploadsDir, savedFilename);
    if (fs.existsSync(p)) return p;
  }
  if (videoPath) {
    const fileName = path.basename(videoPath.split('?')[0].split('#')[0]);
    const p = path.join(uploadsDir, fileName);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── 핵심 로직: 모델 Fallback 시스템 ──────────────────────────────────────────
async function generateContentWithFallback(genAI, prompt, fileData = null) {
  // 시도할 모델 리스트 (가장 호환성 높은 순서)
  const candidateModels = [
    "gemini-1.5-flash-latest", 
    "gemini-1.5-flash", 
    "gemini-1.5-pro-latest", 
    "gemini-1.5-pro"
  ];
  
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      console.log(`[Gemini] 모델 시도 중: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const contentPayload = [];
      if (fileData) contentPayload.push({ fileData });
      contentPayload.push({ text: prompt });

      const result = await model.generateContent(contentPayload);
      const response = await result.response;
      return response.text();
    } catch (err) {
      console.warn(`[Gemini] ${modelName} 모델 접근 실패: ${err.message}`);
      lastError = err;
      continue; // 다음 모델로 재시도
    }
  }
  throw new Error(`모든 Gemini 모델 호출에 실패했습니다. 마지막 오류: ${lastError.message}`);
}

// ── 헬퍼: Gemini 영상 업로드 ────────────────────────────────────
async function processVideoWithGemini(apiKey, actualPath, displayName) {
  const fileManager = new GoogleAIFileManager(apiKey);
  console.log(`[Gemini] 영상 파일 업로드 시작: ${actualPath}`);
  
  const uploadResponse = await fileManager.uploadFile(actualPath, {
    mimeType: "video/mp4",
    displayName: displayName || "soccer_analysis",
  });

  let file = await fileManager.getFile(uploadResponse.file.name);
  while (file.state === "PROCESSING") {
    process.stdout.write(".");
    await sleep(5000);
    file = await fileManager.getFile(uploadResponse.file.name);
  }

  if (file.state === "FAILED") throw new Error("Gemini 영상 처리 실패");
  return file;
}

// ── 1. Health Check ──────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Lab API is active',
    geminiKey: !!process.env.GEMINI_API_KEY
  });
});

// ── 2. Extract Highlights (Fallback 로직 적용) ──────────────────────────
router.post('/extract-highlights', async (req, res) => {
  const { videoPath, savedFilename, position } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Gemini API Key missing' });
  const actualPath = resolveVideoPath(videoPath, savedFilename);
  if (!actualPath) return res.status(400).json({ error: 'Video file not found' });

  try {
    const file = await processVideoWithGemini(apiKey, actualPath, savedFilename);
    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `당신은 축구 전문가입니다. 영상을 보고 "${position || '골키퍼'}" 선수의 주요 장면 5~8개를 골라 한국어 JSON으로만 답하세요. 마크다운 없이 순수 JSON만.
    형식: {"clips": [{"id": "clip-001", "startSec": 10, "endSec": 18, "startTime": "00:10", "endTime": "00:18", "label": "제목", "reason": "이유"}]}`;

    const text = await generateContentWithFallback(genAI, prompt, { mimeType: file.mimeType, fileUri: file.uri });
    
    let cleanedText = text.trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanedText = jsonMatch[0];

    const parsed = JSON.parse(cleanedText);
    res.json({ success: true, clips: parsed.clips });
  } catch (error) {
    console.error('[Extract Error]', error);
    res.status(500).json({ error: '장면 추출 실패: ' + error.message });
  }
});

// ── 3. Analyze Highlights (Fallback 로직 적용) ──────────────────────────
router.post('/analyze-highlights-gemini', async (req, res) => {
  const { clips, position, videoPath, savedFilename } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const actualPath = resolveVideoPath(videoPath, savedFilename);
    const file = await processVideoWithGemini(apiKey, actualPath, "analysis");
    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `영상을 정밀 분석하여 "${position}" 선수의 장면들에 대해 한국어 JSON으로만 답하세요. 마크다운 없이 JSON만.
    대상 구간: ${JSON.stringify(clips.map(c => c.id + ": " + c.startTime + "~" + c.endTime))}
    형식: {"summary": {"noticeableScene": "..", "strength": "..", "weakness": "..", "trainingPoint": "..", "nextTrainingPoint": ".."}, "clips": [{"id": "clip-001", "coachComment": "..", "importanceScore": 90}]}`;

    const text = await generateContentWithFallback(genAI, prompt, { mimeType: file.mimeType, fileUri: file.uri });

    let cleanedText = text.trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanedText = jsonMatch[0];

    const parsed = JSON.parse(cleanedText);
    const fileManager = new GoogleAIFileManager(apiKey);
    await fileManager.deleteFile(file.name);

    const finalClips = (clips || []).map(clip => {
      const aiData = (parsed.clips || []).find(c => c.id === clip.id);
      return { ...clip, ...aiData };
    });
    res.json({ success: true, summary: parsed.summary, clips: finalClips });
  } catch (error) {
    console.error('[Analysis Error]', error);
    res.status(500).json({ error: '분석 중 오류: ' + error.message });
  }
});

// ── 나머지 라우트: YOLO, Score, Render (안정 버전) ───────────────────────────
router.post('/extract-highlights-yolo', (req, res) => res.json({ success: true, clips: req.body.clips }));
router.post('/score-highlight-candidates', (req, res) => res.json({ success: true, clips: req.body.clips }));

router.post('/render-final-highlights', async (req, res) => {
  const { videoPath, savedFilename, clips, selectedClips } = req.body;
  const actualPath = resolveVideoPath(videoPath, savedFilename);
  if (!actualPath) return res.status(400).json({ error: '파일 없음' });

  const highlightsDir = path.join(process.cwd(), 'highlights');
  if (!fs.existsSync(highlightsDir)) fs.mkdirSync(highlightsDir);

  const outputFilename = `highlight-${Date.now()}.mp4`;
  const outputPath = path.join(highlightsDir, outputFilename);
  const clipsToRender = (selectedClips || clips || []).filter(c => c.included !== false);

  try {
    const inputs = []; 
    clipsToRender.forEach(() => inputs.push('-i', actualPath));
    const filterParts = clipsToRender.map((c, i) => `[${i}:v]trim=start=${c.startSec}:end=${c.endSec},setpts=PTS-STARTPTS,scale=1280:720[v${i}]`);
    const filterComplex = filterParts.join(';') + ';' + clipsToRender.map((_, i) => `[v${i}]`).join('') + `concat=n=${clipsToRender.length}:v=1:a=0[out]`;

    const proc = spawn('ffmpeg', [...inputs, '-filter_complex', filterComplex, '-map', '[out]', '-c:v', 'libx264', '-preset', 'ultrafast', '-y', outputPath]);
    proc.on('close', (code) => {
      if (code === 0) res.json({ success: true, outputFileName: outputFilename, outputPath: `/highlights/${outputFilename}` });
      else res.status(500).json({ error: '렌더링 실패' });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
