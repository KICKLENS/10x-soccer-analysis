import React from 'react';

type Props = {
  items: string[];
};

export default function TrainingFocusPanel({ items }: Props) {
  return (
    <aside
      style={{
        position: 'sticky',
        top: 24,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 20,
        padding: 18,
      }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>훈련 포인트</div>
          <div style={{ marginTop: 6, fontSize: 14, color: '#64748b' }}>
            이번 분석에서 반복적으로 보인 개선 포인트입니다.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((item) => (
            <div
              key={item}
              style={{
                borderRadius: 14,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: 12,
                fontSize: 14,
                color: '#334155',
                lineHeight: 1.7,
              }}
            >
              • {item}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
