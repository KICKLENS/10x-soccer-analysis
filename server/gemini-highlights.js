'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  '';

const GEMINI_MODEL =
  process.env.GEMINI_HIGHLIGHT_MODEL ||
  process.env.GEMINI_MODEL ||
  'gemini-2.0-flash';

const GEMINI_API_BASE_URL =
  process.env.GEMINI_API_BASE_URL ||
  'https://generativelanguage.googleapis.com';

const FILE_POLL_INTERVAL_MS = Number(process.env.GEMINI_FILE_POLL_INTERVAL_MS || 2000);
const FILE_POLL_TIMEOUT_MS = Number(process.env.GEMINI_FILE_POLL_TIMEOUT_MS || 180000);

const MIN_CLIP_SEC = 4;
const MAX_CLIP_SEC = 18;
const DEFAULT_CLIP_SEC = 8;

const HIGHLIGHT_SYSTEM_PROMPT = `
당신은 유소년 축구 개인 하이라이트를 추출하는 전문 비디오 분석 코치다.

가장 중요한 목표:
1. ★ 축구는 공을 골대에 넣는 스포츠 — 골대·페널티박스 순간(득점, 슛, 선방, 수비, 실점, 골 밖)을 최우선 탐색한다.
2. "선택된 선수"의 가치가 드러나는 장면만 우선 추출한다.
3. "우리 팀" 기준으로만 평가한다.
4. 상대팀 플레이를 따로 분석하지 않는다.
5. 선택 선수가 직접 관여했거나, 선택 선수의 판단/위치선정/반응/커뮤니케이션이 장면의 핵심일 때만 선택한다.
6. 득점 직전 패스·어시·빌드업 역할도 하이라이트에 포함한다.
7. 단순 볼터치, 의미 없는 패스, 맥락 없는 장면, 비슷한 장면 반복은 제외한다.
8. 최종 결과는 "하이라이트 편집용 컷 리스트"여야 하며, 경기 전체 요약문이 아니라 실제 컷 편집에 쓸 수 있어야 한다.

출력 원칙:
- 반드시 JSON만 출력한다.
- 설명은 한국어로 작성한다.
- 하이라이트는 시간 순서 기준으로 정렬 가능해야 한다.
- 각 하이라이트는 중복되지 않아야 한다.
- 너무 긴 장면보다 의미가 선명한 짧은 장면을 선호한다.
`.trim();

const HIGHLIGHT_SELECTION_RULES = `
선정 기준:
- ★ 최우선: 골대·페널티박스 결정적 순간 (득점, 득점 시도, 선방, 실점, 수비 블록/클리어, 골대 밖 슛, 득점 직전 패스·어시스트)
- 공이 골대를 향해 움직이거나 골대 앞에서 끝나는 플레이 — 선수가 관여했다면 반드시 포함
- 득점 빌드업: 골들어가기 전 패스 연결, 침투, 크로스, 2nd 볼 — 어시·전개 역할도 하이라이트
- 우리 팀/선택 선수의 강점이 분명히 드러나는 장면 우선
- 수비수/골키퍼: 실점·실점 방지, 골대 앞 수비, 선방, 커버, 차단, 라인 조율
- 미드필더: 키패스, 전개, 골 찬스 연결, 탈압박
- 공격수: 슈팅, 득점, 침투, 어시스트, 골대를 향한 움직임
- 상대팀 단독 장면은 제외
- 비슷한 장면이 여러 번 나오면 더 선명한 장면 하나만 남김
- 세트피스는 선택 선수 기여가 분명할 때만 포함
- 리플레이/슬로모션/중복 화면은 제외
- 관중/감독/벤치 컷은 제외
`.trim();

const OUTPUT_JSON_RULES = `
반드시 아래 형태의 JSON 객체 하나만 출력:
{
  "summary": "경기 전체가 아니라 선택 선수 하이라이트 관점의 간단 요약",
  "playerFocus": "선수에게 중요한 포인트 2~4문장",
  "highlights": [
    {
      "start": 12,
      "end": 20,
      "title": "짧은 장면 제목",
      "description": "왜 이 장면이 중요한지",
      "tags": ["태그1", "태그2"],
      "score": 88
    }
  ]
}

필수 규칙:
- JSON 외의 문장, 머리말, 설명, 코드블록 금지
- start / end 는 초 단위 숫자
- end > start 이어야 함
- 각 clip 길이는 대체로 4~18초
- title 은 짧고 명확하게
- description 은 1~2문장
- tags 는 1~4개
- score 는 0~100 숫자
`.trim();

