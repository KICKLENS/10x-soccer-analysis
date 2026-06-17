import React from 'react';
import { HighlightClip } from '../../types/analysis';

type Props = {
  selectedClips: HighlightClip[];
  totalDurationLabel: string;
  focusPlayerLabel: string;
  onRenderFinal?: () => void;
};

function formatTime(seconds: number) {
  const minute = Math.floor(seconds / 60);
  const second = Math.floor(seconds % 60);
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

export default function SelectedHighlightSummaryPanel({
  selectedClips,
  totalDurationLabel,
  focusPlayerLabel,
  onRenderFinal,
}: Props) {
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
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>선택 장면 요약</div>
          <div style={{ marginTop: 6, fontSize: 14, color: '#64748b' }}>
            최종 하이라이트 생성에 반영됩니다.
          </div>
        </div>

        <SummaryRow label="선택 장면 수" value={`${selectedClips.length}개`} />
        <SummaryRow label="총 길이" value={totalDurationLabel} />
        <SummaryRow label="포커스 선수" value={focusPlayerLabel} />

        <div
          style={{
            borderRadius: 14,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>선택된 장면</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {selectedClips.length ? (
              selectedClips.map((clip) => (
                <div key={clip.id} style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                  [{formatTime(clip.startSec)}] {clip.title}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>선택된 장면이 없습니다.</div>
            )}
          </div>
        </div>

        <button type="button" style={buttonStyle()} onClick={onRenderFinal}>
          최종 하이라이트 생성
        </button>
      </div>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 14, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{value}</span>
    </div>
  );
}

function buttonStyle(): React.CSSProperties {
  return {
    border: '1px solid #2563eb',
    background: '#2563eb',
    color: '#ffffff',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
  };
}
