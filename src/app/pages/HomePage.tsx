import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import {
  ArrowRight,
  Archive,
  BarChart3,
  Brain,
  CheckCircle2,
  ClipboardList,
  NotebookPen,
  PlayCircle,
  Radar,
  Sparkles,
  Target,
  Upload,
  Video,
} from 'lucide-react';
import { readSelectedPlayer } from '../lib/api';
import OnboardingOverlay from '../components/OnboardingOverlay';
import BottomTabBar from '../components/BottomTabBar';

const PAGE_LINKS = {
  home: '/',
  playerRegistration: '/player-registration',
  mobileCapture: '/mobile-capture',
} as const;

const LOGO_SRC = '/10x-ai-sports-logo.png';
const HERO_IMAGE = '/hero-ai-soccer.png';
const SHOWCASE_IMAGE = '/showcase-ai-vision.jpg';

const SERVICE_THUMB_HIGHLIGHT = '/service-thumb-highlight.png';
const SERVICE_THUMB_ANALYSIS = '/service-thumb-analysis.png';
const SERVICE_THUMB_JOURNAL = '/service-thumb-journal.png';
const ANALYSIS_DASHBOARD_IMAGE = '/analysis-dashboard.png';

const PAGE_BG = '#070b14';
const CARD_BG_SOLID = '#0d1220';
const STROKE = 'rgba(255,255,255,0.08)';
const TEXT_SUB = 'rgba(225,231,242,0.72)';
const POINT_COLOR = '#FF9F02';
const HEADER_BG = 'rgba(5, 8, 16, 0.72)';

const GLOBAL_STYLES = [
  '@keyframes particleMove {',
  '  0% { transform: translate3d(0, 0, 0) scale(0.96); }',
  '  100% { transform: translate3d(var(--drift-x), var(--drift-y), 0) scale(1.06); }',
  '}',
  '@keyframes particlePulse {',
  '  0% { opacity: 0.38; }',
  '  50% { opacity: 1; }',
  '  100% { opacity: 0.46; }',
  '}',
  '@keyframes particleTwinkle {',
  '  0% { filter: brightness(1); }',
  '  50% { filter: brightness(1.38); }',
  '  100% { filter: brightness(1.02); }',
  '}',
  /* Tailwind preflight forces img { height: auto }, which breaks fixed-height */
  /* image layouts. These unlayered rules win and restore intended sizing. */
  '.brand-logo { height: 22px; width: auto; object-fit: contain; }',
  '@media (min-width: 768px) { .brand-logo { height: 26px; } }',
  '.brand-logo-lg { height: 30px; width: auto; object-fit: contain; }',
  '@media (min-width: 768px) { .brand-logo-lg { height: 46px; } }',
  '@media (min-width: 1024px) { .brand-logo-lg { height: 54px; } }',
  '.cover-img { display: block; height: 100%; width: 100%; object-fit: cover; }',
  '.fill-img { position: absolute; inset: 0; height: 100%; width: 100%; object-fit: cover; }',
].join('\n');

type Particle = {
  id: number;
  left: number;
  top: number;
  size: number;
  color: string;
  duration: number;
  pulseDuration: number;
  twinkleDuration: number;
  delay: number;
  driftX: number;
  driftY: number;
  opacity: number;
  glow: string;
  isWhite: boolean;
};

type ButtonVariant = 'primary' | 'dark' | 'outline';

type MetallicButtonProps = {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?: ButtonVariant;
};

type SafeImageProps = {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  fallbackDesc?: string;
  objectPosition?: string;
};