const POSITION_FOCUS_RULES = {
  GK: `
골키퍼 우선 기준:
- ★ 골대 앞 유효슈팅 선방·반사 선방·1대1 선방
- 실점 상황: 위치·각도·반응·판단 (개선점 포함)
- 공이 골대 밖으로 나가게 만든 캐치·펀칭·블록
- 근거리/반사 신경 선방
- 크로스·코너 처리
- 빌드업 시작 패스
- 수비 라인 조율/지시
- 박스 장악력
`.trim(),

  DF: `
수비수 우선 기준:
- ★ 골대 앞 블록·클리어·커버·1대1 수비로 실점 방지 또는 슛 차단
- 실점/실점 위기: 수비 선택·라인·커뮤니케이션 분석
- 공을 골대 밖으로 보낸 수비(각도 줄이기, 압박)
- 인터셉트 / 차단
- 공중볼 경합 승리
- 위기 상황 클리어
- 전진 패스 / 안정적 빌드업
`.trim(),

  MF: `
미드필더 우선 기준:
- ★ 골 찬스 연결 키패스·스루패스·전개 (득점 빌드업)
- 득점 직전 어시스트·2nd 볼 처리
- 볼 회수 후 전개
- 탈압박
- 방향 전환
- 템포 조절
`.trim(),

  FW: `
공격수 우선 기준:
- ★ 슈팅·득점·득점 시도 (골대 안/밖)
- 득점 빌드업: 침투·연계·어시스트
- 골대를 향한 오프더볼 움직임
- 찬스 메이킹
- 퍼스트 터치
- 박스 안 움직임
`.trim(),

  DEFAULT: `
공통 기준:
- 선택 선수의 판단, 기술, 위치선정, 기여가 분명한 장면
- 편집용으로 가치가 높은 장면
- 비슷한 장면 반복 제외
`.trim(),
};

const HIGHLIGHT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: {
      type: 'STRING',
    },
    playerFocus: {
      type: 'STRING',
    },
    highlights: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          start: { type: 'NUMBER' },
          end: { type: 'NUMBER' },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          tags: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          score: { type: 'NUMBER' },
        },
        required: ['start', 'end', 'title', 'description', 'tags', 'score'],
      },
    },
  },
  required: ['summary', 'playerFocus', 'highlights'],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function normalizePosition(rawPosition) {
  const value = String(rawPosition || '')
    .trim()
    .toUpperCase();

  if (!value) return 'DEFAULT';

  const map = {
    GK: 'GK',
    GOALKEEPER: 'GK',
    골키퍼: 'GK',
    키퍼: 'GK',

    CB: 'DF',
    LB: 'DF',
    RB: 'DF',
    LWB: 'DF',
    RWB: 'DF',
    DF: 'DF',
    DEFENDER: 'DF',
    BACK: 'DF',
    수비수: 'DF',
    센터백: 'DF',
    풀백: 'DF',
    윙백: 'DF',

    DM: 'MF',
    CM: 'MF',
    AM: 'MF',
    CAM: 'MF',
    CDM: 'MF',
    LCM: 'MF',
    RCM: 'MF',
    MF: 'MF',
    MIDFIELDER: 'MF',
    MIDFIELD: 'MF',
    미드필더: 'MF',
    중미: 'MF',
    수미: 'MF',
    공미: 'MF',

    LW: 'FW',
    RW: 'FW',
    WF: 'FW',
    CF: 'FW',
    ST: 'FW',
    SS: 'FW',
    FW: 'FW',
    FORWARD: 'FW',
    STRIKER: 'FW',
    공격수: 'FW',
    윙어: 'FW',
    스트라이커: 'FW',
  };

  return map[value] || 'DEFAULT';
}

function getPositionFocusText(position) {
  const normalized = normalizePosition(position);
  return POSITION_FOCUS_RULES[normalized] || POSITION_FOCUS_RULES.DEFAULT;
}

