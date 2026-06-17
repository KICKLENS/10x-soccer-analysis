import express from 'express';

const router = express.Router();

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

  res.json({
    success: true,
    source: 'default',
    message: 'Lab extract-highlights endpoint connected successfully.',
    received: {
      fileName,
    },
    highlightVideoUrl: '',
    clips: mockClips,
  });
});

router.post('/extract-highlights-yolo', (req, res) => {
  const { fileName = 'lab-demo-video.mp4' } = req.body || {};

  res.json({
    success: true,
    source: 'yolo',
    message: 'Lab extract-highlights-yolo endpoint connected successfully.',
    received: {
      fileName,
    },
    highlightVideoUrl: '',
    clips: [],
  });
});

router.post('/analyze-highlights-gemini', (req, res) => {
  const { fileName = 'lab-demo-video.mp4', clips = [] } = req.body || {};

  res.json({
    success: true,
    source: 'gemini',
    message: 'Lab analyze-highlights-gemini endpoint connected successfully.',
    received: {
      fileName,
      clipCount: Array.isArray(clips) ? clips.length : 0,
    },
    analysis: [],
  });
});

router.post('/score-highlight-candidates', (req, res) => {
  const { fileName = 'lab-demo-video.mp4', candidates = [] } = req.body || {};

  res.json({
    success: true,
    source: 'hybrid',
    message: 'Lab score-highlight-candidates endpoint connected successfully.',
    received: {
      fileName,
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
    },
    scoredCandidates: [],
  });
});

export default router;