function scrollToId(id: string) {
  if (typeof window === 'undefined') return;
  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function goToPage(path?: string, fallbackId?: string) {
  if (typeof window === 'undefined') return;

  if (path && path.trim().length > 0) {
    window.location.assign(path);
    return;
  }

  if (fallbackId) {
    scrollToId(fallbackId);
  }
}

function useAppNavigate() {
  const navigate = useNavigate();
  return (path: string) => {
    if (path.startsWith('/')) {
      navigate(path);
      return;
    }
    goToPage(path);
  };
}

function SectionBadge({ children }: { children: ReactNode }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/78"
      style={{
        borderColor: 'rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <Sparkles size={14} className="text-[#FFB648]" />
      <span>{children}</span>
    </div>
  );
}

function SectionHeading({
  title,
  description,
  align = 'left',
}: {
  title: ReactNode;
  description: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-[860px] text-center' : 'max-w-[760px]'}>
      <h2 className="text-[22px] font-extrabold leading-[1.18] text-white md:text-5xl md:leading-[1.08]">{title}</h2>
      <p className="mt-3 text-[14px] leading-7 md:mt-6 md:text-[17px] md:leading-8" style={{ color: TEXT_SUB }}>
        {description}
      </p>
    </div>
  );
}

function MetallicButton({
  children,
  onClick,
  variant = 'primary',
}: MetallicButtonProps) {
  let className =
    'group inline-flex items-center justify-center gap-2 rounded-2xl border px-6 py-4 text-[15px] font-semibold transition-all duration-300';
  let style: CSSProperties = {
    borderColor: 'rgba(255,255,255,0.1)',
    boxShadow: '0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
  };

  if (variant === 'primary') {
    className += ' text-black';
    style = {
      ...style,
      background:
        'linear-gradient(180deg, rgba(255,197,92,1) 0%, rgba(255,159,2,1) 55%, rgba(233,131,0,1) 100%)',
      borderColor: 'rgba(255,210,120,0.52)',
    };
  } else if (variant === 'dark') {
    className += ' text-white';
    style = {
      ...style,
      background:
        'linear-gradient(180deg, rgba(38,44,60,0.96) 0%, rgba(20,24,37,0.98) 100%)',
      borderColor: 'rgba(255,255,255,0.12)',
    };
  } else {
    className += ' text-white';
    style = {
      ...style,
      background: 'rgba(255,255,255,0.03)',
      borderColor: 'rgba(255,255,255,0.12)',
      backdropFilter: 'blur(12px)',
    };
  }

  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {children}
    </button>
  );
}

function SafeImage({
  src,
  alt,
  className = '',
  fallbackTitle = 'Preview Image',
  fallbackDesc = 'public 폴더에 이미지 파일을 넣으면 이 영역에 표시됩니다.',
  objectPosition = 'center',
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[28px] border"
        style={{
          borderColor: 'rgba(255,255,255,0.08)',
          background:
            'linear-gradient(135deg, rgba(24,30,48,0.96) 0%, rgba(11,15,28,0.98) 100%)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,159,2,0.16),transparent_24%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.06),transparent_18%)]" />
        <div className="relative z-10 max-w-[340px] px-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/56">
            IMAGE FALLBACK
          </p>
          <h3 className="mt-4 text-xl font-bold text-white">{fallbackTitle}</h3>
          <p className="mt-3 text-sm leading-7 text-white/64">{fallbackDesc}</p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ objectPosition }}
      onError={() => setHasError(true)}
      draggable={false}
    />
  );
}

function particleGlow(size: number, multiplier: number) {
  return (size * multiplier).toFixed(1);
}

function FloatingParticles() {
  const particles = useMemo<Particle[]>(() => {
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    const particleCount = isMobile ? 44 : 240;
    return Array.from({ length: particleCount }, (_, index) => {
      const isWhite = Math.random() < 0.64;
      const size = isMobile ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 6) + 2;

      const whitePalette = [
        'rgba(255,255,255,0.98)',
        'rgba(248,250,255,0.96)',
        'rgba(240,246,255,0.94)',
      ];

      const colorPalette = [
        'rgba(255,159,2,0.82)',
        'rgba(255,215,128,0.76)',
        'rgba(104,202,255,0.72)',
        'rgba(176,148,255,0.66)',
      ];

      const color = isWhite
        ? whitePalette[Math.floor(Math.random() * whitePalette.length)]
        : colorPalette[Math.floor(Math.random() * colorPalette.length)];

      const glow = isWhite
        ? `0 0 ${particleGlow(size, 2.3)}px rgba(255,255,255,0.94), 0 0 ${particleGlow(size, 5.8)}px rgba(255,255,255,0.42)`
        : `0 0 ${particleGlow(size, 1.6)}px rgba(255,255,255,0.18), 0 0 ${particleGlow(size, 3.4)}px rgba(255,159,2,0.16)`;

      return {
        id: index,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size,
        color,
        duration: 4.6 + Math.random() * 3.8,
        pulseDuration: 1.5 + Math.random() * 1.4,
        twinkleDuration: 0.9 + Math.random() * 1.2,
        delay: Math.random() * 3.6,
        driftX: isMobile ? -14 + Math.random() * 28 : -28 + Math.random() * 56,
        driftY: isMobile ? -18 + Math.random() * 36 : -34 + Math.random() * 68,
        opacity: isWhite ? 0.5 + Math.random() * 0.34 : 0.24 + Math.random() * 0.28,
        glow,
        isWhite,
      };
    });
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((particle) => {
        const particleStyle = {
          left: `${particle.left}%`,
          top: `${particle.top}%`,
          width: `${particle.size}px`,
          height: `${particle.size}px`,
          background: particle.color,
          opacity: particle.opacity,
          boxShadow: particle.glow,
          animation:
            `particleMove ${particle.duration}s ease-in-out ${particle.delay}s infinite alternate, ` +
            `particlePulse ${particle.pulseDuration}s ease-in-out ${particle.delay}s infinite, ` +
            `particleTwinkle ${particle.twinkleDuration}s ease-in-out ${particle.delay}s infinite`,
          filter: particle.isWhite ? 'brightness(1.18)' : 'brightness(1)',
          transform: 'translate3d(0,0,0)',
          ['--drift-x' as any]: `${particle.driftX}px`,
          ['--drift-y' as any]: `${particle.driftY}px`,
        } as CSSProperties;

        return <span key={particle.id} className="absolute rounded-full" style={particleStyle} />;
      })}
    </div>
  );
}

