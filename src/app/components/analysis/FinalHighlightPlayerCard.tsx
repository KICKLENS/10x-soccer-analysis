import React, { useRef } from 'react';
import { FinalHighlightInfo } from '../../types/analysis';
import PlayerSpotlightOverlay from '../PlayerSpotlightOverlay';

type Props = {
  finalHighlight?: FinalHighlightInfo | null;
};

export default function FinalHighlightPlayerCard({ finalHighlight }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>최종 하이라이트 영상</h2>
          <p style={{ margin: '8px 0 0', color: '#64748b', lineHeight: 1.7 }}>
            선택한 장면을 기준으로 생성된 최종 영상입니다.
          </p>
        </div>

        {finalHighlight?.videoUrl ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: 18,
              overflow: 'hidden',
              background: '#000',
            }}
          >
            <video
              ref={videoRef}
              src={finalHighlight.videoUrl}
              controls
              playsInline
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                background: '#000',
              }}
            />
            <PlayerSpotlightOverlay
              videoRef={videoRef}
              track={finalHighlight.spotlightTrack}
              fallbackLabel={finalHighlight.focusPlayerLabel}
              showLabel
              visible
              footOffsetY={10}
            />
          </div>
        ) : (
          <div
            style={{
              minHeight: 280,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 18,
              background: '#0f172a',
              color: '#cbd5e1',
              textAlign: 'center',
              padding: 24,
            }}
          >
            최종 하이라이트 영상이 아직 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}
