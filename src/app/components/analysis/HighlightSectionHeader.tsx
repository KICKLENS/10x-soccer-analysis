import React from 'react';

type Props = {
  recommendedCount: number;
  selectedCount: number;
  focusPlayerLabel: string;
};

export default function HighlightSectionHeader({
  recommendedCount,
  selectedCount,
  focusPlayerLabel,
}: Props) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>
          추천 하이라이트 장면
        </h2>
        <p style={{ margin: '8px 0 0', color: '#64748b', lineHeight: 1.7 }}>
          자동으로 추출된 장면을 확인하고 최종 영상에 포함할 장면을 선택하세요.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Tag label={`추천 ${recommendedCount}개`} />
        <Tag label={`선택 ${selectedCount}개`} />
        <Tag label={focusPlayerLabel} />
      </div>
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '6px 10px',
        borderRadius: 9999,
        background: '#eff6ff',
        color: '#1d4ed8',
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}