function BenefitItem({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[24px] border p-5 md:p-6"
      style={{
        borderColor: STROKE,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.02) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(255,159,2,0.12),transparent_24%)]" />
      <div className="relative z-10">
        <div
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border"
          style={{
            borderColor: 'rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          {icon}
        </div>
        <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
        <p className="mt-3 text-sm leading-7" style={{ color: TEXT_SUB }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

function ServiceCard({
  image,
  eyebrow,
  title,
  desc,
  bullets,
}: {
  image: string;
  eyebrow: string;
  title: string;
  desc: string;
  bullets: string[];
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[30px] border p-5 md:p-6"
      style={{
        borderColor: STROKE,
        background:
          'linear-gradient(180deg, rgba(14,19,33,0.96) 0%, rgba(10,14,26,0.98) 100%)',
        boxShadow: '0 22px 48px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(255,159,2,0.10),transparent_22%),radial-gradient(circle_at_84%_80%,rgba(255,255,255,0.04),transparent_18%)]" />

      <div className="relative z-10">
        <div
          className="relative mb-5 h-[170px] overflow-hidden rounded-[22px] border md:mb-6 md:h-[180px]"
          style={{
            borderColor: 'rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <SafeImage
            src={image}
            alt={title}
            className="cover-img"
            fallbackTitle={title}
            fallbackDesc="서비스 카드용 PNG 썸네일 파일을 public 폴더에 넣어주세요."
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,10,18,0.04)_0%,rgba(8,10,18,0.26)_100%)]" />
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/54">
          {eyebrow}
        </p>
        <h3 className="mt-3 text-xl font-bold text-white md:text-2xl">{title}</h3>
        <p className="mt-3 text-sm leading-7 md:text-[15px]" style={{ color: TEXT_SUB }}>
          {desc}
        </p>

        <div className="mt-5 space-y-3">
          {bullets.map((item) => (
            <div key={item} className="flex items-start gap-3">
              <CheckCircle2 size={18} className="mt-[2px] text-[#FFB648]" />
              <p className="text-sm leading-7 text-white/76">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureTile({
  step,
  icon,
  title,
  desc,
  onClick,
}: {
  step: number;
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-[22px] border p-4 text-left transition-all duration-300 hover:-translate-y-1 md:rounded-[26px] md:p-6"
      style={{
        borderColor: STROKE,
        background:
          'linear-gradient(180deg, rgba(15,20,34,0.96) 0%, rgba(10,14,26,0.98) 100%)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_18%_12%,rgba(255,159,2,0.16),transparent_42%)]" />
      <span
        className="pointer-events-none absolute right-4 top-4 text-[12px] font-bold tracking-widest text-white/28 md:text-[13px]"
      >
        {String(step).padStart(2, '0')}
      </span>

      <div className="relative z-10 flex h-full flex-col">
        <div
          className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border md:h-14 md:w-14"
          style={{
            borderColor: 'rgba(255,210,120,0.28)',
            background:
              'linear-gradient(180deg, rgba(255,159,2,0.18) 0%, rgba(255,159,2,0.06) 100%)',
          }}
        >
          {icon}
        </div>

        <h3 className="mt-4 text-[16px] font-bold text-white md:mt-5 md:text-xl">{title}</h3>
        <p className="mt-2 text-[13px] leading-6 md:text-[14px] md:leading-7" style={{ color: TEXT_SUB }}>
          {desc}
        </p>

        <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#FFB648] md:mt-5">
          바로가기
          <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </div>
    </button>
  );
}

export default function HomePage() {
  const appNavigate = useAppNavigate();

  const handleStartClick = () => {
    const player = readSelectedPlayer();
    if (player.name) {
      appNavigate(PAGE_LINKS.mobileCapture);
      return;
    }
    appNavigate(PAGE_LINKS.playerRegistration);
  };

  const FEATURES = [
    {
      step: 1,
      icon: <Video size={24} className="text-[#FFB648]" />,
      title: '영상 촬영',
      desc: '폰으로 바로 경기 촬영 → 자동 분석',
      onClick: handleStartClick,
    },
    {
      step: 2,
      icon: <Upload size={24} className="text-[#FFB648]" />,
      title: '영상 업로드',
      desc: '찍어둔 영상 파일을 올려 분석',
      onClick: () => appNavigate('/video-analysis'),
    },
    {
      step: 3,
      icon: <Sparkles size={24} className="text-[#FFB648]" />,
      title: '하이라이트 추출',
      desc: 'SNS·공유용 하이라이트 영상 만들기',
      onClick: () => appNavigate('/highlight-extraction'),
    },
    {
      step: 4,
      icon: <Archive size={24} className="text-[#FFB648]" />,
      title: '하이라이트 보관함',
      desc: '추출한 하이라이트와 기록 저장',
      onClick: () => appNavigate('/analysis-history'),
    },
    {
      step: 5,
      icon: <Brain size={24} className="text-[#FFB648]" />,
      title: 'AI 분석',
      desc: 'AI 코치의 상세 피드백 받기',
      onClick: () => appNavigate('/ai-video-analysis'),
    },
    {
      step: 6,
      icon: <NotebookPen size={24} className="text-[#FFB648]" />,
      title: '훈련일지',
      desc: '오늘 배운 것 기록하고 복습',
      onClick: () => appNavigate('/training-journal'),
    },
  ];

  return (
    <main className="min-h-screen pb-20 text-white md:pb-0" style={{ background: PAGE_BG }}>
      <style>{GLOBAL_STYLES}</style>
      <OnboardingOverlay />

      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: HEADER_BG,
          borderColor: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-4 py-2 md:px-6 md:py-3 lg:px-10">
          <button
            type="button"
            className="flex shrink-0 items-center"
            onClick={() => appNavigate(PAGE_LINKS.home)}
          >
            <img
              src={LOGO_SRC}
              alt="10X AI Sports"
              className="brand-logo-lg block"
              style={{ maxWidth: '280px' }}
            />
          </button>

          <nav className="hidden items-center gap-8 text-sm text-white/68 lg:flex">
            <button
              type="button"
              onClick={() => scrollToId('features')}
              className="transition hover:text-white"
            >
              핵심 기능
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/mobile-capture')}
              className="transition hover:text-white"
            >
              경기 촬영
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/video-analysis')}
              className="transition hover:text-white"
            >
              영상 분석
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/highlight-extraction')}
              className="font-semibold transition hover:text-[#FFB648]"
              style={{ color: '#FFB648' }}
            >
              하이라이트 추출
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/training-journal')}
              className="transition hover:text-white"
            >
              훈련일지
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/analysis-history')}
              className="transition hover:text-white"
            >
              내 기록
            </button>
            <button
              type="button"
              onClick={() => scrollToId('showcase')}
              className="transition hover:text-white"
            >
              쇼케이스
            </button>
          </nav>

          <div className="flex items-center gap-2 md:gap-3">
            {/* 클럽 전용 포털 — 메인 페이지 우측 상단 고정 */}
            <button
              type="button"
              onClick={() => appNavigate('/club')}
              className="group flex shrink-0 items-center gap-2 rounded-2xl border-2 border-indigo-400/70 bg-gradient-to-br from-indigo-600/90 to-violet-700/90 px-3 py-2 shadow-[0_4px_24px_rgba(99,102,241,0.45)] transition hover:border-indigo-300 hover:from-indigo-500 hover:to-violet-600 md:px-4 md:py-2.5"
              aria-label="클럽·감독·코치 전용 포털"
            >
              <span className="text-lg md:text-xl leading-none">🏟️</span>
              <span className="flex flex-col items-start leading-tight">
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-100 md:text-[10px]">
                  감독 · 코치 전용
                </span>
                <span className="text-xs font-black text-white md:text-sm">클럽 포털</span>
              </span>
            </button>

            <div className="hidden sm:block">
              <MetallicButton variant="outline" onClick={() => scrollToId('showcase')}>
                쇼케이스 보기
              </MetallicButton>
            </div>
            <MetallicButton variant="primary" onClick={handleStartClick}>
              시작하기
              <ArrowRight size={16} />
            </MetallicButton>
          </div>
        </div>
      </header>

      <section className="w-full px-0 pt-0">
        <div
          className="grid overflow-hidden border-b md:grid-cols-2"
          style={{
            background: CARD_BG_SOLID,
            borderColor: 'rgba(255,255,255,0.06)',
            boxShadow: '0 34px 90px rgba(0,0,0,0.34)',
          }}
        >
          <div
            className="relative flex flex-col items-center justify-center px-6 py-12 text-center md:h-[500px] md:px-14 md:py-12 lg:h-[560px] lg:px-16 lg:py-14"
            style={{
              background: `linear-gradient(180deg, ${POINT_COLOR} 0%, #f19300 100%)`,
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.18),transparent_18%),radial-gradient(circle_at_76%_70%,rgba(255,255,255,0.10),transparent_22%)]" />

            <div className="relative z-10 flex w-full max-w-[600px] flex-col items-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-black/68 md:text-[12px]">
                10X AI Soccer
              </p>

              <h1 className="mt-5 max-w-[600px] text-[34px] font-extrabold leading-[1.06] text-black md:text-[46px] lg:text-[56px]">
                10X AI Soccer Analysis
                <br />
                for Better Play
              </h1>

              <p className="mt-6 max-w-[440px] text-[15px] leading-7 text-black/82 md:text-[17px] md:leading-8">
                Understand every match moment
                <br />
                and turn it into better training.
              </p>

              <div className="mt-7 flex w-full flex-wrap items-center justify-center gap-3 md:mt-8 md:gap-4">
                <MetallicButton variant="outline" onClick={() => scrollToId('features')}>
                  기능 둘러보기
                </MetallicButton>

                <MetallicButton variant="outline" onClick={() => appNavigate('/analysis-history')}>
                  내 분석 기록
                </MetallicButton>
              </div>
            </div>
          </div>

          <div className="relative h-[240px] overflow-hidden md:h-[500px] lg:h-[560px]">
            <SafeImage
              src={HERO_IMAGE}
              alt="AI soccer hero"
              className="fill-img scale-[1.05]"
              objectPosition="center 35%"
              fallbackTitle="Hero Image"
              fallbackDesc="public/hero-ai-soccer.png 파일을 넣으면 히어로 이미지가 표시됩니다."
            />

            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,14,26,0.08)_0%,rgba(10,14,26,0.02)_36%,rgba(10,14,26,0.12)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_45%,rgba(0,212,255,0.16),transparent_20%),radial-gradient(circle_at_82%_58%,rgba(124,58,237,0.12),transparent_18%),radial-gradient(circle_at_84%_50%,rgba(255,255,255,0.06),transparent_12%)]" />
            <div className="pointer-events-none absolute -left-10 top-10 h-36 w-36 rounded-full bg-[#FF9F02]/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-6 right-8 h-40 w-40 rounded-full bg-cyan-400/8 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#0a0e1a]/16 via-[#0a0e1a]/4 to-transparent" />

            <FloatingParticles />
          </div>
        </div>
      </section>

      <section
        id="features"
        className="scroll-mt-24 mx-auto w-full max-w-[1240px] px-4 pb-10 pt-12 md:px-6 md:pb-16 md:pt-24 lg:px-10"
      >
        <div className="mb-7 text-center md:mb-12">
          <div className="flex justify-center">
            <SectionBadge>10X Growth Path</SectionBadge>
          </div>
          <div className="mt-5 flex justify-center">
            <SectionHeading
              align="center"
              title={
                <>
                  Grow <span style={{ color: POINT_COLOR }}>10X</span>. step by step
                </>
              }
              description="촬영 → 업로드 → 하이라이트 → 보관 → AI 분석 → 훈련일지. 원하는 단계를 눌러 지금 시작하세요."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          {FEATURES.map((feature) => (
            <FeatureTile
              key={feature.title}
              step={feature.step}
              icon={feature.icon}
              title={feature.title}
              desc={feature.desc}
              onClick={feature.onClick}
            />
          ))}
        </div>

        <div className="mt-10 grid gap-3 md:mt-16 md:grid-cols-3 md:gap-4">
          <BenefitItem
            icon={<PlayCircle size={18} className="text-[#FFB648]" />}
            title="핵심 장면을 빠르게 포착"
            desc="긴 경기 영상에서 중요한 순간만 더 빠르게 확인하고, 다시 봐야 할 포인트를 선명하게 정리합니다."
          />
          <BenefitItem
            icon={<Target size={18} className="text-[#FFB648]" />}
            title="훈련 포인트로 즉시 연결"
            desc="좋았던 장면과 아쉬운 장면을 단순 기록에서 끝내지 않고, 다음 훈련 액션으로 바로 이어줍니다."
          />
          <BenefitItem
            icon={<ClipboardList size={18} className="text-[#FFB648]" />}
            title="리포트와 일지를 한 흐름으로"
            desc="분석, 리포트, 훈련일지가 끊기지 않도록 연결해 코치와 선수 모두 보기 쉬운 구조를 만듭니다."
          />
        </div>
      </section>

      <section
        id="services"
        className="scroll-mt-24 mx-auto w-full max-w-[1240px] px-4 py-10 md:px-6 md:py-16 lg:px-10"
      >
        <div className="mb-7 text-center md:mb-12">
          <div className="flex justify-center">
            <SectionBadge>Core Services</SectionBadge>
          </div>
          <div className="mt-5 flex justify-center">
            <SectionHeading
              align="center"
              title="Highlight · Analysis · Journal"
              description="촬영·분석·기록이 어떻게 이어지는지, 한눈에 보이도록 정리했습니다."
            />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3 md:gap-6">
          <ServiceCard
            image={SERVICE_THUMB_HIGHLIGHT}
            eyebrow="MATCH HIGHLIGHT"
            title="경기 핵심 장면 자동 정리"
            desc="긴 경기에서 중요한 순간만 골라 빠르게 복기할 수 있도록 하이라이트를 자동으로 정리합니다."
            bullets={['중요 장면 위주로 빠르게 복기', '코칭 포인트가 필요한 순간 확인', '시청 시간 대비 인사이트 효율 향상']}
          />
          <ServiceCard
            image={SERVICE_THUMB_ANALYSIS}
            eyebrow="AI ANALYSIS"
            title="AI 분석 결과를 더 직관적으로"
            desc="수치와 시각화를 함께 보여줘 어떤 장면이 왜 중요했는지 쉽게 이해할 수 있습니다."
            bullets={['장면별 맥락과 수치 해석 보조', '반복 패턴과 개선 포인트 시각화', '리포트 전환 전 이해도 상승']}
          />
          <ServiceCard
            image={SERVICE_THUMB_JOURNAL}
            eyebrow="TRAINING JOURNAL"
            title="훈련일지로 자연스럽게 연결"
            desc="분석에서 끝나지 않고, 오늘 배운 것과 다음 목표를 가볍게 기록하며 이어갑니다."
            bullets={['분석에서 훈련일지로 자연스럽게 이동', '다음 훈련 주제 정리와 기록 축적', '선수/코치 간 커뮤니케이션 강화']}
          />
        </div>
      </section>

      <section
        id="analysis"
        className="scroll-mt-24 mx-auto w-full max-w-[1240px] px-4 py-10 md:px-6 md:py-16 lg:px-10"
      >
        <div
          className="relative overflow-hidden rounded-[28px] border px-5 py-6 md:rounded-[38px] md:px-8 md:py-8 lg:px-10 lg:py-10"
          style={{
            borderColor: STROKE,
            background: 'linear-gradient(180deg, rgba(13,18,32,0.98) 0%, rgba(8,11,20,1) 100%)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.28)',
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_14%,rgba(255,159,2,0.12),transparent_24%),radial-gradient(circle_at_84%_18%,rgba(78,176,255,0.08),transparent_20%)]" />

          <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10">
            <div className="lg:pr-6">
              <SectionBadge>AI Analysis</SectionBadge>
              <div className="mt-5">
                <SectionHeading
                  title="See it. Get it."
                  description="단순 이벤트 나열이 아니라, 어느 흐름에서 어떤 장면이 중요했는지 읽기 쉽게 보여줍니다."
                />
              </div>

              <div className="mt-6 space-y-3 md:mt-8 md:space-y-4">
                <div
                  className="rounded-[20px] border p-4 md:p-5"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                >
                  <div className="flex items-start gap-3">
                    <Radar size={18} className="mt-[3px] text-[#FFB648]" />
                    <div>
                      <h3 className="text-base font-bold text-white">장면별 맥락을 더 쉽게 이해</h3>
                      <p className="mt-2 text-sm leading-7" style={{ color: TEXT_SUB }}>
                        어느 흐름에서 어떤 장면이 중요했는지 읽기 쉬운 구조로 보여줍니다.
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-[20px] border p-4 md:p-5"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                >
                  <div className="flex items-start gap-3">
                    <BarChart3 size={18} className="mt-[3px] text-[#FFB648]" />
                    <div>
                      <h3 className="text-base font-bold text-white">텍스트와 수치를 함께 정리</h3>
                      <p className="mt-2 text-sm leading-7" style={{ color: TEXT_SUB }}>
                        분석 요약·핵심 메트릭·코칭 포인트가 한 화면에서 이어집니다.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap gap-3 md:mt-9">
                <MetallicButton variant="primary" onClick={handleStartClick}>
                  지금 분석 시작
                  <ArrowRight size={16} />
                </MetallicButton>
                <MetallicButton variant="outline" onClick={() => appNavigate('/training-journal')}>
                  훈련일지 보기
                </MetallicButton>
              </div>
            </div>

            <div
              className="relative h-[210px] overflow-hidden rounded-[22px] border md:h-[380px] md:rounded-[28px] lg:h-[480px]"
              style={{
                borderColor: 'rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
                boxShadow: '0 22px 50px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <SafeImage
                src={ANALYSIS_DASHBOARD_IMAGE}
                alt="AI analysis dashboard"
                className="fill-img"
                fallbackTitle="Analysis Dashboard"
                fallbackDesc="public/analysis-dashboard.png 파일을 넣으면 AI 분석 이미지가 표시됩니다."
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,9,16,0.02)_0%,rgba(6,9,16,0.20)_100%)]" />
            </div>
          </div>
        </div>
      </section>

      <section id="showcase" className="scroll-mt-28 w-full px-0 pt-8 md:pt-10 lg:pt-12">
        <div
          className="grid overflow-hidden border-y md:min-h-[720px] lg:min-h-[780px] lg:grid-cols-2"
          style={{
            background:
              'linear-gradient(135deg, rgba(19,23,35,0.98) 0%, rgba(11,15,28,0.99) 55%, rgba(9,12,22,1) 100%)',
            borderColor: 'rgba(255,255,255,0.08)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.28)',
          }}
        >
          <div className="relative h-[240px] overflow-hidden md:min-h-[720px] lg:order-1">
            <SafeImage
              src={SHOWCASE_IMAGE}
              alt="AI sports analysis showcase"
              className="fill-img"
              fallbackTitle="Showcase Image"
              fallbackDesc="public/showcase-ai-vision.jpg 파일을 넣으면 쇼케이스 이미지가 표시됩니다."
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,14,26,0.10)_0%,rgba(10,14,26,0.04)_44%,rgba(10,14,26,0.18)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_40%,rgba(255,255,255,0.10),transparent_16%),radial-gradient(circle_at_80%_62%,rgba(255,159,2,0.12),transparent_18%)]" />
          </div>

          <div className="flex items-center px-6 py-10 md:px-14 md:py-14 lg:order-2 lg:px-20">
            <div className="max-w-[560px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/56 md:text-[12px] md:tracking-[0.32em]">
                AI Match Insight
              </p>

              <h2 className="mt-4 text-[26px] font-extrabold leading-[1.12] text-white md:mt-6 md:text-5xl lg:text-[60px]">
                경기를 기록으로,
                <br />
                훈련을 방향으로,
                <br />
                <span style={{ color: POINT_COLOR }}>10X</span>와 함께 하세요.
              </h2>

              <p className="mt-4 text-[14px] leading-7 md:mt-7 md:text-[17px] md:leading-8" style={{ color: TEXT_SUB }}>
                중요한 장면을 빠르게 이해하고,
                <br />
                다음 훈련 포인트로 자연스럽게 연결하세요.
              </p>

              <div className="mt-7 flex flex-wrap gap-3 md:mt-10 md:gap-4">
                <MetallicButton onClick={() => scrollToId('features')} variant="primary">
                  기능 둘러보기
                  <ArrowRight size={17} />
                </MetallicButton>

                <MetallicButton onClick={handleStartClick} variant="outline">
                  시작하기
                </MetallicButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer
        className="border-t"
        style={{
          borderColor: 'rgba(255,255,255,0.06)',
          background: '#050810',
        }}
      >
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={LOGO_SRC}
              alt="10X AI Sports"
              className="brand-logo block shrink-0"
              style={{ maxWidth: '160px' }}
            />
            <p className="min-w-0 text-sm leading-6 text-white/52">
              AI 기반 경기 분석과 훈련 연결을 위한 스포츠 인사이트 플랫폼
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm text-white/46">
            <button
              type="button"
              onClick={() => scrollToId('features')}
              className="transition hover:text-white/80"
            >
              핵심 기능
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/mobile-capture')}
              className="transition hover:text-white/80"
            >
              경기 촬영
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/video-analysis')}
              className="transition hover:text-white/80"
            >
              영상 분석
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/highlight-extraction')}
              className="transition hover:text-[#FFB648]"
            >
              하이라이트 추출
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/training-journal')}
              className="transition hover:text-white/80"
            >
              훈련일지
            </button>
            <button
              type="button"
              onClick={() => appNavigate('/analysis-history')}
              className="transition hover:text-white/80"
            >
              내 기록
            </button>
            <button
              type="button"
              onClick={() => scrollToId('showcase')}
              className="transition hover:text-white/80"
            >
              쇼케이스
            </button>
          </div>
        </div>
      </footer>

      <BottomTabBar />
    </main>
  );
}
