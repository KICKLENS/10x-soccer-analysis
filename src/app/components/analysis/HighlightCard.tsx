import React from 'react';
import { HighlightClip } from '../../types/analysis';

type Props = {
  clip: HighlightClip;
  onPreview?: (clip: HighlightClip) => void;
  onToggleInclude?: (clipId: string) => void;
};

function formatTime(seconds: number) {
  const minute = Math.floor(seconds / 60);
  const second = Math.floor(seconds % 60);
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function getFocusPlayerLabel(clip: HighlightClip) {
  const player = clip.focusPlayer;
  if (!player) return '포커스 선수';
  if (player.jerseyNumber && player.position) return `#${player.jerseyNumber} ${player.position}`;
  if (player.jerseyNumber) return `#${player.jerseyNumber}`;
  if (player.position) return player.position;
  if (player.playerName) return player.playerName;
  return '포커스 선수';
}

export default function HighlightCard({ clip, onPreview, onToggleInclude }: Props) {
  return (
    <article
      style={{
        border: clip.included ? '1.5px solid #2563eb' : '1px solid #e5e7eb',
        background: clip.included ? 'rgba(37, 99, 235, 0.04)' : '#ffffff',
        borderRadius: 20,
        padding: 18,
        boxShadow: clip.included ? '0 12px 30px rgba(37, 99, 235, 0.08)' : 'none',
      }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Pill label={`${formatTime(clip.startSec)} - ${formatTime(clip.endSec)}`} />
          {clip.eventType ? <Pill label={clip.eventType} /> : null}
          {clip.geminiRank ? <Pill label={`AI #${clip.geminiRank}`} /> : null}
          <Pill label={clip.included ? '포함됨' : '제외됨'} active={clip.included} />
        </div>

        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>{clip.title}</div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8, color: '#475569' }}>
            {clip.summary}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          <InfoCard title="추천 이유" content={clip.reason} />
          <InfoCard title="포커스 선수" content={getFocusPlayerLabel(clip)} />
          <InfoCard
            title="중요도"
            content={clip.importanceScore !== null && clip.importanceScore !== undefined ? clip.importanceScore.toFixed(2) : '-'}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={buttonStyle('secondary')} onClick={() => onPreview?.(clip)}>
            미리보기
          </button>
          <button type="button" style={buttonStyle(clip.included ? 'secondary' : 'primary')} onClick={() => onToggleInclude?.(clip.id)}>
            {clip.included ? '제외' : '포함'}
          </button>
        </div>
      </div>
    </article>
  );
}

function Pill({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      style={{
        padding: '6px 10px',
        borderRadius: 9999,
        background: active ? '#dbeafe' : '#f1f5f9',
        color: active ? '#1d4ed8' : '#475569',
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

function InfoCard({ title, content }: { title: string; content: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7 }}>{content}</div>
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
