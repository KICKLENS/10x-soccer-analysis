import React, { useMemo, useState } from 'react';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileText,
  NotebookPen,
  PlayCircle,
  Radar,
  Sparkles,
  Target,
} from 'lucide-react';
import { readSelectedPlayer } from '../lib/api';

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
  title: string;
  description: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-[860px] text-center' : 'max-w-[760px]'}>
      <h2 className="text-3xl font-extrabold leading-[1.08] text-white md:text-5xl">{title}</h2>
      <p className="mt-6 text-base leading-8 md:text-[17px]" style={{ color: TEXT_SUB }}>
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
    return Array.from({ length: 240 }, (_, index) => {
      const isWhite = Math.random() < 0.64;
      const size = Math.floor(Math.random() * 6) + 2;

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
        driftX: -28 + Math.random() * 56,
        driftY: -34 + Math.random() * 68,
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
          className="relative mb-6 overflow-hidden rounded-[22px] border"
          style={{
            borderColor: 'rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            minHeight: '190px',
          }}
        >
          <SafeImage
            src={image}
            alt={title}
            className="h-[190px] w-full object-cover"
            fallbackTitle={title}
            fallbackDesc="서비스 카드용 PNG 썸네일 파일을 public 폴더에 넣어주세요."
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,10,18,0.04)_0%,rgba(8,10,18,0.26)_100%)]" />
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/54">
          {eyebrow}
        </p>
        <h3 className="mt-4 text-2xl font-bold text-white">{title}</h3>
        <p className="mt-4 text-sm leading-7 md:text-[15px]" style={{ color: TEXT_SUB }}>
          {desc}
        </p>

        <div className="mt-6 space-y-3">
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

