import { CSSProperties, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PurchaseModal, { useCredits } from './PurchaseModal';

type NavLink = { label: string; to: string; icon?: string };

const DEFAULT_LINKS: NavLink[] = [
  { label: '홈', to: '/', icon: '🏠' },
  { label: '경기 촬영', to: '/mobile-capture', icon: '🎥' },
  { label: '영상 분석', to: '/video-analysis', icon: '🎬' },
  { label: '훈련일지', to: '/training-journal', icon: '📒' },
  { label: '내 기록', to: '/analysis-history', icon: '📁' },
];

type PageNavProps = {
  links?: NavLink[];
  showBack?: boolean;
};

export default function PageNav({ links = DEFAULT_LINKS, showBack = true }: PageNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const credits = useCredits();
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <>
      <nav style={navStyle}>
        {showBack && (
          <button type="button" onClick={goBack} style={backButtonStyle} aria-label="뒤로 가기">
            <ArrowLeft size={16} />
            <span>뒤로</span>
          </button>
        )}

        <div style={linksScrollStyle}>
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <button
                key={link.to}
                type="button"
                onClick={() => navigate(link.to)}
                style={{ ...linkPillStyle, ...(isActive ? activeLinkStyle : null) }}
              >
                {link.icon ? <span style={{ fontSize: 13 }}>{link.icon}</span> : null}
                <span>{link.label}</span>
              </button>
            );
          })}
        </div>

        {/* 크레딧 잔액 + 충전 버튼 */}
        <button
          type="button"
          onClick={() => setPurchaseOpen(true)}
          style={creditButtonStyle}
          title="크레딧 충전"
        >
          <span style={{ fontSize: 12 }}>💳</span>
          <span style={{ fontWeight: 700, color: '#FFB648' }}>{credits.toLocaleString()}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>c</span>
        </button>
      </nav>

      <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
    </>
  );
}

const navStyle: CSSProperties = {
  position: 'sticky',
  top: 8,
  zIndex: 30,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(14,16,22,0.82)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: '0 8px 22px rgba(0,0,0,0.30)',
};

const backButtonStyle: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '7px 11px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#f7f7f8',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const linksScrollStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  overflowX: 'auto',
  flex: 1,
  scrollbarWidth: 'none',
  WebkitOverflowScrolling: 'touch',
};

const linkPillStyle: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '7px 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.78)',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

const activeLinkStyle: CSSProperties = {
  background: 'rgba(255,159,2,0.16)',
  border: '1px solid rgba(255,159,2,0.45)',
  color: '#FFB648',
};

const creditButtonStyle: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '7px 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,159,2,0.35)',
  background: 'rgba(255,159,2,0.10)',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
