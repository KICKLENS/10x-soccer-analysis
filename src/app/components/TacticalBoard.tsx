import { useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
} from 'lucide-react';

export type BoardTokenType = 'home' | 'away' | 'ball' | 'cone' | 'arrow';

export type BoardToken = {
  id: string;
  type: BoardTokenType;
  x: number; // 0-100 (%)
  y: number; // 0-100 (%)
  num?: number;
  angle?: number; // arrow 회전 각도(deg), 0 = 오른쪽
};

// 기준 아이콘(ArrowRight)은 오른쪽(0deg)을 가리킴 → angle만큼 회전
const ARROWS: { key: string; angle: number; Icon: typeof ArrowUp }[] = [
  { key: 'up-left', angle: -135, Icon: ArrowUpLeft },
  { key: 'up', angle: -90, Icon: ArrowUp },
  { key: 'up-right', angle: -45, Icon: ArrowUpRight },
  { key: 'left', angle: 180, Icon: ArrowLeft },
  { key: 'right', angle: 0, Icon: ArrowRight },
  { key: 'down-left', angle: 135, Icon: ArrowDownLeft },
  { key: 'down', angle: 90, Icon: ArrowDown },
  { key: 'down-right', angle: 45, Icon: ArrowDownRight },
];

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
  const [selected, setSelected] = useState<string | null>(null);

  const posFromEvent = (clientX: number, clientY: number) => {
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return { x: 50, y: 50 };
    return {
      x: clamp(((clientX - r.left) / r.width) * 100, 3, 97),
      y: clamp(((clientY - r.top) / r.height) * 100, 5, 95),
    };
  };

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
    if (!editable) return;
    e.stopPropagation();
    dragRef.current = { id, moved: false, sx: e.clientX, sy: e.clientY };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const addToken = (type: BoardTokenType, angle?: number) => {
    if (!onChange) return;
    onChange((prev) => {
      const num =
        type === 'home' || type === 'away'
          ? prev.filter((t) => t.type === type).length + 1
          : undefined;
      const jitter = () => 50 + (Math.random() - 0.5) * 22;
      return [...prev, { id: uid(), type, x: jitter(), y: jitter(), num, angle }];
    });
  };

  const deleteToken = (id: string) => {
    onChange?.((prev) => prev.filter((t) => t.id !== id));
    setSelected(null);
  };

  const clearAll = () => {
    if (!value.length) return;
    if (!window.confirm('필드 위 아이콘을 모두 지울까요?')) return;
    onChange?.(() => []);
    setSelected(null);
  };

  const homeCount = value.filter((t) => t.type === 'home').length;
  const awayCount = value.filter((t) => t.type === 'away').length;

  return (
    <div>
      {editable && (
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
      )}

      {editable && (
        <div style={{ marginBottom: 10 }}>
          <div style={arrowLabelStyle}>방향 화살표</div>
          <div style={arrowPaletteStyle}>
            {ARROWS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => addToken('arrow', a.angle)}
                style={arrowBtnStyle}
                aria-label={`${a.key} 화살표`}
              >
                <a.Icon size={18} strokeWidth={2.6} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={fieldRef} style={fieldStyle} onPointerDown={() => setSelected(null)}>
        <svg viewBox="0 0 100 64" preserveAspectRatio="none" style={svgStyle}>
          <g fill="none" stroke={LINE} strokeWidth="0.4" opacity="0.9">
            <rect x="3" y="3" width="94" height="58" rx="1.5" />
            <line x1="50" y1="3" x2="50" y2="61" />
            <circle cx="50" cy="32" r="9" />
            <circle cx="50" cy="32" r="0.8" fill={LINE} />
            {/* 좌측 박스 */}
            <rect x="3" y="17" width="14" height="30" />
            <rect x="3" y="25" width="6" height="14" />
            <circle cx="11" cy="32" r="0.7" fill={LINE} />
            {/* 우측 박스 */}
            <rect x="83" y="17" width="14" height="30" />
            <rect x="91" y="25" width="6" height="14" />
            <circle cx="89" cy="32" r="0.7" fill={LINE} />
          </g>
        </svg>

        {value.map((t) => (
          <div
            key={t.id}
            onPointerDown={(e) => onTokenPointerDown(e, t.id)}
            style={{
              ...tokenWrapStyle,
              left: `${t.x}%`,
              top: `${t.y}%`,
              cursor: editable ? 'grab' : 'default',
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

        {value.length === 0 && (
          <div style={hintOverlayStyle}>
            위 버튼을 눌러 선수·공을 추가한 뒤<br />손가락으로 끌어 배치해 보세요 ⚽
          </div>
        )}
      </div>

      {editable && (
        <div style={boardFooterStyle}>
          <span style={countTextStyle}>
            우리팀 {homeCount} · 상대팀 {awayCount}
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
  if (t.type === 'ball') {
    return <div style={{ ...ballStyle }}>⚽</div>;
  }
  if (t.type === 'cone') {
    return <div style={{ ...coneStyle }}>🔻</div>;
  }
  if (t.type === 'arrow') {
    return (
      <div style={{ ...arrowTokenStyle, transform: `rotate(${t.angle ?? 0}deg)` }}>
        <ArrowRight size={26} strokeWidth={3.2} color="#FFE08A" />
      </div>
    );
  }
  const color = t.type === 'home' ? HOME : AWAY;
  return (
    <div style={{ ...playerStyle, background: color }}>
      {t.num ?? ''}
    </div>
  );
}

const paletteStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 7,
  marginBottom: 10,
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

const arrowLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'rgba(214,228,247,0.6)',
  marginBottom: 6,
};

const arrowPaletteStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(8, 1fr)',
  gap: 6,
};

const arrowBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '9px 0',
  borderRadius: 10,
  border: '1px solid rgba(255,224,138,0.4)',
  background: 'rgba(255,224,138,0.12)',
  color: '#FFE08A',
  cursor: 'pointer',
};

const arrowTokenStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
};

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
  pointerEvents: 'none',
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
};

const countTextStyle: CSSProperties = {
  fontSize: 12,
  color: 'rgba(214,228,247,0.65)',
  fontWeight: 600,
};

const clearBtnStyle: CSSProperties = {
  padding: '7px 12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(214,228,247,0.8)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};