function ReportCard({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div
      className="rounded-[26px] border p-6"
      style={{
        borderColor: STROKE,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.02) 100%)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border"
          style={{
            borderColor: 'rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <FileText size={18} className="text-[#FFB648]" />
        </div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
      </div>

      <div
        className="mt-5 rounded-[18px] border p-4"
        style={{
          borderColor: 'rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div className="h-2 w-20 rounded-full bg-white/12" />
        <div className="mt-3 h-2 w-full rounded-full bg-white/8" />
        <div className="mt-2 h-2 w-[82%] rounded-full bg-white/8" />
        <div className="mt-2 h-2 w-[72%] rounded-full bg-white/8" />
      </div>

      <p className="mt-5 text-sm leading-7" style={{ color: TEXT_SUB }}>
        {desc}
      </p>
    </div>
  );
}

function JournalCard({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div
      className="rounded-[24px] border p-5"
      style={{
        borderColor: STROKE,
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border"
          style={{
            borderColor: 'rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <NotebookPen size={17} className="text-[#FFB648]" />
        </div>
        <h4 className="text-base font-bold text-white">{title}</h4>
      </div>
      <p className="mt-4 text-sm leading-7" style={{ color: TEXT_SUB }}>
        {desc}
      </p>
    </div>
  );
}

export default function HomePage() {
  const handleStartClick = () => {
    const player = readSelectedPlayer();
    if (player.name) {
      goToPage(PAGE_LINKS.mobileCapture);
      return;
    }
    goToPage(PAGE_LINKS.playerRegistration);
  };

  return (
    <main className="min-h-screen text-white" style={{ background: PAGE_BG }}>
      <style>{GLOBAL_STYLES}</style>

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
            onClick={() => goToPage(PAGE_LINKS.home)}
          >
            <img
              src={LOGO_SRC}
              alt="10X AI Sports"
              className="block h-6 w-auto object-contain md:h-7"
              style={{ width: 'auto', maxWidth: '180px' }}
            />
          </button>

          <nav className="hidden items-center gap-8 text-sm text-white/68 lg:flex">
            <button
              type="button"
              onClick={() => scrollToId('services')}
              className="transition hover:text-white"
            >
              서비스
            </button>
            <button
              type="button"
              onClick={() => scrollToId('analysis')}
              className="transition hover:text-white"
            >
              AI 분석
            </button>
            <button
              type="button"
              onClick={() => scrollToId('reports')}
              className="transition hover:text-white"
            >
              리포트
            </button>
            <button
              type="button"
              onClick={() => scrollToId('journal')}
              className="transition hover:text-white"
            >
              훈련일지
            </button>
            <button
              type="button"
              onClick={() => scrollToId('showcase')}
              className="transition hover:text-white"
            >
              쇼케이스
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <MetallicButton variant="outline" onClick={() => scrollToId('showcase')}>
              쇼케이스 보기
            </MetallicButton>
            <div className="hidden md:block">
              <MetallicButton variant="primary" onClick={handleStartClick}>
                시작하기
                <ArrowRight size={16} />
              </MetallicButton>
            </div>
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
            className="relative flex h-[400px] flex-col items-center justify-center px-8 py-10 text-center md:h-[500px] md:px-14 md:py-12 lg:h-[560px] lg:px-16 lg:py-14"
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

              <div className="mt-7 flex flex-wrap items-center justify-center gap-4 md:mt-8">
                <MetallicButton variant="dark" onClick={() => scrollToId('services')}>
                  서비스 보기
                  <ArrowRight size={16} />
                </MetallicButton>

                <MetallicButton variant="outline" onClick={() => scrollToId('showcase')}>
                  쇼케이스 보기
                </MetallicButton>
              </div>
            </div>
          </div>

          <div className="relative h-[400px] overflow-hidden md:h-[500px] lg:h-[560px]">
            <SafeImage
              src={HERO_IMAGE}
              alt="AI soccer hero"
              className="absolute inset-0 h-full w-full scale-[1.1] object-cover"
              objectPosition="center 0%"
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

      <section className="mx-auto w-full max-w-[1480px] px-4 pb-10 pt-20 md:px-6 md:pb-12 md:pt-24 lg:px-10 lg:pb-14 lg:pt-28">
        <div className="grid gap-4 md:grid-cols-3">
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
        className="scroll-mt-28 mx-auto w-full max-w-[1480px] px-4 py-20 md:px-6 md:py-24 lg:px-10"
      >
        <div className="mb-12 md:mb-16">
          <SectionBadge>Core Services</SectionBadge>
          <div className="mt-6">
            <SectionHeading
              title="실제 쓰임이 바로 보이는 서비스 구조"
              description="서비스 소개 구간은 텍스트만 읽히는 카드가 아니라, 각 카드 상단에 실제 PNG 썸네일을 배치해 어떤 기능인지 바로 이해되도록 구성했습니다."
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <ServiceCard
            image={SERVICE_THUMB_HIGHLIGHT}
            eyebrow="MATCH HIGHLIGHT"
            title="경기 핵심 장면 자동 정리"
            desc="하이라이트 썸네일을 통해 어떤 장면을 빠르게 포착하는 서비스인지 직관적으로 이해할 수 있도록 설계했습니다."
            bullets={[
              '중요 장면 위주로 빠르게 복기',
              '코칭 포인트가 필요한 순간 확인',
              '시청 시간 대비 인사이트 효율 향상',
            ]}
          />

          <ServiceCard
            image={SERVICE_THUMB_ANALYSIS}
            eyebrow="AI ANALYSIS"
            title="AI 분석 결과를 더 직관적으로"
            desc="분석 카드 상단에 실제 UI 스타일 PNG를 배치해 수치와 시각화가 함께 보이는 인상을 주도록 구성했습니다."
            bullets={[
              '장면별 맥락과 수치 해석 보조',
              '반복 패턴과 개선 포인트 시각화',
              '리포트 전환 전 이해도 상승',
            ]}
          />

          <ServiceCard
            image={SERVICE_THUMB_JOURNAL}
            eyebrow="TRAINING JOURNAL"
            title="훈련일지로 자연스럽게 연결"
            desc="기록형 기능은 무겁게 보이지 않도록 노트/체크 느낌의 PNG 썸네일을 배치해 부담 없이 접근되도록 했습니다."
            bullets={[
              '리포트에서 훈련일지로 자연스럽게 이동',
              '다음 훈련 주제 정리와 기록 축적',
              '선수/코치 간 커뮤니케이션 흐름 강화',
            ]}
          />
        </div>
      </section>

      <section
        id="analysis"
        className="scroll-mt-28 mx-auto w-full max-w-[1480px] px-4 py-20 md:px-6 md:py-24 lg:px-10"
      >
        <div
          className="relative overflow-hidden rounded-[38px] border px-6 py-6 md:px-8 md:py-8 lg:px-10 lg:py-10"
          style={{
            borderColor: STROKE,
            background: 'linear-gradient(180deg, rgba(13,18,32,0.98) 0%, rgba(8,11,20,1) 100%)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.28)',
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_14%,rgba(255,159,2,0.12),transparent_24%),radial-gradient(circle_at_84%_18%,rgba(78,176,255,0.08),transparent_20%)]" />

          <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="lg:pr-6">
              <SectionBadge>AI Analysis</SectionBadge>

              <div className="mt-6">
                <SectionHeading
                  title="AI 분석은 카드 반복보다 한 장의 큰 화면처럼 보여야 더 설득력 있습니다"
                  description="좌측은 핵심 메시지와 읽기 쉬운 포인트 정리, 우측은 실제 분석 화면 느낌의 대형 PNG로 구성했습니다. 정보 설명과 시각 증명을 동시에 보여주는 구조입니다."
                />
              </div>

              <div className="mt-8 space-y-4">
                <div
                  className="rounded-[22px] border p-5"
                  style={{
                    borderColor: 'rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Radar size={18} className="mt-[3px] text-[#FFB648]" />
                    <div>
                      <h3 className="text-base font-bold text-white">장면별 맥락을 더 쉽게 이해</h3>
                      <p className="mt-2 text-sm leading-7" style={{ color: TEXT_SUB }}>
                        단순 이벤트 나열이 아니라 어느 흐름에서 어떤 장면이 중요했는지 읽기 쉬운 구조로 보여줍니다.
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-[22px] border p-5"
                  style={{
                    borderColor: 'rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <BarChart3 size={18} className="mt-[3px] text-[#FFB648]" />
                    <div>
                      <h3 className="text-base font-bold text-white">텍스트와 수치를 함께 정리</h3>
                      <p className="mt-2 text-sm leading-7" style={{ color: TEXT_SUB }}>
                        분석 요약, 핵심 메트릭, 코칭 포인트가 한 화면에서 이어지도록 구성해 보고서 전환이 자연스럽습니다.
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-[22px] border p-5"
                  style={{
                    borderColor: 'rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Target size={18} className="mt-[3px] text-[#FFB648]" />
                    <div>
                      <h3 className="text-base font-bold text-white">다음 훈련 액션으로 연결</h3>
                      <p className="mt-2 text-sm leading-7" style={{ color: TEXT_SUB }}>
                        화면에서 얻은 인사이트가 훈련 계획과 일지로 이어지도록 구조 자체를 실전형으로 설계했습니다.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex flex-wrap gap-4">
                <MetallicButton variant="primary" onClick={() => scrollToId('reports')}>
                  리포트 확인하기
                  <ArrowRight size={16} />
                </MetallicButton>
                <MetallicButton variant="outline" onClick={() => scrollToId('journal')}>
                  훈련일지 흐름 보기
                </MetallicButton>
              </div>
            </div>

            <div
              className="relative overflow-hidden rounded-[30px] border"
              style={{
                borderColor: 'rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
                minHeight: '460px',
                boxShadow: '0 22px 50px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <SafeImage
                src={ANALYSIS_DASHBOARD_IMAGE}
                alt="AI analysis dashboard"
                className="h-[460px] w-full object-cover lg:h-[560px]"
                fallbackTitle="Analysis Dashboard"
                fallbackDesc="public/analysis-dashboard.png 파일을 넣으면 AI 분석 대형 이미지가 표시됩니다."
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,9,16,0.02)_0%,rgba(6,9,16,0.20)_100%)]" />
            </div>
          </div>
        </div>
      </section>

      <section
        id="reports"
        className="scroll-mt-28 mx-auto w-full max-w-[1480px] px-4 py-20 md:px-6 md:py-24 lg:px-10"
      >
        <div className="mb-12 md:mb-16">
          <SectionBadge>Reports</SectionBadge>
          <div className="mt-6">
            <SectionHeading
              title="리포트는 문서처럼 정리되되 너무 딱딱하지 않게"
              description="보고서 섹션은 읽는 정보가 많기 때문에 과한 이미지보다 문서형 구조와 미세한 시각 장치를 섞는 것이 더 효과적입니다."
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <ReportCard
            title="경기 요약 리포트"
            desc="경기 전체를 빠르게 다시 파악해야 할 때 핵심 요약과 주요 장면을 한 문서 흐름으로 정리합니다."
          />
          <ReportCard
            title="선수별 포인트 리포트"
            desc="선수 단위로 보완이 필요한 포인트와 긍정적인 장면을 분리해 훈련 방향이 더 분명해지도록 돕습니다."
          />
          <ReportCard
            title="코칭 인사이트 리포트"
            desc="코칭 미팅이나 피드백 시간에 바로 활용할 수 있도록 읽기 쉬운 구조와 밀도 있는 요약을 제공합니다."
          />
        </div>
      </section>

      <section
        id="journal"
        className="scroll-mt-28 mx-auto w-full max-w-[1480px] px-4 py-20 md:px-6 md:py-24 lg:px-10"
      >
        <div
          className="rounded-[36px] border px-6 py-8 md:px-8 md:py-10 lg:px-10"
          style={{
            borderColor: STROKE,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.02) 100%)',
            boxShadow: '0 26px 62px rgba(0,0,0,0.2)',
          }}
        >
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SectionBadge>Training Journal</SectionBadge>
              <div className="mt-6">
                <SectionHeading
                  title="분석에서 끝나지 않고 훈련일지까지 자연스럽게"
                  description="훈련일지는 리포트의 마지막이 아니라 다음 행동의 시작이어야 합니다. 가볍게 기록하면서도 실제 개선 흐름이 남도록 구조를 설계했습니다."
                />
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                <MetallicButton variant="primary" onClick={() => scrollToId('journal')}>
                  훈련일지 보기
                  <ArrowRight size={16} />
                </MetallicButton>
                <MetallicButton variant="outline" onClick={() => scrollToId('analysis')}>
                  코칭 흐름 살펴보기
                </MetallicButton>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <JournalCard
                title="오늘의 훈련 목표"
                desc="분석 결과에서 바로 이어지는 형태로 오늘 집중할 포인트를 가볍고 분명하게 기록할 수 있습니다."
              />
              <JournalCard
                title="좋았던 장면 기록"
                desc="반복해서 유지해야 하는 장면은 따로 남겨 자신감과 재현 포인트를 함께 축적할 수 있습니다."
              />
              <JournalCard
                title="개선 포인트 정리"
                desc="다음 훈련에서 꼭 체크해야 할 장면을 짧고 선명하게 남겨 실전 피드백에 활용할 수 있습니다."
              />
              <JournalCard
                title="코치 메모 연결"
                desc="선수 메모와 코치 피드백이 분리되지 않도록 같은 흐름에서 관리하는 구조를 지향합니다."
              />
            </div>
          </div>
        </div>
      </section>

      <section id="showcase" className="scroll-mt-28 w-full px-0 pt-8 md:pt-10 lg:pt-12">
        <div
          className="grid min-h-[620px] overflow-hidden border-y md:min-h-[720px] lg:min-h-[780px] lg:grid-cols-2"
          style={{
            background:
              'linear-gradient(135deg, rgba(19,23,35,0.98) 0%, rgba(11,15,28,0.99) 55%, rgba(9,12,22,1) 100%)',
            borderColor: 'rgba(255,255,255,0.08)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.28)',
          }}
        >
          <div className="relative min-h-[360px] overflow-hidden md:min-h-[720px] lg:order-1">
            <SafeImage
              src={SHOWCASE_IMAGE}
              alt="AI sports analysis showcase"
              className="absolute inset-0 h-full w-full object-cover"
              fallbackTitle="Showcase Image"
              fallbackDesc="public/showcase-ai-vision.jpg 파일을 넣으면 쇼케이스 이미지가 표시됩니다."
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,14,26,0.10)_0%,rgba(10,14,26,0.04)_44%,rgba(10,14,26,0.18)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_40%,rgba(255,255,255,0.10),transparent_16%),radial-gradient(circle_at_80%_62%,rgba(255,159,2,0.12),transparent_18%)]" />
          </div>

          <div className="flex items-center px-8 py-14 md:px-14 lg:order-2 lg:px-20">
            <div className="max-w-[560px]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-white/56">
                AI Match Insight
              </p>

              <h2 className="mt-6 text-4xl font-extrabold leading-[1.08] text-white md:text-5xl lg:text-[60px]">
                경기를 다시 보면,
                <br />
                훈련이 더 선명해집니다.
              </h2>

              <p className="mt-7 text-base leading-8 md:text-[17px]" style={{ color: TEXT_SUB }}>
                중요한 장면을 빠르게 이해하고,
                <br />
                다음 훈련 포인트로 자연스럽게 연결하세요.
              </p>

              <div className="mt-10 flex flex-wrap gap-4">
                <MetallicButton onClick={() => scrollToId('reports')} variant="primary">
                  샘플 리포트 보기
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
              className="block h-6 w-auto shrink-0 object-contain md:h-7"
              style={{ width: 'auto', maxWidth: '180px' }}
            />
            <p className="min-w-0 text-sm leading-6 text-white/52">
              AI 기반 경기 분석과 훈련 연결을 위한 스포츠 인사이트 플랫폼
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm text-white/46">
            <button
              type="button"
              onClick={() => scrollToId('services')}
              className="transition hover:text-white/80"
            >
              서비스
            </button>
            <button
              type="button"
              onClick={() => scrollToId('analysis')}
              className="transition hover:text-white/80"
            >
              AI 분석
            </button>
            <button
              type="button"
              onClick={() => scrollToId('reports')}
              className="transition hover:text-white/80"
            >
              리포트
            </button>
            <button
              type="button"
              onClick={() => scrollToId('journal')}
              className="transition hover:text-white/80"
            >
              훈련일지
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
    </main>
  );
}
