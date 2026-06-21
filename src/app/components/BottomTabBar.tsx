import { CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Video, Clapperboard, NotebookPen, FolderClosed } from 'lucide-react';

type Tab = {
  label: string;
  to: string;
  icon: typeof Home;
  matchPaths?: string[];
};

const TABS: Tab[] = [
  { label: '홈', to: '/', icon: Home },
  { label: '촬영', to: '/mobile-capture', icon: Video, matchPaths: ['/mobile-capture', '/capture'] },
  { label: '분석', to: '/video-analysis', icon: Clapperboard, matchPaths: ['/video-analysis', '/ai-video-analysis'] },
  { label: '일지', to: '/training-journal', icon: NotebookPen },
  { label: '기록', to: '/analysis-history', icon: FolderClosed },
];

export default function BottomTabBar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav style={barStyle} className="md:hidden" aria-label="주요 메뉴">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const paths = tab.matchPaths ?? [tab.to];
        const isActive =
          tab.to === '/' ? location.pathname === '/' : paths.some((p) => location.pathname.startsWith(p));
        return (
          <button
            key={tab.to}
            type="button"
            onClick={() => navigate(tab.to)}
            style={{ ...itemStyle, color: isActive ? '#FFB648' : 'rgba(255,255,255,0.62)' }}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
            <span style={{ ...labelStyle, fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const barStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 60,
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'space-around',
  gap: 2,
  padding: '8px 6px calc(8px + env(safe-area-inset-bottom, 0px))',
  background: 'rgba(7,11,20,0.92)',
  borderTop: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 -8px 24px rgba(0,0,0,0.35)',
};

const itemStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  padding: '4px 0',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  transition: 'color 0.18s ease',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1,
};
