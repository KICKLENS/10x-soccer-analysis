import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react';

export type BoardTokenType = 'home' | 'away' | 'ball' | 'cone' | 'arrow';

export type BoardToken = {
  id: string;
  type: BoardTokenType;
  x: number; // 점 토큰 위치 또는 화살표 시작점 (0-100 %)
  y: number;
  num?: number;
  x2?: number; // 화살표 끝점 (0-100 %)
  y2?: number;
  team?: 'home' | 'away'; // 화살표 색 구분
};

const FIELD_BLUE_TOP = '#1f57a3';
const FIELD_BLUE_BOTTOM = '#12356a';
const LINE = '#FF8A1E';
const HOME = '#2f7be0';
const AWAY = '#FF7A2F';

function uid() {
  return `tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function TacticalBoard({
  value,
  onChange,
  editable = true,
}: {
  value: BoardToken[];
  onChange?: Dispatch<SetStateAction<BoardToken[]>>;
  editable?: boolean;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean; sx: number; sy: number } | null>(null);
  const draftRef = useRef<{ team: 'home' | 'away'; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawTeam, setDrawTeam] = useState<'home' | 'away' | null>(null);
  const [draft, setDraft] = useState<typeof draftRef.current>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = fieldRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = value.filter((t) => t.type !== 'arrow');
  const arrows = value.filter((t) => t.type === 'arrow' && t.x2 != null && t.y2 != null);
  const W = size.w || 100;
  const H = size.h || 64;

  const posFromEvent = (clientX: number, clientY: number) => {
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return { x: 50, y: 50 };
    return {
      x: clamp(((clientX - r.left) / r.width) * 100, 2, 98),
      y: clamp(((clientY - r.top) / r.height) * 100, 3, 97),
    };
  };

  // ── 점 토큰 이동 ──
  const handleMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || !onChange) return;
    if (Math.abs(e.clientX - d.sx) > 5 || Math.abs(e.clientY - d.sy) > 5) d.moved = true;
    if (d.moved) {
      const { x, y } = posFromEvent(e.clientX, e.clientY);
      onChange((prev) => prev.map((t) => (t.id === d.id ? { ...t, x, y } : t)));
    }
  };
  const handleUp = () => {
    const d = dragRef.current;
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    if (d && !d.moved) setSelected((s) => (s === d.id ? null : d.id));
    dragRef.current = null;
  };
  const onTokenPointerDown = (e: React.PointerEvent, id: string) => {
    if (!editable || drawTeam) return;
    e.stopPropagation();
    dragRef.current = { id, moved: false, sx: e.clientX, sy: e.clientY };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  // ── 화살표 그리기 ──
  const handleDrawMove = (e: PointerEvent) => {
    const d = draftRef.current;
    if (!d) return;
    const { x, y } = posFromEvent(e.clientX, e.clientY);
    const next = { ...d, x2: x, y2: y };
    draftRef.current = next;
    setDraft(next);
  };
  const handleDrawUp = () => {
    window.removeEventListener('pointermove', handleDrawMove);
    window.removeEventListener('pointerup', handleDrawUp);
    const d = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    setDrawTeam(null);
    if (!d || !onChange) return;
    const dxPx = ((d.x2 - d.x1) / 100) * W;
    const dyPx = ((d.y2 - d.y1) / 100) * H;
    if (Math.hypot(dxPx, dyPx) < 14) return; // 너무 짧으면 취소
    onChange((prev) => [
      ...prev,
      { id: uid(), type: 'arrow', x: d.x1, y: d.y1, x2: d.x2, y2: d.y2, team: d.team },
    ]);
  };
  const onFieldPointerDown = (e: React.PointerEvent) => {
    if (drawTeam) {
      const { x, y } = posFromEvent(e.clientX, e.clientY);
      const start = { team: drawTeam, x1: x, y1: y, x2: x, y2: y };
      draftRef.current = start;
      setDraft(start);
      window.addEventListener('pointermove', handleDrawMove);
      window.addEventListener('pointerup', handleDrawUp);
      return;
    }
    setSelected(null);
  };

  const addToken = (type: BoardTokenType) => {
    if (!onChange) return;
    setDrawTeam(null);
    onChange((prev) => {
      const num =
        type === 'home' || type === 'away'
          ? prev.filter((t) => t.type === type).length + 1
          : undefined;
      const jitter = () => 50 + (Math.random() - 0.5) * 22;
      return [...prev, { id: uid(), type, x: jitter(), y: jitter(), num }];
    });
  };

  const armArrow = (team: 'home' | 'away') => {
    setSelected(null);
    setDrawTeam((cur) => (cur === team ? null : team));
  };

  const deleteToken = (id: string) => {
    onChange?.((prev) => prev.filter((t) => t.id !== id));
    setSelected(null);
  };

  const clearAll = () => {
    if (!value.length) return;
    if (!window.confirm('필드 위 아이콘과 화살표를 모두 지울까요?')) return;
    onChange?.(() => []);
    setSelected(null);
    setDrawTeam(null);
  };

  const homeCount = points.filter((t) => t.type === 'home').length;
  const awayCount = points.filter((t) => t.type === 'away').length;

  return (
    <div>
      {editable && (
        <>
          <div style={paletteStyle}>
            <button type="button" onClick={() => addToken('home')} style={paletteBtn(HOME)}>
              <span style={dot(HOME)} /> 우리팀 +
            </button>
            <button type="button" onClick={() => addToken('away')} style={paletteBtn(AWAY)}>
              <span style={dot(AWAY)} /> 상대팀 +
            </button>
            <button type="button" onClick={() => addToken('ball')} style={paletteBtn('#cfd8e6')}>
              ⚽ 공 +
            </button>
            <button type="button" onClick={() => addToken('cone')} style={paletteBtn('#FFC83D')}>
              🔻 콘 +
            </button>
          </div>

          <div style={arrowRowStyle}>
            <button
              type="button"
              onClick={() => armArrow('home')}
              style={{ ...arrowArmBtn(HOME), ...(drawTeam === 'home' ? arrowArmActive(HOME) : null) }}
            >
              <span style={arrowSwatch(HOME)} /> 우리팀 화살표
            </button>
            <button
              type="button"
              onClick={() => armArrow('away')}
              style={{ ...arrowArmBtn(AWAY), ...(drawTeam === 'away' ? arrowArmActive(AWAY) : null) }}
            >
              <span style={arrowSwatch(AWAY)} /> 상대팀 화살표
            </button>
          </div>
        </>
      )}

      <div
        ref={fieldRef}
        style={{ ...fieldStyle, cursor: drawTeam ? 'crosshair' : 'default' }}
        onPointerDown={onFieldPointerDown}
      >
        {/* 필드 라인 */}
        <svg viewBox="0 0 100 64" preserveAspectRatio="none" style={svgStyle}>
          <g fill="none" stroke={LINE} strokeWidth="0.4" opacity="0.9">
            <rect x="3" y="3" width="94" height="58" rx="1.5" />
            <line x1="50" y1="3" x2="50" y2="61" />
            <circle cx="50" cy="32" r="9" />
            <circle cx="50" cy="32" r="0.8" fill={LINE} />
            <rect x="3" y="17" width="14" height="30" />
            <rect x="3" y="25" width="6" height="14" />
            <circle cx="11" cy="32" r="0.7" fill={LINE} />
            <rect x="83" y="17" width="14" height="30" />
            <rect x="91" y="25" width="6" height="14" />
            <circle cx="89" cy="32" r="0.7" fill={LINE} />
          </g>
        </svg>

        {/* 화살표 레이어 (픽셀 좌표) */}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={svgStyle}>
          <defs>
            <marker id="ah-home" markerWidth="5" markerHeight="5" refX="3.4" refY="2.5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L5,2.5 L0,5 Z" fill={HOME} />
            </marker>
            <marker id="ah-away" markerWidth="5" markerHeight="5" refX="3.4" refY="2.5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L5,2.5 L0,5 Z" fill={AWAY} />
            </marker>
          </defs>
          {arrows.map((a) => {
            const color = a.team === 'away' ? AWAY : HOME;
            const x1 = (a.x / 100) * W;
            const y1 = (a.y / 100) * H;
            const x2 = ((a.x2 as number) / 100) * W;
            const y2 = ((a.y2 as number) / 100) * H;
            const isSel = selected === a.id;
            return (
              <g key={a.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={isSel ? 5 : 3.5}
                  strokeLinecap="round"
                  markerEnd={`url(#ah-${a.team === 'away' ? 'away' : 'home'})`}
                  style={{ pointerEvents: 'none' }}
                />
                {editable && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={18}
                    strokeLinecap="round"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelected((s) => (s === a.id ? null : a.id));
                    }}
                  />
                )}
              </g>
            );
          })}
          {draft && (
            <line
              x1={(draft.x1 / 100) * W}
              y1={(draft.y1 / 100) * H}
              x2={(draft.x2 / 100) * W}
              y2={(draft.y2 / 100) * H}
              stroke={draft.team === 'away' ? AWAY : HOME}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeDasharray="6 5"
              opacity={0.85}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>

        {/* 선택된 화살표 삭제 배지 */}
        {editable &&
          arrows.map((a) =>
            selected === a.id ? (
              <button
                key={`del-${a.id}`}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteToken(a.id);
                }}
                style={{
                  ...delBadgeStyle,
                  position: 'absolute',
                  left: `${(a.x + (a.x2 as number)) / 2}%`,
                  top: `${(a.y + (a.y2 as number)) / 2}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                aria-label="화살표 삭제"
              >
                ×
              </button>
            ) : null,
          )}

        {/* 점 토큰 */}
        {points.map((t) => (
          <div
            key={t.id}
            onPointerDown={(e) => onTokenPointerDown(e, t.id)}
            style={{
              ...tokenWrapStyle,
              left: `${t.x}%`,
              top: `${t.y}%`,
              cursor: editable && !drawTeam ? 'grab' : 'default',
            }}
          >
            {renderToken(t)}
            {editable && selected === t.id && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteToken(t.id);
                }}
                style={delBadgeStyle}
                aria-label="삭제"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {drawTeam && (
          <div style={drawHintStyle}>
            {drawTeam === 'home' ? '우리팀' : '상대팀'} 화살표 — 필드를 손가락으로 끌어 그리세요 ✏️
          </div>
        )}

        {value.length === 0 && !drawTeam && (
          <div style={hintOverlayStyle}>
            버튼으로 선수·공을 추가하거나<br />화살표를 골라 끌어서 그려보세요 ⚽
          </div>
        )}
      </div>

      {editable && (
        <div style={boardFooterStyle}>
          <span style={countTextStyle}>
            우리팀 {homeCount} · 상대팀 {awayCount} · 화살표 {arrows.length}
          </span>
          <button type="button" onClick={clearAll} style={clearBtnStyle}>
            전체 지우기
          </button>
        </div>
      )}
    </div>
  );
}

function renderToken(t: BoardToken) {
  if (t.type === 'ball') return <div style={ballStyle}>⚽</div>;
  if (t.type === 'cone') return <div style={coneStyle}>🔻</div>;
  const color = t.type === 'home' ? HOME : AWAY;
  return <div style={{ ...playerStyle, background: color }}>{t.num ?? ''}</div>;
}

const paletteStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 7,
  marginBottom: 8,
};

const paletteBtn = (accent: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  padding: '10px 4px',
  borderRadius: 12,
  border: `1px solid ${accent}55`,
  background: `${accent}1f`,
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
});

const dot = (c: string): CSSProperties => ({
  width: 11,
  height: 11,
  borderRadius: '50%',
  background: c,
  display: 'inline-block',
});

const arrowRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 7,
  marginBottom: 10,
};

const arrowArmBtn = (accent: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '10px 4px',
  borderRadius: 12,
  border: `1px solid ${accent}66`,
  background: `${accent}14`,
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
});

const arrowArmActive = (accent: string): CSSProperties => ({
  background: `${accent}40`,
  borderColor: accent,
  boxShadow: `0 0 0 2px ${accent}55`,
});

const arrowSwatch = (c: string): CSSProperties => ({
  width: 18,
  height: 3,
  borderRadius: 2,
  background: c,
  display: 'inline-block',
});

const fieldStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '100 / 64',
  borderRadius: 16,
  overflow: 'hidden',
  background: `linear-gradient(160deg, ${FIELD_BLUE_TOP} 0%, ${FIELD_BLUE_BOTTOM} 100%)`,
  border: '1px solid rgba(255,138,30,0.35)',
  boxShadow: 'inset 0 0 40px rgba(0,0,0,0.25)',
  touchAction: 'none',
  userSelect: 'none',
};

const svgStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
};

const tokenWrapStyle: CSSProperties = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  touchAction: 'none',
};

const playerStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: 13,
  fontWeight: 800,
  border: '2px solid rgba(255,255,255,0.92)',
  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
};

const ballStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  background: '#fff',
  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
};

const coneStyle: CSSProperties = {
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
};

const delBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: -10,
  right: -10,
  width: 20,
  height: 20,
  borderRadius: '50%',
  border: '1.5px solid #fff',
  background: '#e5484d',
  color: '#fff',
  fontSize: 13,
  fontWeight: 900,
  lineHeight: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
  zIndex: 5,
};

const drawHintStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 10,
  transform: 'translateX(-50%)',
  padding: '6px 12px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.55)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

const hintOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  color: 'rgba(255,255,255,0.78)',
  fontSize: 12.5,
  lineHeight: 1.7,
  fontWeight: 600,
  pointerEvents: 'none',
  padding: 16,
};

const boardFooterStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 9,
  gap: 8,
};

const countTextStyle: CSSProperties = {
  fontSize: 12,
  color: 'rgba(214,228,247,0.65)',
  fontWeight: 600,
};

const clearBtnStyle: CSSProperties = {
  flexShrink: 0,
  padding: '7px 12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(214,228,247,0.8)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};
