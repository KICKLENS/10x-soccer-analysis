import React, { useMemo } from 'react';

// ── Props Interface ───────────────────────────────────────────────────────
interface Clip {
  id: string;
  startTime?: string;
  endTime?: string;
  startSec?: number;
  endSec?: number;
  label?: string;
  reason?: string;
  whyImportant?: string;
  included?: boolean;
  finalScore?: number;
  importanceScore?: number;
  yoloScore?: number;
  coachComment?: string;
}

interface Summary {
  noticeableScene?: string;
  strength?: string;
  weakness?: string;
  trainingPoint?: string;
  nextTrainingPoint?: string;
}

interface RenderResult {
  outputFileName?: string;
  outputPath?: string;
  success?: boolean;
}

interface Props {
  selectedFile: File | null;
  uploadedSource: string;
  savedFilename: string;
  healthResult: any;
  clips: any[];
  geminiResult: {
    success?: boolean;
    summary?: Summary;
    clips?: any[];
  } | null;
  renderResult: RenderResult | null;
  selectedPosition: string;
  selectedCriteria: string[];
  recommendedSceneCount: number;
  onSelectFile: () => void;
  onReupload: () => void;
  onStartAnalysis: () => void;
  onIncludeAll: () => void;
  onExcludeAll: () => void;
  onToggleClip: (clipId: string) => void;
  onGenerateFinal: () => void;
  onRegenerateFinal: () => void;
}

// ── Helper: 시간 포맷 ─────────────────────────────────────────────────────
function formatTime(sec: number | undefined): string {
  if (sec == null) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Section 1: 헤더 + 업로드 카드 ─────────────────────────────────────────
function AnalysisHeader({
  selectedFile,
  healthResult,
  onSelectFile,
  onReupload,
  onStartAnalysis,
}: {
  selectedFile: File | null;
  healthResult: any;
  onSelectFile: () => void;
  onReupload: () => void;
  onStartAnalysis: () => void;
}) {
  const isHealthy = healthResult?.success === true;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">영상 분석 Lab</h1>
          <p className="mt-1 text-sm text-slate-500">하이라이트 추출 → AI 코치 분석 → 최종 영상 생성</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
            isHealthy ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}>
            <span className={`h-2 w-2 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-slate-400'}`} />
            {isHealthy ? '서버 연결됨' : '서버 미연결'}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        {selectedFile ? (
          <>
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2">
              <span className="text-sm text-slate-600">선택된 파일:</span>
              <span className="font-medium text-slate-800">{selectedFile.name}</span>
            </div>
            <button
              onClick={onReupload}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              파일 다시 선택
            </button>
          </>
        ) : (
          <button
            onClick={onSelectFile}
            className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-4 text-sm font-medium text-slate-500 transition hover:border-slate-400 hover:bg-slate-100"
          >
            영상 파일 선택 (.mp4, .mov, .avi)
          </button>
        )}

        {selectedFile && (
          <button
            onClick={onStartAnalysis}
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            분석 시작
          </button>
        )}
      </div>
    </div>
  );
}

// ── Section 2: 분석 설정 카드 ─────────────────────────────────────────────
function AnalysisSetupCard({
  selectedPosition,
  selectedCriteria,
  recommendedSceneCount,
}: {
  selectedPosition: string;
  selectedCriteria: string[];
  recommendedSceneCount: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-900">분석 설정</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-400">분석 포지션</div>
          <div className="mt-1 font-medium text-slate-800">{selectedPosition || '미드필더'}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-400">분석 기준</div>
          <div className="mt-1 font-medium text-slate-800">
            {(selectedCriteria || []).length > 0 ? selectedCriteria.join(', ') : '기본 분석'}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-400">추출 장면 수</div>
          <div className="mt-1 font-medium text-slate-800">최대 {recommendedSceneCount || 8}개</div>
        </div>
      </div>
    </div>
  );
}

