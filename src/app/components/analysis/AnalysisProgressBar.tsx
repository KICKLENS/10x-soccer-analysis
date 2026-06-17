import React from 'react';
import { AnalysisStage } from '../../types/analysis';

type Props = {
  stage: AnalysisStage;
};

const steps = [
  { key: 'uploaded', label: '업로드' },
  { key: 'extracted', label: '하이라이트 추출' },
  { key: 'analyzed', label: 'AI 분석' },
  { key: 'completed', label: '최종 영상' },
];

function getStepStatus(current: AnalysisStage, key: string) {
  const order: Record<string, number> = {
    idle: 0,
    uploaded: 1,
    extracting: 1,
    extracted: 2,
    analyzing: 2,
    analyzed: 3,
    rendering: 3,
    completed: 4,
    failed: 0,
  };

  return order[current] >= order[key] ? 'done' : 'todo';
}

export default function AnalysisProgressBar({ stage }: Props) {
  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 20,
        padding: 18,
      }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#334155' }}>분석 진행 상태</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {steps.map((step) => {
            const done = getStepStatus(stage, step.key) === 'done';
            return (
              <div
                key={step.key}
                style={{
                  borderRadius: 14,
                  padding: 12,
                  border: `1px solid ${done ? '#bfdbfe' : '#e5e7eb'}`,
                  background: done ? '#eff6ff' : '#f8fafc',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: done ? '#2563eb' : '#64748b' }}>
                  {done ? '완료' : '대기'}
                </div>
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
