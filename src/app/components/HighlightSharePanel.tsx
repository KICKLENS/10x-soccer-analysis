import React, { useState } from 'react';

const STROKE = 'rgba(255,255,255,0.08)';

type HighlightSharePanelProps = {
  videoUrl: string;
  downloadName?: string;
  playerName?: string;
};

export default function HighlightSharePanel({
  videoUrl,
  downloadName = '10x-highlight.mp4',
  playerName = '선수',
}: HighlightSharePanelProps) {
  const [notice, setNotice] = useState('');

  const shareText = `${playerName} 축구 하이라이트 영상 ⚽ #유소년축구 #10xai`;

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2800);
  };

  const handleSave = () => {
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = downloadName;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    flash('영상 저장을 시작했습니다.');
  };

  const handleNativeShare = async (extra?: { title?: string; text?: string }) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: extra?.title || '10X 축구 하이라이트',
          text: extra?.text || shareText,
          url: videoUrl,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const handleKakao = async () => {
    const ok = await handleNativeShare({
      title: '10X 축구 하이라이트',
      text: `${playerName} 하이라이트 영상이에요!`,
    });
    if (!ok) {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${videoUrl}`);
        flash('링크가 복사됐어요. 카카오톡 채팅에 붙여넣기 하세요.');
      } catch {
        flash('카카오톡 공유는 모바일에서 「공유」 버튼을 이용해 주세요.');
      }
    }
  };

  const openShareWindow = (url: string, copiedMsg: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    flash(copiedMsg);
  };

  const handleYouTube = async () => {
    const ok = await handleNativeShare();
    if (!ok) {
      try {
        await navigator.clipboard.writeText(videoUrl);
      } catch {
        /* noop */
      }
      openShareWindow(
        'https://www.youtube.com/upload',
        '영상 링크를 복사했어요. 유튜브 스튜디오에서 업로드해 주세요.',
      );
    }
  };

  const handleInstagram = async () => {
    const ok = await handleNativeShare({ text: `${shareText} #축구` });
    if (!ok) {
      try {
        await navigator.clipboard.writeText(videoUrl);
        flash('링크를 복사했어요. 인스타그램 앱에서 릴스/스토리에 업로드해 주세요.');
      } catch {
        flash('모바일에서 「공유」 버튼을 이용해 주세요.');
      }
    }
  };

  const handleFacebook = () => {
    const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(videoUrl)}&quote=${encodeURIComponent(shareText)}`;
    openShareWindow(fb, '페이스북 공유 창을 열었습니다.');
  };

  const btnClass =
    'flex flex-col items-center justify-center gap-1.5 rounded-2xl border py-3 px-2 text-center transition hover:brightness-110 min-h-[72px]';

  return (
    <div className="mt-6 rounded-2xl border p-4 md:p-5" style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.02)' }}>
      <p className="mb-1 text-sm font-bold text-white">저장 · 공유</p>
      <p className="mb-4 text-xs text-white/45">하이라이트 추출이 끝난 뒤 저장하거나 SNS로 보낼 수 있어요.</p>

      {notice ? (
        <div className="mb-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button type="button" onClick={handleSave} className={btnClass} style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.04)' }}>
          <span className="text-xl">💾</span>
          <span className="text-xs font-semibold text-white">저장</span>
        </button>

        <button
          type="button"
          onClick={handleKakao}
          className={btnClass}
          style={{ borderColor: 'rgba(254,229,0,0.35)', background: '#FEE500', color: '#3c1e1e' }}
        >
          <span className="text-xl">💬</span>
          <span className="text-xs font-bold">카카오톡</span>
        </button>

        <button type="button" onClick={handleYouTube} className={btnClass} style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)' }}>
          <span className="text-xl">▶️</span>
          <span className="text-xs font-semibold text-red-200">유튜브</span>
        </button>

        <button
          type="button"
          onClick={handleInstagram}
          className={btnClass}
          style={{ borderColor: 'rgba(236,72,153,0.35)', background: 'rgba(168,85,247,0.12)' }}
        >
          <span className="text-xl">📸</span>
          <span className="text-xs font-semibold text-pink-200">인스타그램</span>
        </button>

        <button type="button" onClick={handleFacebook} className={btnClass} style={{ borderColor: 'rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.12)' }}>
          <span className="text-xl">📘</span>
          <span className="text-xs font-semibold text-blue-200">페이스북</span>
        </button>
      </div>

      <p className="mt-3 text-center text-[10px] text-white/35">
        유튜브·인스타그램은 앱/스튜디오 업로드가 필요할 수 있어요. 모바일에서는 「공유」가 가장 편합니다.
      </p>
    </div>
  );
}
