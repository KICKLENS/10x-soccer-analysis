import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type SeedFrameItem = { url: string; timeSec: number };

type SeedFrameStripProps = {
  frames: SeedFrameItem[];
  activeUrl?: string;
  tappedTimeSecs: number[];
  onSelect: (frame: SeedFrameItem) => void;
};

export default function SeedFrameStrip({
  frames,
  activeUrl,
  tappedTimeSecs,
  onSelect,
}: SeedFrameStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const activeIndex = Math.max(
    0,
    frames.findIndex((f) => f.url === activeUrl),
  );

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollHints();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollHints, { passive: true });
    window.addEventListener('resize', updateScrollHints);
    return () => {
      el.removeEventListener('scroll', updateScrollHints);
      window.removeEventListener('resize', updateScrollHints);
    };
  }, [frames.length, updateScrollHints]);

  const scrollByAmount = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });
  };

  if (frames.length <= 1) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/50">
          총 <span className="font-bold text-[#FF9F02]">{frames.length}장</span>
          {' · '}
          현재 <span className="font-bold text-white">{activeIndex + 1}</span>번째 장면
          {tappedTimeSecs.length > 0 ? (
            <>
              {' · '}
              탭 완료 <span className="font-bold text-[#FF9F02]">{tappedTimeSecs.length}장</span>
            </>
          ) : null}
        </p>
        {(canScrollLeft || canScrollRight) && (
          <p className="text-[11px] text-white/35 hidden sm:block">
            ← → 버튼 또는 가로 드래그로 다른 장면 보기
          </p>
        )}
      </div>

      <div className="relative">
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-10 bg-gradient-to-r from-[#0a0e1a] to-transparent" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-10 bg-gradient-to-l from-[#0a0e1a] to-transparent" />
        )}

        <button
          type="button"
          aria-label="이전 장면"
          onClick={() => scrollByAmount(-1)}
          disabled={!canScrollLeft}
          className="absolute left-0 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white shadow-lg transition hover:bg-black/90 disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronLeft size={18} />
        </button>

        <button
          type="button"
          aria-label="다음 장면"
          onClick={() => scrollByAmount(1)}
          disabled={!canScrollRight}
          className="absolute right-0 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white shadow-lg transition hover:bg-black/90 disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronRight size={18} />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scroll-smooth pb-1 pl-1 pr-1 [scrollbar-width:thin]"
          style={{ scrollbarColor: 'rgba(255,159,2,0.4) transparent' }}
        >
          {frames.map((f, index) => {
            const tapped = tappedTimeSecs.includes(f.timeSec);
            const isActive = activeUrl === f.url;
            return (
              <button
                key={f.url}
                type="button"
                onClick={() => onSelect(f)}
                className={`relative shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                  isActive
                    ? 'border-[#FF9F02] ring-2 ring-[#FF9F02]/30'
                    : tapped
                      ? 'border-[#FF9F02]/50'
                      : 'border-white/10 hover:border-white/30'
                }`}
              >
                <img src={f.url} alt={`장면 ${index + 1}`} className="h-16 w-28 object-cover" draggable={false} />
                <span className="absolute bottom-0 left-0 right-0 bg-black/70 py-0.5 text-center text-[10px] text-white">
                  {index + 1}/{frames.length} · {f.timeSec}초
                </span>
                {tapped && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#FF9F02] text-[10px] font-bold text-black shadow">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {canScrollRight && (
        <p className="text-center text-[11px] text-[#FF9F02]/80 sm:hidden">
          👉 오른쪽으로 밀어 {frames.length - 1}장 더 보기
        </p>
      )}
    </div>
  );
}
