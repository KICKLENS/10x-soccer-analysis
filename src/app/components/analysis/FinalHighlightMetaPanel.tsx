import React from 'react';
import { FinalHighlightInfo } from '../../types/analysis';

type Props = {
  finalHighlight?: FinalHighlightInfo | null;
  onDownload?: () => void;
  onRegenerate?: () => void;
};

export default function FinalHighlightMetaPanel({
  finalHighlight,
  onDownload,
  onRegenerate,
}: Props) {
  return (
    <aside
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 20,
        padding: 18,
      }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>결과 정보</div>
          <div style={{ marginTop: 6, fontSize: 14, color: '#64748b' }}>
            최종 생성 결과와 다운로드 정보를 확인하세요.
          </div>
        </div>

        <MetaRow label="파일명" value={finalHighlight?.fileName || '-'} />
        <MetaRow label="총 길이" value={finalHighlight?.totalDurationLabel || '-'} />
        <MetaRow label="선택 장면 수" value={finalHighlight ? `${finalHighlight.selectedClipCount}개` : '-'} />
        <MetaRow label="포커스 선수" value={finalHighlight?.focusPlayerLabel || '-'} />

        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <button type="button" style={buttonStyle('primary')} onClick={onDownload}>
            다운로드
          </button>
          <button type="button" style={buttonStyle('secondary')} onClick={onRegenerate}>
            다시 생성
          </button>
        </div>
      </div>
    </aside>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 14, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{value}</span>
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
