import React from 'react';
import { AnalysisSetup } from '../../types/analysis';

type Props = {
  setup: AnalysisSetup;
  onStartAnalysis?: () => void;
  onRetryAnalysis?: () => void;
};

export default function AnalysisSetupCard({
  setup,
  onStartAnalysis,
  onRetryAnalysis,
}: Props) {
  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 20,
        padding: 20,
      }}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#0f172a' }}>분석 설정</h2>
          <p style={{ margin: '8px 0 0', color: '#64748b', lineHeight: 1.7 }}>
            현재 영상은 아래 기준으로 분석됩니다.
          </p>
        </div>

        <InfoBlock label="포지션" value={setup.positionLabel} />
        <InfoBlock label="AI 분석 방식" value={setup.analysisModeLabel} />
        <InfoBlock label="추천 장면 수" value={`${setup.recommendedClipCount}개`} />

        <div
          style={{
            borderRadius: 16,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
            하이라이트 추출 기준
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {setup.extractionCriteria.map((item) => (
              <span
                key={item}
                style={{
                  padding: '6px 10px',
                  borderRadius: 9999,
                  background: '#ffffff',
                  border: '1px solid #dbeafe',
                  color: '#1d4ed8',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={buttonStyle('primary')} onClick={onStartAnalysis}>
            분석 시작
          </button>
          <button type="button" style={buttonStyle('secondary')} onClick={onRetryAnalysis}>
            다시 분석하기
          </button>
        </div>
      </div>
    </section>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

function buttonStyle(tone: 'primary' | 'secondary'): React.CSSProperties {
  const isPrimary = tone === 'primary';
  return {
    border: `1px solid ${isPrimary ? '#2563eb' : '#cbd5e1'}`,
    background: isPrimary ? '#2563eb' : '#ffffff',
    color: isPrimary ? '#ffffff' : '#0f172a',
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
  };
}
