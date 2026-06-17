import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'ai-analysis-lab-payload';

type LabClip = {
  id?: string;
  startTime?: string;
  endTime?: string;
  startSec?: number;
  endSec?: number;
  label?: string;
  score?: number;
  reason?: string;
  framesMatched?: number;
  interactionFrames?: number;
  avgBallCount?: number;
  avgBallConfidence?: number;
  ballDetectionsCount?: number;
};

type LabPayload = {
  success?: boolean;
  checkedAt?: string;
  source?: string;
  message?: string;
  fileName?: string;
  highlightVideoUrl?: string;
  clips?: LabClip[];
  summary?: Record<string, unknown>;
  received?: Record<string, unknown>;
  raw?: unknown;
};

function parseStoredPayload(): LabPayload | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.error('LAB payload parse error:', error);
    return null;
  }
}

function formatNumber(value: unknown, digits = 3) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toFixed(digits);
}

function formatScore(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toFixed(2);
}

function isYoloPayload(payload: LabPayload | null) {
  return payload?.source === 'yolo';
}

export default function AiVideoAnalysisPageLab() {
  const location = useLocation();
  const navigate = useNavigate();

  const payload = useMemo(() => {
    const statePayload = location.state as LabPayload | null;
    if (statePayload) return statePayload;
    return parseStoredPayload();
  }, [location.state]);

  const clipCount = Array.isArray(payload?.clips) ? payload!.clips!.length : 0;
  const yoloMode = isYoloPayload(payload);

  const handleGoBack = () => {
    navigate('/video-analysis-lab');
  };

  const handleClearStorage = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#070b14',
        color: '#ffffff',
        padding: '40px 20px 80px',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#c084fc',
            }}
          >
            AI Video Analysis Lab
          </p>
          <h1 style={{ margin: '10px 0 8px', fontSize: 34, lineHeight: 1.2 }}>
            AI 비디오 분석 페이지랩
          </h1>
          <p style={{ margin: 0, color: '#b6c2cf', fontSize: 15, lineHeight: 1.6 }}>
            LAB 분석 결과를 확인하는 페이지입니다. 기본 Extract 결과와 YOLO 결과 모두 이 화면에서
            검증할 수 있습니다.
          </p>
        </header>

        <section
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <button
            onClick={handleGoBack}
            style={{
              border: 'none',
              borderRadius: 14,
              padding: '14px 18px',
              background: '#2563eb',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            LAB 페이지로 돌아가기
          </button>

          <button
            onClick={handleClearStorage}
            style={{
              border: 'none',
              borderRadius: 14,
              padding: '14px 18px',
              background: '#ef4444',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            저장된 결과 비우기
          </button>
        </section>

        {!payload ? (
          <section
            style={{
              borderRadius: 18,
              padding: 24,
              background: '#0f172a',
              border: '1px solid rgba(148,163,184,0.2)',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 22 }}>
              표시할 분석 결과가 아직 없습니다
            </h2>
            <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7 }}>
              먼저 <strong>/video-analysis-lab</strong> 페이지에서 Extract 또는 YOLO Extract를 실행한
              뒤 이 페이지로 이동해 주세요.
            </p>
          </section>
        ) : (
          <>
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  borderRadius: 18,
                  padding: 20,
                  background: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.2)',
                }}
              >
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>source</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>
                  {payload.source || '-'}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 18,
                  padding: 20,
                  background: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.2)',
                }}
              >
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>fileName</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', lineHeight: 1.5 }}>
                  {payload.fileName || '-'}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 18,
                  padding: 20,
                  background: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.2)',
                }}
              >
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>clips 수</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>{clipCount}</div>
              </div>

              <div
                style={{
                  borderRadius: 18,
                  padding: 20,
                  background: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.2)',
                }}
              >
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>success</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>
                  {String(payload.success)}
                </div>
              </div>
            </section>

            <section
              style={{
                borderRadius: 18,
                padding: 20,
                background: '#0f172a',
                border: '1px solid rgba(148,163,184,0.2)',
                marginBottom: 18,
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 20 }}>분석 요약</h2>

              <div style={{ marginBottom: 10, color: '#dbe7f3' }}>
                <strong>message:</strong> {payload.message || '-'}
              </div>
              <div style={{ marginBottom: 10, color: '#dbe7f3' }}>
                <strong>checkedAt:</strong> {payload.checkedAt || '-'}
              </div>
              <div style={{ marginBottom: 10, color: '#dbe7f3' }}>
                <strong>highlightVideoUrl:</strong> {payload.highlightVideoUrl || '-'}
              </div>

              {payload.summary ? (
                <div
                  style={{
                    marginTop: 14,
                    borderRadius: 14,
                    padding: 14,
                    background: '#111c31',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>summary</div>
                  <pre
                    style={{
                      margin: 0,
                      color: '#cbd5e1',
                      fontSize: 12,
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(payload.summary, null, 2)}
                  </pre>
                </div>
              ) : null}
            </section>

            <section
              style={{
                borderRadius: 18,
                padding: 20,
                background: '#0f172a',
                border: '1px solid rgba(148,163,184,0.2)',
                marginBottom: 18,
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 20 }}>
                클립 목록 {yoloMode ? '(YOLO 상세 필드 포함)' : ''}
              </h2>

              {Array.isArray(payload.clips) && payload.clips.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: 14,
                  }}
                >
                  {payload.clips.map((clip, index) => {
                    const ballDetectionsCount =
                      typeof clip.ballDetectionsCount === 'number'
                        ? clip.ballDetectionsCount
                        : typeof clip.avgBallCount === 'number'
                        ? clip.avgBallCount
                        : undefined;

                    return (
                      <article
                        key={`${clip.id || 'clip'}-${index}`}
                        style={{
                          borderRadius: 16,
                          padding: 16,
                          background: '#111c31',
                          border: '1px solid rgba(148,163,184,0.12)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 10,
                            marginBottom: 10,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 800,
                                color: '#f8fafc',
                                marginBottom: 4,
                              }}
                            >
                              {clip.label || `clip-${index + 1}`}
                            </div>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>
                              {clip.id || `index-${index + 1}`}
                            </div>
                          </div>

                          <div
                            style={{
                              minWidth: 64,
                              textAlign: 'center',
                              padding: '8px 10px',
                              borderRadius: 12,
                              background: '#1d4ed8',
                              fontWeight: 800,
                              color: '#fff',
                              fontSize: 14,
                            }}
                          >
                            {formatScore(clip.score)}
                          </div>
                        </div>

                        <div style={{ color: '#dbe7f3', fontSize: 14, marginBottom: 6 }}>
                          <strong>구간:</strong> {clip.startTime || '-'} ~ {clip.endTime || '-'}
                        </div>

                        <div style={{ color: '#dbe7f3', fontSize: 14, marginBottom: 6 }}>
                          <strong>초 단위:</strong> {clip.startSec ?? '-'} ~ {clip.endSec ?? '-'}
                        </div>

                        <div style={{ color: '#cbd5e1', fontSize: 14, marginBottom: 6 }}>
                          <strong>reason:</strong> {clip.reason || '-'}
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                            gap: 10,
                            marginTop: 14,
                          }}
                        >
                          <div
                            style={{
                              borderRadius: 12,
                              padding: 12,
                              background: '#0b1324',
                            }}
                          >
                            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                              framesMatched
                            </div>
                            <div style={{ fontWeight: 700 }}>{clip.framesMatched ?? '-'}</div>
                          </div>

                          <div
                            style={{
                              borderRadius: 12,
                              padding: 12,
                              background: '#0b1324',
                            }}
                          >
                            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                              interactionFrames
                            </div>
                            <div style={{ fontWeight: 700 }}>
                              {clip.interactionFrames ?? '-'}
                            </div>
                          </div>

                          <div
                            style={{
                              borderRadius: 12,
                              padding: 12,
                              background: '#0b1324',
                            }}
                          >
                            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                              avgBallConfidence
                            </div>
                            <div style={{ fontWeight: 700 }}>
                              {formatNumber(clip.avgBallConfidence)}
                            </div>
                          </div>

                          <div
                            style={{
                              borderRadius: 12,
                              padding: 12,
                              background: '#0b1324',
                            }}
                          >
                            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                              ballDetectionsCount
                            </div>
                            <div style={{ fontWeight: 700 }}>
                              {typeof ballDetectionsCount === 'number'
                                ? formatNumber(ballDetectionsCount, 2)
                                : '-'}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p style={{ margin: 0, color: '#94a3b8' }}>표시할 clips가 없습니다.</p>
              )}
            </section>

            <section
              style={{
                borderRadius: 18,
                padding: 20,
                background: '#0f172a',
                border: '1px solid rgba(148,163,184,0.2)',
                marginBottom: 18,
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 20 }}>received</h2>

              <pre
                style={{
                  margin: 0,
                  padding: 14,
                  borderRadius: 12,
                  background: '#020617',
                  color: '#cbd5e1',
                  fontSize: 12,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(payload.received ?? null, null, 2)}
              </pre>
            </section>

            <section
              style={{
                borderRadius: 18,
                padding: 20,
                background: '#0f172a',
                border: '1px solid rgba(148,163,184,0.2)',
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 20 }}>Raw JSON</h2>

              <pre
                style={{
                  margin: 0,
                  padding: 14,
                  borderRadius: 12,
                  background: '#020617',
                  color: '#cbd5e1',
                  fontSize: 12,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(payload.raw ?? payload, null, 2)}
              </pre>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
