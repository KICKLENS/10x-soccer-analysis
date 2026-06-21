import { useEffect, useState } from 'react';
import { Camera, Sparkles, UserPlus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ONBOARDING_KEY = 'onboarding-seen-v1';

const STEPS = [
  {
    icon: UserPlus,
    title: '1. 선수 등록',
    desc: '이름·포지션·등번호 등 분석할 선수 정보를 입력합니다. AI가 이 정보로 영상 속 선수를 찾아냅니다.',
  },
  {
    icon: Camera,
    title: '2. 경기 촬영',
    desc: '휴대폰을 가로로 두고 경기장 전체가 보이게 촬영하세요. 촬영이 끝나면 자동으로 업로드됩니다.',
  },
  {
    icon: Sparkles,
    title: '3. AI 분석 & 하이라이트',
    desc: 'AI 코치가 선수 중심 하이라이트를 만들고 장면별 피드백을 정리합니다. 결과는 내 기록에 저장됩니다.',
  },
];

export default function OnboardingOverlay() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) {
        setOpen(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const startNow = () => {
    dismiss();
    navigate('/player-registration');
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(4,7,14,0.72)',
        backdropFilter: 'blur(6px)',
        padding: '0 12px calc(16px + env(safe-area-inset-bottom)) 12px',
      }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          borderRadius: 26,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'linear-gradient(180deg, rgba(18,23,38,0.99) 0%, rgba(11,15,27,1) 100%)',
          boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
          padding: '22px 20px 20px',
          color: '#fff',
          animation: 'onboardingUp 0.32s ease',
        }}
      >
        <style>{`@keyframes onboardingUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}`}</style>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.5)' }}>
              WELCOME
            </p>
            <h2 style={{ marginTop: 8, fontSize: 22, fontWeight: 800 }}>3단계로 시작하세요</h2>
            <p style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6, color: 'rgba(225,231,242,0.72)' }}>
              10X AI Soccer로 내 경기를 분석하는 방법이에요.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="닫기"
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              color: '#fff',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                style={{
                  display: 'flex',
                  gap: 13,
                  alignItems: 'flex-start',
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.07)',
                  background: 'rgba(255,255,255,0.025)',
                  padding: '13px 14px',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'rgba(255,159,2,0.16)',
                    color: '#FFB648',
                  }}
                >
                  <Icon size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{step.title}</div>
                  <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.6, color: 'rgba(225,231,242,0.72)' }}>
                    {step.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={startNow}
          style={{
            marginTop: 18,
            width: '100%',
            borderRadius: 16,
            border: 'none',
            background: '#FF9F02',
            color: '#000',
            fontSize: 15,
            fontWeight: 800,
            padding: '15px 16px',
            cursor: 'pointer',
          }}
        >
          선수 등록하고 시작하기
        </button>
        <button
          type="button"
          onClick={dismiss}
          style={{
            marginTop: 8,
            width: '100%',
            borderRadius: 16,
            border: 'none',
            background: 'transparent',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 13.5,
            fontWeight: 600,
            padding: '10px 16px',
            cursor: 'pointer',
          }}
        >
          둘러보기 (나중에 하기)
        </button>
      </div>
    </div>
  );
}