// ── Section 3: 클립 목록 (토글/전체선택) ─────────────────────────────────
function ClipListCard({
  clips,
  onToggleClip,
  onIncludeAll,
  onExcludeAll,
}: {
  clips: any[];
  onToggleClip: (clipId: string) => void;
  onIncludeAll: () => void;
  onExcludeAll: () => void;
}) {
  const selectedCount = (clips || []).filter((c: any) => c.included !== false).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">후보 장면</h2>
          <p className="mt-1 text-sm text-slate-500">{(clips || []).length}개 중 {selectedCount}개 선택됨</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onIncludeAll}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            전체 선택
          </button>
          <button
            onClick={onExcludeAll}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            전체 해제
          </button>
        </div>
      </div>

      {!(clips || []).length ? (
        <div className="py-8 text-center text-sm text-slate-400">분석을 시작하면 후보 장면이 여기에 표시됩니다.</div>
      ) : (
        <div className="space-y-2">
          {(clips || []).map((clip: any, index: number) => (
            <div
              key={clip.id || index}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                clip.included !== false
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={clip.included !== false}
                onChange={() => onToggleClip(clip.id || `clip-${index}`)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 truncate">
                    {clip.label || `장면 ${index + 1}`}
                  </span>
                  {clip.finalScore != null && (
                    <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                      점수 {clip.finalScore}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                  <span>{formatTime(clip.startSec)} ~ {formatTime(clip.endSec)}</span>
                  <span>•</span>
                  <span className="truncate">{clip.reason || clip.whyImportant || '-'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section 4: AI 코치 분석 요약 ──────────────────────────────────────────
function AiCoachSummaryCard({ geminiResult }: { geminiResult: any }) {
  const summary = geminiResult?.summary;

  if (!geminiResult) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">AI 코치 분석</h2>
        <div className="py-6 text-center text-sm text-slate-400">분석 완료 후 AI 코치 피드백이 여기에 표시됩니다.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">AI 코치 분석</h2>
        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">완료</span>
      </div>

      {summary ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-blue-50 p-4">
            <div className="text-xs font-medium text-blue-600">눈에 띄는 장면</div>
            <div className="mt-1 text-sm text-slate-700">{summary.noticeableScene || '-'}</div>
          </div>
          <div className="rounded-xl bg-green-50 p-4">
            <div className="text-xs font-medium text-green-600">잘한 점</div>
            <div className="mt-1 text-sm text-slate-700">{summary.strength || '-'}</div>
          </div>
          <div className="rounded-xl bg-amber-50 p-4">
            <div className="text-xs font-medium text-amber-600">아쉬운 점</div>
            <div className="mt-1 text-sm text-slate-700">{summary.weakness || '-'}</div>
          </div>
          <div className="rounded-xl bg-purple-50 p-4">
            <div className="text-xs font-medium text-purple-600">훈련 포인트</div>
            <div className="mt-1 text-sm text-slate-700">{summary.trainingPoint || summary.nextTrainingPoint || '-'}</div>
          </div>
        </div>
      ) : (
        <div className="py-4 text-sm text-slate-400">AI 분석 결과가 없습니다.</div>
      )}

      {(geminiResult?.clips || []).length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">장면별 코치 코멘트</h3>
          <div className="space-y-3">
            {(geminiResult.clips || []).slice(0, 6).map((clip: any, index: number) => (
              <div key={clip.id || index} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500">
                    {formatTime(clip.startSec)} ~ {formatTime(clip.endSec)}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{clip.label || `장면 ${index + 1}`}</span>
                  {clip.importanceScore != null && (
                    <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                      중요도 {clip.importanceScore}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600">{clip.coachComment || clip.whyImportant || '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section 5: 최종 하이라이트 영상 ──────────────────────────────────────
function FinalHighlightCard({
  renderResult,
  onGenerateFinal,
  onRegenerateFinal,
  clips,
}: {
  renderResult: RenderResult | null;
  onGenerateFinal: () => void;
  onRegenerateFinal: () => void;
  clips: any[];
}) {
  const selectedClips = (clips || []).filter((c: any) => c.included !== false);

  if (!renderResult) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">최종 하이라이트 영상</h2>
        {!(selectedClips || []).length ? (
          <div className="py-4 text-center text-sm text-slate-400">장면을 선택하면 최종 영상을 생성할 수 있습니다.</div>
        ) : (
          <div className="text-center">
            <p className="mb-4 text-sm text-slate-500">{selectedClips.length}개 장면 선택됨</p>
            <button
              onClick={onGenerateFinal}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              최종 하이라이트 생성
            </button>
          </div>
        )}
      </div>
    );
  }

  const videoUrl = renderResult.outputPath || `/highlights/${renderResult.outputFileName}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">최종 하이라이트 영상</h2>
          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">완료</span>
        </div>
        <button
          onClick={onRegenerateFinal}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          다시 생성
        </button>
      </div>

      {videoUrl && (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-900 overflow-hidden">
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              className="w-full aspect-video"
              crossOrigin="anonymous"
            />
          </div>
          <div className="text-xs text-slate-400">
            파일: {renderResult.outputFileName || 'unknown'}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function VideoAnalysisResultPage(props: Props) {
  const {
    selectedFile,
    clips,
    geminiResult,
    renderResult,
    selectedPosition,
    selectedCriteria,
    recommendedSceneCount,
    onSelectFile,
    onReupload,
    onStartAnalysis,
    onIncludeAll,
    onExcludeAll,
    onToggleClip,
    onGenerateFinal,
    onRegenerateFinal,
  } = props;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-6 space-y-6">
      <AnalysisHeader
        selectedFile={selectedFile}
        healthResult={props.healthResult}
        onSelectFile={onSelectFile}
        onReupload={onReupload}
        onStartAnalysis={onStartAnalysis}
      />

      <AnalysisSetupCard
        selectedPosition={selectedPosition}
        selectedCriteria={selectedCriteria}
        recommendedSceneCount={recommendedSceneCount}
      />

      <ClipListCard
        clips={clips}
        onToggleClip={onToggleClip}
        onIncludeAll={onIncludeAll}
        onExcludeAll={onExcludeAll}
      />

      <AiCoachSummaryCard geminiResult={geminiResult} />

      <FinalHighlightCard
        renderResult={renderResult}
        onGenerateFinal={onGenerateFinal}
        onRegenerateFinal={onRegenerateFinal}
        clips={clips}
      />
    </div>
  );
}
