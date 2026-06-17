import React from 'react';

type Props = {
  onIncludeAll?: () => void;
  onExcludeAll?: () => void;
  onShowSelectedOnly?: () => void;
};

export default function HighlightToolbar({
  onIncludeAll,
  onExcludeAll,
  onShowSelectedOnly,
}: Props) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" style={buttonStyle()} onClick={onIncludeAll}>
        전체 포함
      </button>
      <button type="button" style={buttonStyle()} onClick={onExcludeAll}>
        전체 제외
      </button>
      <button type="button" style={buttonStyle()} onClick={onShowSelectedOnly}>
        선택 장면만 보기
      </button>
    </div>
  );
}

function buttonStyle(): React.CSSProperties {
  return {
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#0f172a',
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
  };
}
