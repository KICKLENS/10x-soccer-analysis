import React, { useEffect, useRef } from 'react';
import { AnalysisSummary } from '../../types/analysis';

type ClipRef = {
  startSec?: number;
  endSec?: number;
  startTime?: string;
  endTime?: string;
  videoUrl?: string;
  label?: string;
};

type Props = {
  summary: AnalysisSummary;

  // [추가] 영상/시간 매핑용 prop
  // 우선순위: 항목별 ClipRef > standoutClip > defaultVideoUrl
  videoUrl?: string;
  standoutClip?: ClipRef | null;
  strengthClip?: ClipRef | null;
  weaknessClip?: ClipRef | null;
  trainingClip?: ClipRef | null;
};

function formatSec(sec?: number): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildTimeLabel(clip?: ClipRef | null): string {
  if (!clip) return '';

  if (clip.startTime && clip.endTime) {
    return `${clip.startTime} – ${clip.endTime}`;
  }

  const start = formatSec(clip.startSec);
  const end = formatSec(clip.endSec);

  if (start && end) return `${start} – ${end}`;
  return '';
}

function buildClipVideoUrl(clip: ClipRef | null | undefined, fallbackUrl?: string): string {
  if (!clip) return '';

  const base = clip.videoUrl || fallbackUrl || '';
  if (!base) return '';

  if (typeof clip.startSec !== 'number' || typeof clip.endSec !== 'number') return base;

  // 미디어 프래그먼트 #t=시작,끝 으로 해당 구간만 재생
  // 이미 #이 붙어 있으면 그대로 사용
  if (base.includes('#t=')) return base;

  return `${base}#t=${clip.startSec},${clip.endSec}`;
}

export default function AiAnalysisSummaryCard({
  summary,
  videoUrl,
  standoutClip,
  strengthClip,
  weaknessClip,
  trainingClip,
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
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>
            AI 코치 분석 요약
          </h2>
          <p style={{ margin: '8px 0 0', color: '#64748b', lineHeight: 1.7 }}>
            선택된 장면을 기준으로 움직임, 판단, 위치, 연결성을 중심으로 분석했습니다.
            각 항목 아래에서 해당 구간 영상을 바로 확인할 수 있어요.
          </p>
        </div>

        <GridItem
          title="눈에 띈 장면"
          content={summary.standoutScene}
          fallback="아직 가장 눈에 띄는 장면이 정해지지 않았습니다."
          clip={standoutClip}
          fallbackVideoUrl={videoUrl}
        />
        <GridItem
          title="잘한 점"
          content={summary.strengths}
          fallback="잘한 점 분석이 아직 없습니다."
          clip={strengthClip || standoutClip}
          fallbackVideoUrl={videoUrl}
        />
        <GridItem
          title="아쉬운 점"
          content={summary.improvements}
          fallback="아쉬운 점 분석이 아직 없습니다."
          clip={weaknessClip || standoutClip}
          fallbackVideoUrl={videoUrl}
        />
        <GridItem
          title="다음 훈련 포인트"
          content={summary.nextTrainingPoint}
          fallback="다음 훈련 포인트가 아직 없습니다."
          clip={trainingClip}
          fallbackVideoUrl={videoUrl}
          // 훈련 포인트는 영상보다 메뉴가 핵심이라 영상은 선택사항으로
          allowEmptyVideo
        />
      </div>
    </section>
  );
}

function GridItem({
  title,
  content,
  fallback,
  clip,
  fallbackVideoUrl,
  allowEmptyVideo,
}: {
  title: string;
  content?: string;
  fallback: string;
  clip?: ClipRef | null;
  fallbackVideoUrl?: string;
  allowEmptyVideo?: boolean;
}) {
  const text = typeof content === 'string' && content.trim() ? content : fallback;

  const timeLabel = buildTimeLabel(clip);
  const clipVideoUrl = buildClipVideoUrl(clip, fallbackVideoUrl);
  const showVideo = !!clipVideoUrl && (!allowEmptyVideo || !!clip);

  return (
    <div
      style={{
        borderRadius: 16,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        padding: 14,
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{title}</div>

        {timeLabel ? (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#1d4ed8',
              background: '#dbeafe',
              borderRadius: 999,
              padding: '2px 8px',
              letterSpacing: '0.02em',
            }}
          >
            {timeLabel}
          </div>
        ) : null}

        {clip?.label ? (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#475569',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            {clip.label}
          </div>
        ) : null}
      </div>

      {showVideo ? (
        <ClipVideo src={clipVideoUrl} startSec={clip?.startSec} endSec={clip?.endSec} />
      ) : null}

      <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.8 }}>{text}</div>
    </div>
  );
}

function ClipVideo({ src, startSec, endSec }: { src: string; startSec?: number; endSec?: number; }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    video.load(); // 강제 로드
    const handleLoadedMetadata = () => {
      if (typeof startSec === 'number') video.currentTime = startSec;
    };
    const handleTimeUpdate = () => {
      if (typeof endSec === 'number' && video.currentTime >= endSec) video.pause();
    };
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [src, startSec, endSec]);

  return (
    <div style={{ width: '100%', background: '#000', borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9' }}>
      <video
        key={src} // [중요] 이 key가 있어야 브라우저가 검은 화면 캐시를 버리고 새로고침합니다.
        ref={videoRef}
        src={src}
        controls
        playsInline
        muted
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}