function getHighlightLimits(durationSec) {
  const duration = safeNumber(durationSec, 0);

  if (duration <= 0) {
    return { min: 5, target: 7, max: 8 };
  }

  if (duration <= 8 * 60) {
    return { min: 4, target: 5, max: 6 };
  }

  if (duration <= 15 * 60) {
    return { min: 5, target: 6, max: 7 };
  }

  if (duration <= 25 * 60) {
    return { min: 6, target: 8, max: 9 };
  }

  if (duration <= 40 * 60) {
    return { min: 8, target: 10, max: 12 };
  }

  return { min: 10, target: 12, max: 14 };
}

function resolveMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    case '.mkv':
      return 'video/x-matroska';
    case '.webm':
      return 'video/webm';
    case '.m4v':
      return 'video/x-m4v';
    default:
      return 'video/mp4';
  }
}

function resolveLocalVideoPath(options = {}) {
  const candidates = [
    options.videoPath,
    options.localVideoPath,
    options.localFilePath,
    options.filePath,
    options.tempFilePath,
    options.inputPath,
    options.sourcePath,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

function parseTimeValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = String(value || '').trim();
  if (!text) return NaN;

  if (/^\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }

  const parts = text.split(':').map((part) => Number(part));
  if (parts.some((num) => !Number.isFinite(num))) return NaN;

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return NaN;
}

function normalizeTagArray(tags) {
  if (Array.isArray(tags)) {
    return Array.from(
      new Set(
        tags
          .map((tag) => String(tag || '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 4);
  }

  if (typeof tags === 'string') {
    return Array.from(
      new Set(
        tags
          .split(/[,\|/]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ).slice(0, 4);
  }

  return [];
}

function normalizeSummaryText(text, fallback = '') {
  const value = String(text || '').trim();
  return value || fallback;
}

function normalizeHighlightItem(item, index, durationSec) {
  const obj = item && typeof item === 'object' ? item : {};

  let start = safeNumber(
    parseTimeValue(obj.start ?? obj.startSec ?? obj.startTime),
    NaN,
  );
  let end = safeNumber(
    parseTimeValue(obj.end ?? obj.endSec ?? obj.endTime),
    NaN,
  );

  if (!Number.isFinite(start)) start = index * (DEFAULT_CLIP_SEC + 2);
  if (!Number.isFinite(end)) end = start + DEFAULT_CLIP_SEC;

  start = Math.max(0, start);
  end = Math.max(start + 1, end);

  let clipDuration = end - start;
  if (clipDuration < MIN_CLIP_SEC) {
    end = start + MIN_CLIP_SEC;
    clipDuration = end - start;
  }
  if (clipDuration > MAX_CLIP_SEC) {
    end = start + MAX_CLIP_SEC;
    clipDuration = end - start;
  }

  if (durationSec > 0 && end > durationSec) {
    end = durationSec;
    start = Math.max(0, end - Math.min(MAX_CLIP_SEC, Math.max(MIN_CLIP_SEC, clipDuration)));
  }

  const title = String(obj.title || obj.label || `하이라이트 ${index + 1}`).trim() || `하이라이트 ${index + 1}`;
  const description = String(obj.description || obj.reason || obj.summary || '').trim();
  const score = clamp(safeNumber(obj.score, 75), 0, 100);
  const tags = normalizeTagArray(obj.tags);

  return {
    index: index + 1,
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
    startLabel: formatTimestamp(start),
    endLabel: formatTimestamp(end),
    duration: Number((end - start).toFixed(2)),
    title,
    description,
    tags,
    score,
  };
}

function calculateOverlapRatio(a, b) {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  const overlap = Math.max(0, end - start);
  if (overlap <= 0) return 0;

  const base = Math.max(1, Math.min(a.end - a.start, b.end - b.start));
  return overlap / base;
}

function dedupeAndLimitHighlights(highlights, limits) {
  const sorted = [...highlights].sort((a, b) => {
    const scoreDiff = safeNumber(b.score, 0) - safeNumber(a.score, 0);
    if (scoreDiff !== 0) return scoreDiff;
    return a.start - b.start;
  });

  const unique = [];

  for (const item of sorted) {
    const duplicated = unique.some((existing) => {
      const overlapRatio = calculateOverlapRatio(existing, item);
      const startGap = Math.abs(existing.start - item.start);
      const titleSame =
        String(existing.title || '').trim() &&
        String(existing.title || '').trim() === String(item.title || '').trim();

      return overlapRatio >= 0.72 || startGap <= 2 || (titleSame && overlapRatio > 0.35);
    });

    if (!duplicated) {
      unique.push(item);
    }
  }

  const limited = unique
    .sort((a, b) => a.start - b.start)
    .slice(0, limits.max)
    .map((item, index) => ({
      ...item,
      index: index + 1,
      startLabel: formatTimestamp(item.start),
      endLabel: formatTimestamp(item.end),
      duration: Number((item.end - item.start).toFixed(2)),
    }));

  return limited;
}

function buildFallbackHighlights(durationSec, playerName, position, limits) {
  const duration = Math.max(safeNumber(durationSec, 0), 60);
  const count = Math.min(limits.min, 4);
  const gap = duration / (count + 1);
  const baseTitle = playerName ? `${playerName} 관여 장면` : '의미 있는 장면';

  return Array.from({ length: count }).map((_, index) => {
    const center = gap * (index + 1);
    const start = Math.max(0, center - 4);
    const end = Math.min(duration, start + DEFAULT_CLIP_SEC);

    return normalizeHighlightItem(
      {
        start,
        end,
        title: `${baseTitle} ${index + 1}`,
        description: `${position || '선수'} 관점에서 다시 확인이 필요한 장면입니다.`,
        tags: ['fallback', '검토필요'],
        score: 60 - index,
      },
      index,
      duration,
    );
  });
}

function buildHighlightPrompt({
  playerName,
  teamName,
  jerseyNumber,
  position,
  durationSec,
  limits,
}) {
  const durationText =
    durationSec > 0
      ? `${formatTimestamp(durationSec)} (${Math.round(durationSec)}초)`
      : '알 수 없음';

  const positionFocus = getPositionFocusText(position);

  return `
분석 대상:
- 선택 선수 이름: ${playerName || '미상'}
- 우리 팀: ${teamName || '미상'}
- 등번호: ${jerseyNumber || '미상'}
- 포지션: ${position || '미상'}
- 영상 길이: ${durationText}

반드시 지켜야 할 분석 방향:
1. ★ 축구는 공을 골대에 넣는 스포츠 — 골대·페널티박스 순간(득점, 슛, 선방, 수비, 실점, 골 밖)을 최우선 탐색
2. 득점/실점 직전 패스 연결·빌드업·어시스트 역할을 장면 설명에 포함
3. 우리 팀과 선택 선수 중심으로만 본다.
4. 상대팀 플레이를 따로 분석하지 않는다.
5. 선택 선수가 직접 관여했거나, 선택 선수의 판단/위치선정/반응/수비조율/빌드업 기여가 드러나는 장면만 뽑는다.
6. 단순 패스 교환, 의미 없는 터치, 비슷한 장면 반복, 애매한 장면은 제외한다.
7. 하이라이트는 편집용 컷 리스트이므로 "왜 넣어야 하는 장면인지"가 분명해야 한다.
8. 가능한 한 의미 있는 장면을 충분히 포착하되, 중복 없이 선별한다.
9. 장면 개수는 너무 적게 잡지 말고, 영상 길이에 맞게 ${limits.min}개 이상 ${limits.max}개 이하로 뽑아라.
10. 목표 개수는 약 ${limits.target}개다.
11. 골대 앞 결정적 순간이 영상에 있다면 highlights에 **최소 1개** 반드시 포함 (선수 관여 시).
12. 각 장면은 4~18초 중심으로 제안한다.
13. summary와 playerFocus는 경기 전체 총평이 아니라 선택 선수의 하이라이트 편집 관점 요약이어야 한다.

${HIGHLIGHT_SELECTION_RULES}

포지션별 우선 기준:
${positionFocus}

${OUTPUT_JSON_RULES}
`.trim();
}

function buildCompactRetryPrompt({
  playerName,
  teamName,
  jerseyNumber,
  position,
  durationSec,
  limits,
  previousReason,
}) {
  const durationText =
    durationSec > 0
      ? `${formatTimestamp(durationSec)} (${Math.round(durationSec)}초)`
      : '알 수 없음';

  const positionFocus = getPositionFocusText(position);

  return `
이전 응답은 길이 초과 또는 JSON 잘림 문제가 있었다.
이번에는 같은 기준을 유지하되 더 간결하게 JSON만 출력하라.

이전 문제:
${previousReason || '응답 잘림 또는 JSON 파싱 실패'}

분석 대상:
- 선수: ${playerName || '미상'}
- 우리 팀: ${teamName || '미상'}
- 등번호: ${jerseyNumber || '미상'}
- 포지션: ${position || '미상'}
- 영상 길이: ${durationText}

핵심 규칙:
- 우리 팀/선택 선수 중심
- 상대팀 단독 장면 제외
- 선택 선수 기여가 분명한 장면만
- 중복 장면 제외
- ${limits.min}개 이상 ${limits.max}개 이하
- title 짧게
- description 1문장
- tags 최대 3개
- JSON 외 아무 것도 출력 금지

포지션 우선 기준:
${positionFocus}

${OUTPUT_JSON_RULES}
`.trim();
}

function buildCoverageRetryPrompt({
  playerName,
  teamName,
  jerseyNumber,
  position,
  durationSec,
  limits,
  previousCount,
}) {
  const durationText =
    durationSec > 0
      ? `${formatTimestamp(durationSec)} (${Math.round(durationSec)}초)`
      : '알 수 없음';

  const positionFocus = getPositionFocusText(position);

  return `
직전 결과의 하이라이트 개수(${previousCount || 0}개)가 영상 길이에 비해 너무 적었다.
겹치지 않는 의미 있는 장면을 더 넓게 찾아서 다시 JSON만 출력하라.

분석 대상:
- 선수: ${playerName || '미상'}
- 우리 팀: ${teamName || '미상'}
- 등번호: ${jerseyNumber || '미상'}
- 포지션: ${position || '미상'}
- 영상 길이: ${durationText}

반드시 지킬 것:
- 우리 팀/선택 선수 중심
- 상대팀 단독 장면 제외
- 선택 선수의 직접 관여 또는 핵심 기여가 있는 장면만
- 너무 비슷한 장면은 제외
- 이번에는 최소 ${limits.min}개, 가능하면 ${limits.target}개 전후로 확보
- 장면 길이는 4~18초
- description은 짧고 분명하게

포지션 우선 기준:
${positionFocus}

${OUTPUT_JSON_RULES}
`.trim();
}

function extractFinishReason(responseJson) {
  return (
    responseJson?.candidates?.[0]?.finishReason ||
    responseJson?.candidates?.[0]?.finish_reason ||
    ''
  );
}

function extractModelVersion(responseJson) {
  return (
    responseJson?.modelVersion ||
    responseJson?.model ||
    responseJson?.usageMetadata?.model ||
    ''
  );
}

function extractRawText(responseJson) {
  const candidate = responseJson?.candidates?.[0];
  const parts = candidate?.content?.parts;

  if (Array.isArray(parts)) {
    const texts = parts
      .map((part) => {
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean);

    if (texts.length) return texts.join('\n').trim();
  }

  if (typeof responseJson?.text === 'string') {
    return responseJson.text.trim();
  }

  return '';
}

function stripCodeFence(text) {
  const value = String(text || '').trim();
  if (!value) return '';

  const fenceMatch = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  return value;
}

function extractBalancedJsonSlice(text) {
  const source = String(text || '');
  if (!source) return '';

  let startIndex = -1;
  let stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (startIndex === -1) {
      if (ch === '{' || ch === '[') {
        startIndex = i;
        stack = [ch];
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }

    if (ch === '}' || ch === ']') {
      const last = stack[stack.length - 1];
      if (
        (ch === '}' && last === '{') ||
        (ch === ']' && last === '[')
      ) {
        stack.pop();
      }

      if (stack.length === 0 && startIndex !== -1) {
        return source.slice(startIndex, i + 1).trim();
      }
    }
  }

  return '';
}

function autoCloseJson(text) {
  const source = String(text || '').trim();
  if (!source) return '';

  let inString = false;
  let escaped = false;
  const stack = [];

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      const last = stack[stack.length - 1];
      if (
        (ch === '}' && last === '{') ||
        (ch === ']' && last === '[')
      ) {
        stack.pop();
      }
    }
  }

  if (inString) {
    return '';
  }

  const closers = [];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    closers.push(stack[i] === '{' ? '}' : ']');
  }

  return `${source}${closers.join('')}`;
}

function isLikelyTruncated(rawText, finishReason) {
  const text = String(rawText || '').trim();
  if (!text) return true;

  if (finishReason && finishReason !== 'STOP') {
    return true;
  }

  const stripped = stripCodeFence(text);

  if (/,\s*$/.test(stripped)) return true;
  if (/"highlights"\s*:\s*\[\s*$/.test(stripped)) return true;
  if (/\{\s*$/.test(stripped)) return true;
  if (/\[\s*$/.test(stripped)) return true;

  const balancedSlice = extractBalancedJsonSlice(stripped);
  return !balancedSlice && stripped.startsWith('{');
}

function parseGeminiJson(rawText) {
  const attempts = [];

  const stripped = stripCodeFence(rawText);
  if (stripped) attempts.push(stripped);

  const balanced = extractBalancedJsonSlice(stripped);
  if (balanced) attempts.push(balanced);

  const autoClosed = autoCloseJson(stripped);
  if (autoClosed) attempts.push(autoClosed);

  const autoClosedBalanced = extractBalancedJsonSlice(autoClosed);
  if (autoClosedBalanced) attempts.push(autoClosedBalanced);

  const uniqueAttempts = Array.from(new Set(attempts.filter(Boolean)));

  let lastError = null;

  for (const candidate of uniqueAttempts) {
    try {
      const parsed = JSON.parse(candidate);
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Gemini JSON 응답 파싱 실패');
}

function validateParsedResult(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini 응답이 JSON 객체가 아닙니다.');
  }

  if (!Array.isArray(parsed.highlights)) {
    throw new Error('Gemini JSON 응답에 highlights 배열이 없습니다.');
  }

  return true;
}

async function geminiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { rawText: text };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      text ||
      `Gemini API 요청 실패 (HTTP ${response.status})`;

    const err = new Error(message);
    err.status = response.status;
    err.payload = data;
    throw err;
  }

  return {
    response,
    data,
  };
}

async function startResumableUpload(filePath, mimeType) {
  const fileSize = fs.statSync(filePath).size;
  const fileName = path.basename(filePath);

  const url = `${GEMINI_API_BASE_URL}/upload/v1beta/files?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const { response } = await geminiFetch(url, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(fileSize),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: {
        display_name: fileName,
      },
    }),
  });

  const uploadUrl = response.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Gemini 업로드 URL을 받지 못했습니다.');
  }

  return uploadUrl;
}

async function uploadBytesToGemini(uploadUrl, filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);

  const { data } = await geminiFetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type': mimeType,
    },
    body: buffer,
  });

  const file = data?.file || data;
  if (!file?.name) {
    throw new Error('Gemini 파일 업로드 응답에 file.name 이 없습니다.');
  }

  return file;
}

async function waitForGeminiFileReady(fileName) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < FILE_POLL_TIMEOUT_MS) {
    const url = `${GEMINI_API_BASE_URL}/v1beta/${fileName}?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const { data } = await geminiFetch(url, { method: 'GET' });

    const file = data?.file || data;
    const state = String(file?.state || '').toUpperCase();

    if (state === 'ACTIVE') {
      return file;
    }

    if (state === 'FAILED' || state === 'ERROR') {
      throw new Error(`Gemini 파일 처리 실패: ${state}`);
    }

    await sleep(FILE_POLL_INTERVAL_MS);
  }

  throw new Error('Gemini 파일 준비 대기 시간이 초과되었습니다.');
}

async function uploadVideoToGemini(localVideoPath) {
  const mimeType = resolveMimeType(localVideoPath);
  const uploadUrl = await startResumableUpload(localVideoPath, mimeType);
  const uploaded = await uploadBytesToGemini(uploadUrl, localVideoPath, mimeType);
  const readyFile = await waitForGeminiFileReady(uploaded.name);

  return {
    name: readyFile.name,
    uri: readyFile.uri,
    mimeType: readyFile.mime_type || readyFile.mimeType || mimeType,
    sizeBytes: readyFile.size_bytes || readyFile.sizeBytes || fs.statSync(localVideoPath).size,
    displayName: readyFile.display_name || readyFile.displayName || path.basename(localVideoPath),
  };
}

async function requestGeminiHighlightJson({
  geminiFile,
  prompt,
  maxOutputTokens = 4096,
  temperature = 0.2,
}) {
  const url = `${GEMINI_API_BASE_URL}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: HIGHLIGHT_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            file_data: {
              mime_type: geminiFile.mimeType,
              file_uri: geminiFile.uri,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature,
      topP: 0.95,
      topK: 32,
      maxOutputTokens,
      candidateCount: 1,
      responseMimeType: 'application/json',
      responseSchema: HIGHLIGHT_RESPONSE_SCHEMA,
    },
  };

  const { data } = await geminiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return {
    rawText: extractRawText(data),
    finishReason: extractFinishReason(data),
    model: extractModelVersion(data) || GEMINI_MODEL,
    rawResponse: data,
  };
}

function normalizeParsedResult(parsed, durationSec, limits) {
  validateParsedResult(parsed);

  const highlights = parsed.highlights
    .map((item, index) => normalizeHighlightItem(item, index, durationSec))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);

  const deduped = dedupeAndLimitHighlights(highlights, limits);

  return {
    summary: normalizeSummaryText(
      parsed.summary,
      '선택 선수의 관여 장면을 중심으로 주요 하이라이트를 정리했습니다.',
    ),
    playerFocus: normalizeSummaryText(
      parsed.playerFocus,
      '선택 선수의 강점이 드러나는 장면과 보완 포인트를 함께 확인할 수 있습니다.',
    ),
    highlights: deduped,
  };
}

function chooseBetterResult(currentBest, candidateResult, limits) {
  if (!candidateResult) return currentBest;
  if (!currentBest) return candidateResult;

  const currentCount = currentBest.highlights.length;
  const candidateCount = candidateResult.highlights.length;

  const currentPenalty = Math.abs(limits.target - currentCount);
  const candidatePenalty = Math.abs(limits.target - candidateCount);

  if (candidateCount >= limits.min && currentCount < limits.min) return candidateResult;
  if (candidatePenalty < currentPenalty) return candidateResult;
  if (candidateCount > currentCount) return candidateResult;

  return currentBest;
}

async function analyzeHighlightsWithGemini(options = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY 또는 GOOGLE_API_KEY 환경변수가 필요합니다.');
  }

  const player = options.player && typeof options.player === 'object' ? options.player : {};

  const playerName = String(
    options.playerName ||
      player.name ||
      options.name ||
      '',
  ).trim();

  const teamName = String(
    options.teamName ||
      player.teamName ||
      options.team ||
      '',
  ).trim();

  const jerseyNumber = String(
    options.jerseyNumber ||
      player.jerseyNumber ||
      options.backNumber ||
      '',
  ).trim();

  const position = String(
    options.position ||
      player.position ||
      '',
  ).trim();

  const durationSec = safeNumber(
    options.videoDurationSec ||
      options.durationSec ||
      options.duration ||
      0,
    0,
  );

  const limits = getHighlightLimits(durationSec);

  const localVideoPath = resolveLocalVideoPath(options);

  let geminiFile = null;
  if (options.geminiFileUri) {
    geminiFile = {
      name: String(options.geminiFileName || '').trim(),
      uri: String(options.geminiFileUri || '').trim(),
      mimeType: String(options.geminiMimeType || 'video/mp4').trim(),
      displayName: String(options.geminiFileDisplayName || '').trim(),
    };
  } else {
    if (!localVideoPath) {
      throw new Error('Gemini 분석용 로컬 영상 경로를 찾지 못했습니다.');
    }
    geminiFile = await uploadVideoToGemini(localVideoPath);
  }

  const prompts = [
    {
      name: 'primary',
      prompt: buildHighlightPrompt({
        playerName,
        teamName,
        jerseyNumber,
        position,
        durationSec,
        limits,
      }),
      maxOutputTokens: 4096,
      temperature: 0.2,
    },
    {
      name: 'compact-retry',
      prompt: buildCompactRetryPrompt({
        playerName,
        teamName,
        jerseyNumber,
        position,
        durationSec,
        limits,
        previousReason: '응답이 잘렸거나 JSON이 끝까지 닫히지 않음',
      }),
      maxOutputTokens: 3072,
      temperature: 0.15,
    },
  ];

  let bestResult = null;
  let lastRawText = '';
  let lastFinishReason = '';
  let lastModel = GEMINI_MODEL;
  let lastError = null;

  for (const attempt of prompts) {
    try {
      const response = await requestGeminiHighlightJson({
        geminiFile,
        prompt: attempt.prompt,
        maxOutputTokens: attempt.maxOutputTokens,
        temperature: attempt.temperature,
      });

      lastRawText = response.rawText || '';
      lastFinishReason = response.finishReason || '';
      lastModel = response.model || GEMINI_MODEL;

      if (isLikelyTruncated(lastRawText, lastFinishReason)) {
        lastError = new Error(
          `Gemini JSON 응답 실패: 응답이 잘렸습니다. finishReason=${lastFinishReason || 'UNKNOWN'}`,
        );
        continue;
      }

      const parsed = parseGeminiJson(lastRawText);
      const normalized = normalizeParsedResult(parsed, durationSec, limits);

      bestResult = chooseBetterResult(bestResult, normalized, limits);

      if (normalized.highlights.length >= limits.min && lastFinishReason === 'STOP') {
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (bestResult && bestResult.highlights.length < limits.min) {
    try {
      const coverageRetry = await requestGeminiHighlightJson({
        geminiFile,
        prompt: buildCoverageRetryPrompt({
          playerName,
          teamName,
          jerseyNumber,
          position,
          durationSec,
          limits,
          previousCount: bestResult.highlights.length,
        }),
        maxOutputTokens: 4096,
        temperature: 0.2,
      });

      lastRawText = coverageRetry.rawText || lastRawText;
      lastFinishReason = coverageRetry.finishReason || lastFinishReason;
      lastModel = coverageRetry.model || lastModel;

      if (!isLikelyTruncated(lastRawText, lastFinishReason)) {
        const parsed = parseGeminiJson(lastRawText);
        const normalized = normalizeParsedResult(parsed, durationSec, limits);
        bestResult = chooseBetterResult(bestResult, normalized, limits);
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!bestResult || !bestResult.highlights.length) {
    const fallback = buildFallbackHighlights(durationSec, playerName, position, limits);

    if (!fallback.length) {
      const preview = String(lastRawText || '').slice(0, 600);
      throw new Error(
        `Gemini JSON 응답 실패: ${lastError?.message || '하이라이트를 생성하지 못했습니다.'}\n${preview}`,
      );
    }

    bestResult = {
      summary: '모델 응답이 불안정하여 기본 검토용 장면 목록을 생성했습니다.',
      playerFocus: '자동 추출 응답이 불완전하여 검토용 기본 장면이 포함되었습니다.',
      highlights: fallback,
    };
  }

  return {
    success: true,
    model: lastModel,
    finishReason: lastFinishReason || 'STOP',
    uploadedFileName: geminiFile.displayName || geminiFile.name || path.basename(localVideoPath || 'video'),
    uploadedFileUri: geminiFile.uri,
    videoDurationSec: durationSec || undefined,
    totalCandidatesReviewed: bestResult.highlights.length,
    summary: bestResult.summary,
    playerFocus: bestResult.playerFocus,
    highlights: bestResult.highlights,
    rawText: lastRawText,
  };
}

module.exports = {
  analyzeHighlightsWithGemini,
  formatTimestamp,
  normalizePosition,
  HIGHLIGHT_SYSTEM_PROMPT,
  HIGHLIGHT_SELECTION_RULES,
  OUTPUT_JSON_RULES,
  POSITION_FOCUS_RULES,
};
