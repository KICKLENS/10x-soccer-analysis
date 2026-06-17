import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_BIN = 'python3';
const YOLO_SCRIPT_PATH = path.resolve(__dirname, '../../yolo-service/detect_ball.py');
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const mockClips = [
  {
    id: 'clip-001',
    startTime: '00:12',
    endTime: '00:20',
    label: '공격 전개 장면',
    score: 0.82,
    reason: '전방 압박 이후 빠른 공격 전환이 감지된 테스트 구간',
  },
  {
    id: 'clip-002',
    startTime: '01:08',
    endTime: '01:16',
    label: '슈팅 시도 장면',
    score: 0.91,
    reason: '페널티 박스 근처에서 슈팅성 장면으로 가정한 테스트 구간',
  },
  {
    id: 'clip-003',
    startTime: '02:03',
    endTime: '02:11',
    label: '위험 지역 침투 장면',
    score: 0.87,
    reason: '하프스페이스 침투 후 크로스/찬스 생성 상황으로 가정한 테스트 구간',
  },
];

function runYoloDetect(fileName) {
  return new Promise((resolve, reject) => {
    if (!fileName) {
      reject(new Error('fileName is required.'));
      return;
    }

    const videoPath = path.resolve(UPLOADS_DIR, fileName);

    if (!fs.existsSync(videoPath)) {
      reject(new Error(`Uploaded video not found: ${videoPath}`));
      return;
    }

    if (!fs.existsSync(YOLO_SCRIPT_PATH)) {
      reject(new Error(`detect_ball.py not found: ${YOLO_SCRIPT_PATH}`));
      return;
    }

    const args = [
      YOLO_SCRIPT_PATH,
      videoPath,
      '--top-k',
      '15',
    ];

    const child = spawn(PYTHON_BIN, args, {
      cwd: path.resolve(__dirname, '../../yolo-service'),
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
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `YOLO process failed with code ${code}${stderr ? ` | stderr: ${stderr}` : ''}`
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse YOLO JSON output. stdout preview: ${stdout.slice(0, 500)}`
          )
        );
      }
    });
  });
}

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Lab API is running',
    routes: [
      'GET /api/lab/health',
      'POST /api/lab/extract-highlights',
      'POST /api/lab/extract-highlights-yolo',
      'POST /api/lab/analyze-highlights-gemini',
      'POST /api/lab/score-highlight-candidates',
    ],
  });
});

router.post('/extract-highlights', (req, res) => {
  const { fileName = 'lab-demo-video.mp4' } = req.body || {};

  res.json({
    success: true,
    source: 'default',
    message: 'Lab extract-highlights endpoint connected successfully.',
    received: {
      fileName,
    },
    fileName,
    highlightVideoUrl: '',
    clips: mockClips,
  });
});

router.post('/extract-highlights-yolo', async (req, res) => {
  try {
    const { fileName = '' } = req.body || {};

    if (!fileName) {
      return res.status(400).json({
        success: false,
        source: 'yolo',
        message: 'fileName is required.',
        clips: [],
      });
    }

    const yoloResult = await runYoloDetect(fileName);

    return res.json({
      ...yoloResult,
      success: true,
      source: 'yolo',
      message: 'YOLO python analysis completed via detect_ball.py.',
      received: {
        fileName,
      },
      fileName: yoloResult?.fileName || fileName,
      highlightVideoUrl: '',
    });
  } catch (error) {
    console.error('[LAB YOLO ERROR]', error);

    return res.status(500).json({
      success: false,
      source: 'yolo',
      message: 'Failed to run detect_ball.py.',
      error: error instanceof Error ? error.message : 'Unknown error',
      clips: [],
    });
  }
});

router.post('/analyze-highlights-gemini', (req, res) => {
  try {
    const { fileName = '', clips = [] } = req.body || {};

    if (!Array.isArray(clips) || clips.length === 0) {
      return res.status(400).json({
        success: false,
        source: 'gemini',
        message: 'clips array is required.',
        analyzedCount: 0,
        clips: [],
      });
    }

    const analyzedClips = clips.map((clip, index) => {
      const baseScore = typeof clip.score === 'number' ? clip.score : 0;
      const interactionFrames =
        typeof clip.interactionFrames === 'number' ? clip.interactionFrames : 0;
      const framesMatched =
        typeof clip.framesMatched === 'number' ? clip.framesMatched : 0;
      const avgBallConfidence =
        typeof clip.avgBallConfidence === 'number' ? clip.avgBallConfidence : 0;
      const ballDetectionsCount =
        typeof clip.ballDetectionsCount === 'number'
          ? clip.ballDetectionsCount
          : typeof clip.avgBallCount === 'number'
          ? clip.avgBallCount
          : 0;

      const importanceScore = Number(
        Math.min(
          9.8,
          Math.max(
            6.5,
            baseScore * 7 +
              interactionFrames * 0.08 +
              framesMatched * 0.03 +
              avgBallConfidence * 1.5
          )
        ).toFixed(1)
      );

      let category = 'general-play';

      if (importanceScore >= 9.4) {
        category = 'high-impact';
      } else if (interactionFrames >= 10) {
        category = 'sustained-attack';
      } else if (avgBallConfidence >= 0.7) {
        category = 'clear-ball-involvement';
      } else if (framesMatched >= 8) {
        category = 'build-up-play';
      }

      const summary =
        category === 'high-impact'
          ? '연속적인 공 관여와 높은 상호작용이 나타난 핵심 장면'
          : category === 'sustained-attack'
          ? '공 소유와 움직임이 일정 시간 유지된 공격 전개 장면'
          : category === 'clear-ball-involvement'
          ? '공이 비교적 선명하게 포착된 의미 있는 관여 장면'
          : '후속 검토 가치가 있는 일반 플레이 장면';

      const whyImportant =
        interactionFrames >= 8
          ? '선수와 공의 상호작용 프레임이 많아 실제 하이라이트 후보로 볼 가능성이 높음'
          : avgBallConfidence >= 0.6
          ? '공 탐지 신뢰도가 비교적 높아 장면 해석의 안정성이 있음'
          : '기본 점수와 공 관여 정보 기준으로 후속 검토 가치가 있음';

      const coachComment =
        interactionFrames >= 10
          ? '이 장면은 볼 터치 이후 다음 선택과 움직임을 함께 복기하면 좋습니다.'
          : framesMatched >= 8
          ? '연속 플레이 흐름을 기준으로 위치 선정과 판단 속도를 확인해 보세요.'
          : '짧은 장면이므로 첫 터치와 다음 동작 연결성을 중점적으로 보면 좋습니다.';

      return {
        ...clip,
        importanceScore,
        summary,
        whyImportant,
        category,
        coachComment,
        geminiRank: index + 1,
      };
    });

    const sortedClips = analyzedClips.sort(
      (a, b) => (b.importanceScore || 0) - (a.importanceScore || 0)
    );

    return res.json({
      success: true,
      source: 'gemini',
      message: 'Lab analyze-highlights-gemini completed successfully.',
      fileName,
      analyzedCount: sortedClips.length,
      summary: {
        inputClipCount: clips.length,
        outputClipCount: sortedClips.length,
        topImportanceScore: sortedClips[0]?.importanceScore ?? null,
      },
      clips: sortedClips,
    });
  } catch (error) {
    console.error('[LAB GEMINI ERROR]', error);

    return res.status(500).json({
      success: false,
      source: 'gemini',
      message: 'Failed to analyze highlight clips with Gemini mock logic.',
      error: error instanceof Error ? error.message : 'Unknown error',
      analyzedCount: 0,
      clips: [],
    });
  }
});

router.post('/score-highlight-candidates', (req, res) => {
  const { clips = [] } = req.body || {};

  res.json({
    success: true,
    source: 'hybrid',
    message: 'Lab score-highlight-candidates endpoint connected successfully.',
    scoredCount: Array.isArray(clips) ? clips.length : 0,
    clips: Array.isArray(clips)
      ? clips.map((clip, index) => ({
          ...clip,
          finalScore: Number((0.75 + index * 0.02).toFixed(2)),
        }))
      : [],
  });
});

export default router;