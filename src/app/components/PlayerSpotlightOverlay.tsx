import React, { CSSProperties, RefObject, useEffect, useMemo, useState } from 'react';

export type FocusTrackPoint = {
  /**
   * 비디오 시간(초)
   * 예: 0, 0.2, 0.4 ...
   */
  t: number;

  /**
   * 0~1 정규화 좌표
   * x: 가로 위치
   * y: 세로 위치 (선수 발밑 기준 권장)
   */
  x: number;
  y: number;

  /**
   * 스포트라이트 타원 크기(px)
   */
  radiusX?: number;
  radiusY?: number;

  /**
   * 표시 라벨
   * 예: "#13 ST", "포커스 선수", "판단 불확실"
   */
  label?: string;

  /**
   * 핵심 순간 여부
   * true면 약한 pulse 효과 적용
   */
  isKeyMoment?: boolean;
};

type PlayerSpotlightOverlayProps = {
  /**
   * 부모 video ref
   */
  videoRef: RefObject<HTMLVideoElement | null>;

  /**
   * 시간축을 따라 움직이는 포커스 선수 좌표 목록
   */
  track: FocusTrackPoint[];

  /**
   * 라벨이 없을 때 대체 텍스트
   */
  fallbackLabel?: string;

  /**
   * 라벨 표시 여부
   */
  showLabel?: boolean;

  /**
   * 전체 표시 여부
   */
  visible?: boolean;

  /**
   * 발밑 기준점에서 spotlight를 아래로 조금 내리는 값(px)
   * 기본 10 정도가 가장 자연스러움
   */
  footOffsetY?: number;

  /**
   * 스포트라이트 메인 색상
   */
  glowColor?: string;

  /**
   * 라벨 배경색
   */
  labelBackgroundColor?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

function sortTrack(track: FocusTrackPoint[]) {
  return [...track].sort((a, b) => a.t - b.t);
}

function interpolatePoint(track: FocusTrackPoint[], currentTime: number): FocusTrackPoint | null {
  if (!track.length) return null;
  if (track.length === 1) return track[0];

  const sorted = sortTrack(track);

  if (currentTime <= sorted[0].t) {
    return sorted[0];
  }

  if (currentTime >= sorted[sorted.length - 1].t) {
    return sorted[sorted.length - 1];
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];

    if (currentTime >= a.t && currentTime <= b.t) {
      const span = b.t - a.t || 1;
      const alpha = clamp((currentTime - a.t) / span, 0, 1);

      return {
        t: currentTime,
        x: lerp(a.x, b.x, alpha),
        y: lerp(a.y, b.y, alpha),
        radiusX: lerp(a.radiusX ?? 140, b.radiusX ?? 140, alpha),
        radiusY: lerp(a.radiusY ?? 54, b.radiusY ?? 54, alpha),
        label: a.label || b.label,
        isKeyMoment: Boolean(a.isKeyMoment || b.isKeyMoment),
      };
    }
  }

  return sorted[sorted.length - 1];
}

export default function PlayerSpotlightOverlay({
  videoRef,
  track,
  fallbackLabel = '포커스 선수',
  showLabel = true,
  visible = true,
  footOffsetY = 10,
  glowColor = '255, 255, 255',
  labelBackgroundColor = 'rgba(15, 23, 42, 0.82)',
}: PlayerSpotlightOverlayProps) {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!visible) return;

    let rafId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;

      const nextTime = videoRef.current?.currentTime ?? 0;

      setCurrentTime((prev) => {
        if (Math.abs(prev - nextTime) < 0.015) {
          return prev;
        }
        return nextTime;
      });

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [videoRef, visible]);

  const activePoint = useMemo(() => {
    if (!visible) return null;
    return interpolatePoint(track, currentTime);
  }, [track, currentTime, visible]);

  if (!visible || !activePoint) {
    return null;
  }

  const left = `${clamp(activePoint.x, 0, 1) * 100}%`;
  const top = `calc(${clamp(activePoint.y, 0, 1) * 100}% + ${footOffsetY}px)`;

  const spotlightWidth = `${activePoint.radiusX ?? 140}px`;
  const spotlightHeight = `${activePoint.radiusY ?? 54}px`;

  const ringWidth = `${Math.max((activePoint.radiusX ?? 140) - 18, 90)}px`;
  const ringHeight = `${Math.max((activePoint.radiusY ?? 54) - 18, 34)}px`;

  const labelText = activePoint.label || fallbackLabel;

  const layerStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 5,
  };

  const spotlightStyle: CSSProperties = {
    position: 'absolute',
    left,
    top,
    width: spotlightWidth,
    height: spotlightHeight,
    transform: 'translate(-50%, -38%)',
    borderRadius: 9999,
    opacity: 0.98,
    filter: 'blur(10px)',
    background: `
      radial-gradient(
        ellipse at center,
        rgba(${glowColor}, 0.36) 0%,
        rgba(${glowColor}, 0.24) 34%,
        rgba(${glowColor}, 0.12) 58%,
        rgba(${glowColor}, 0.00) 100%
      )
    `,
    animation: activePoint.isKeyMoment ? 'playerSpotlightPulse 1.1s ease-in-out infinite' : 'none',
  };

  const ringStyle: CSSProperties = {
    position: 'absolute',
    left,
    top,
    width: ringWidth,
    height: ringHeight,
    transform: 'translate(-50%, -38%)',
    borderRadius: 9999,
    border: `2px solid rgba(${glowColor}, 0.42)`,
    boxShadow: `
      0 0 0 6px rgba(${glowColor}, 0.06),
      0 0 24px rgba(${glowColor}, 0.14)
    `,
    opacity: 0.92,
  };

  const labelStyle: CSSProperties = {
    position: 'absolute',
    left,
    top: `calc(${clamp(activePoint.y, 0, 1) * 100}% - 36px)`,
    transform: 'translate(-50%, -50%)',
    padding: '6px 10px',
    borderRadius: 9999,
    background: labelBackgroundColor,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.22)',
    backdropFilter: 'blur(6px)',
  };

  return (
    <div style={layerStyle} aria-hidden="true">
      <style>
        {`
          @keyframes playerSpotlightPulse {
            0% {
              transform: translate(-50%, -38%) scale(1);
              opacity: 0.94;
            }
            50% {
              transform: translate(-50%, -38%) scale(1.08);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -38%) scale(1);
              opacity: 0.94;
            }
          }
        `}
      </style>

      <div style={spotlightStyle} />
      <div style={ringStyle} />
      {showLabel ? <div style={labelStyle}>{labelText}</div> : null}
    </div>
  );
}
