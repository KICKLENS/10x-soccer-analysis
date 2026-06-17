import React from 'react';

type Props = {
  videoName: string;
  fileSizeLabel: string;
  uploadedAtLabel?: string;
  onSelectVideo?: () => void;
  onReupload?: () => void;
};

export default function UploadVideoCard({
  videoName,
  fileSizeLabel,
  uploadedAtLabel,
  onSelectVideo,
  onReupload,
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#0f172a' }}>업로드된 영상</h2>
          <p style={{ margin: '8px 0 0', color: '#64748b', lineHeight: 1.7 }}>
            현재 분석에 사용되는 영상입니다.
          </p>
        </div>

        <div
          style={{
            borderRadius: 16,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', wordBreak: 'break-all' }}>
            {videoName}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: '#64748b' }}>
            파일 크기: {fileSizeLabel}
          </div>
          {uploadedAtLabel ? (
            <div style={{ marginTop: 4, fontSize: 14, color: '#64748b' }}>
              업로드 시간: {uploadedAtLabel}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={buttonStyle('secondary')} onClick={onSelectVideo}>
            영상 선택
          </button>
          <button type="button" style={buttonStyle('secondary')} onClick={onReupload}>
            다시 업로드
          </button>
        </div>
      </div>
    </section>
  );
}

function buttonStyle(tone: 'primary' | 'secondary' = 'secondary'): React.CSSProperties {
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
