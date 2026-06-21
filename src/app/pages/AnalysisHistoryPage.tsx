import { useEffect, useState } from 'react';
import { ArrowLeft, Clapperboard, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  deleteAnalysisHistoryItem,
  formatHistoryDate,
  loadAnalysisHistory,
  type AnalysisHistoryItem,
} from '../lib/analysisHistory';

const PAGE_BG = '#070b14';
const CARD_BG = 'linear-gradient(180deg, rgba(14,19,33,0.96) 0%, rgba(10,14,26,0.98) 100%)';
const STROKE = 'rgba(255,255,255,0.08)';
const TEXT_SUB = 'rgba(225,231,242,0.72)';

export default function AnalysisHistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);

  useEffect(() => {
    setItems(loadAnalysisHistory());
  }, []);

  const handleOpen = (item: AnalysisHistoryItem) => {
    try {
      sessionStorage.setItem('ai-analysis-payload', JSON.stringify(item.payload));
    } catch {
      // ignore
    }
    navigate('/ai-video-analysis', { state: item.payload });
  };

  const handleDelete = (item: AnalysisHistoryItem) => {
    const ok = window.confirm(`${item.playerName} · ${formatHistoryDate(item.createdAt)} 기록을 삭제할까요?`);
    if (!ok) return;
    setItems(deleteAnalysisHistoryItem(item.id));
  };

  return (
    <main className="min-h-screen text-white" style={{ background: PAGE_BG }}>
      <div className="mx-auto w-full max-w-[900px] px-3 py-5 md:px-6 md:py-10 pb-[calc(28px+env(safe-area-inset-bottom))]">
        <div className="mb-5 flex flex-col gap-3 md:mb-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/48 md:text-[12px]">
              MY ANALYSIS
            </p>
            <h1 className="mt-2 text-2xl font-extrabold md:text-4xl">내 분석 기록</h1>
            <p className="mt-2 text-[13px] leading-6 md:text-[15px]" style={{ color: TEXT_SUB }}>
              지금까지 분석한 경기 리포트를 다시 볼 수 있습니다. (이 기기에만 저장됩니다)
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/5 md:w-auto md:px-5"
            style={{ borderColor: STROKE, background: 'rgba(255,255,255,0.03)' }}
          >
            <ArrowLeft size={16} />
            홈으로
          </button>
        </div>

        {items.length === 0 ? (
          <div
            className="rounded-3xl border p-8 text-center"
            style={{ borderColor: STROKE, background: CARD_BG }}
          >
            <Clapperboard size={28} className="mx-auto text-[#FFB648]" />
            <h2 className="mt-4 text-lg font-bold">아직 저장된 분석 기록이 없습니다</h2>
            <p className="mt-3 text-sm leading-7" style={{ color: TEXT_SUB }}>
              경기를 촬영하고 AI 분석을 완료하면 이곳에 자동으로 기록됩니다.
            </p>
            <button
              type="button"
              onClick={() => navigate('/mobile-capture')}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-black"
              style={{ background: '#FF9F02' }}
            >
              촬영하러 가기
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border p-4"
                style={{ borderColor: STROKE, background: CARD_BG }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold">{item.playerName}</div>
                    <div className="mt-1 text-xs text-white/48">
                      {formatHistoryDate(item.createdAt)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white/80">
                    클립 {item.clipCount}개
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: TEXT_SUB }}>
                  {item.position ? <span>포지션 {item.position}</span> : null}
                  {item.uniformColor ? <span>유니폼 {item.uniformColor}</span> : null}
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpen(item)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-black"
                    style={{ background: '#FF9F02' }}
                  >
                    리포트 다시 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    aria-label="삭제"
                    className="inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold"
                    style={{
                      borderColor: 'rgba(255,90,80,0.30)',
                      background: 'rgba(255,90,80,0.12)',
                      color: '#ff8d84',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
