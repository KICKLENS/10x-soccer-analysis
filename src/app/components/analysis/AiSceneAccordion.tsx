import React, { useState } from 'react';
import { SceneAnalysis } from '../../types/analysis';

type Props = {
  title: string;
  subtitle?: string;
  data: SceneAnalysis;
};

export default function AiSceneAccordion({ title, subtitle, data }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: 18,
          background: '#ffffff',
          border: 0,
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 13, color: '#64748b' }}>{subtitle}</div> : null}
        </div>
      </button>

      {open ? (
        <div
          style={{
            borderTop: '1px solid #e5e7eb',
            padding: 18,
            display: 'grid',
            gap: 12,
            background: '#fcfcfd',
          }}
        >
          <Item title="장면 요약" content={data.sceneSummary} />
          <Item title="분석" content={data.analysis} />
          <Item title="포지션 관점 해석" content={data.positionInterpretation} />
          <Item title="교정 포인트" content={data.correctionPoint} />
          <Item title="다시 볼 이유" content={data.whyReviewAgain} />
        </div>
      ) : null}
    </section>
  );
}

function Item({ title, content }: { title: string; content: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.8 }}>{content}</div>
    </div>
  );
}
