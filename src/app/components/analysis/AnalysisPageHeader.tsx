import React from 'react';

type Props = {
  title: string;
  description: string;
  videoName: string;
  positionLabel: string;
  recommendedClipCount: number;
  selectedClipCount: number;
  totalHighlightDurationLabel: string;
  statusBadges: string[];
};

export default function AnalysisPageHeader({
  title,
  description,
  videoName,
  positionLabel,
  recommendedClipCount,
  selectedClipCount,
  totalHighlightDurationLabel,
  statusBadges,
}: Props) {
  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 24,
        padding: 24,
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#2563eb', marginBottom: 8 }}>
            Video Analysis
          </div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: '#0f172a' }}>{title}</h1>
          <p style={{ margin: '10px 0 0', color: '#475569', lineHeight: 1.7 }}>{description}</p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {statusBadges.map((badge) => (
            <span
              key={badge}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 10px',
                borderRadius: 9999,
                background: 'rgba(37, 99, 235, 0.08)',
                color: '#1d4ed8',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {badge}
            </span>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <MetaItem label="업로드된 영상" value={videoName} />
          <MetaItem label="분석 포지션" value={positionLabel} />
          <MetaItem label="추천 장면 수" value={`${recommendedClipCount}개`} />
          <MetaItem label="최종 선택 수" value={`${selectedClipCount}개`} />
          <MetaItem label="최종 길이" value={totalHighlightDurationLabel} />
        </div>
      </div>
    </section>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}
