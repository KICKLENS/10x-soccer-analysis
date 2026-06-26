import { useState, useEffect } from 'react';

// ── 크레딧 유틸 ──────────────────────────────────────────────
const CREDIT_KEY = 'kicklens_credits';
const DEFAULT_CREDITS = 3000; // 신규 가입 시 무료 제공 크레딧

export function getCredits(): number {
  const raw = localStorage.getItem(CREDIT_KEY);
  if (raw === null) {
    localStorage.setItem(CREDIT_KEY, String(DEFAULT_CREDITS));
    return DEFAULT_CREDITS;
  }
  return parseInt(raw, 10) || 0;
}

export function addCredits(amount: number) {
  const cur = getCredits();
  localStorage.setItem(CREDIT_KEY, String(cur + amount));
  window.dispatchEvent(new CustomEvent('credits-changed'));
}

export function deductCredits(amount: number): boolean {
  const cur = getCredits();
  if (cur < amount) return false;
  localStorage.setItem(CREDIT_KEY, String(cur - amount));
  window.dispatchEvent(new CustomEvent('credits-changed'));
  return true;
}

export function useCredits() {
  const [credits, setCredits] = useState(getCredits);
  useEffect(() => {
    const handler = () => setCredits(getCredits());
    window.addEventListener('credits-changed', handler);
    return () => window.removeEventListener('credits-changed', handler);
  }, []);
  return credits;
}

// ── 상품 / 패키지 데이터 ──────────────────────────────────────
const PRODUCTS = [
  {
    id: 'highlight',
    icon: '🎬',
    name: '하이라이트 추출',
    desc: '영상에서 멋진 장면만 자동 추출',
    price: 2900,
    badge: null,
  },
  {
    id: 'analysis',
    icon: '🧠',
    name: 'AI 경기 분석',
    desc: '전문 코치 수준의 경기력 분석 리포트',
    price: 3900,
    badge: null,
  },
  {
    id: 'bundle',
    icon: '⭐',
    name: '하이라이트 + 분석',
    desc: '하이라이트 추출 + AI 분석 세트',
    price: 5900,
    badge: '1,900원 절약',
  },
];

const PACKAGES = [
  { id: 'starter', name: '스타터', price: 9900, credits: 11000, save: null },
  { id: 'family', name: '패밀리', price: 24900, credits: 30000, save: '17% 절약' },
  { id: 'season', name: '시즌권', price: 49900, credits: 65000, save: '24% 절약' },
  { id: 'club', name: '클럽', price: 99000, credits: 140000, save: '30% 절약' },
];

const PAYMENT_METHODS = [
  { id: 'toss', name: '토스페이먼츠', icon: '💳', color: '#0064FF', bg: '#EEF4FF' },
  { id: 'kakao', name: '카카오페이', icon: '💬', color: '#3A1D1D', bg: '#FEE500' },
  { id: 'naver', name: '네이버페이', icon: '🟢', color: '#03C75A', bg: '#E8FBF0' },
  { id: 'card', name: '신용/체크카드', icon: '💳', color: '#374151', bg: '#F3F4F6' },
  { id: 'bank', name: '계좌이체', icon: '🏦', color: '#374151', bg: '#F3F4F6' },
  { id: 'apple', name: 'Apple Pay', icon: '🍎', color: '#1C1C1E', bg: '#F2F2F7' },
  { id: 'samsung', name: '삼성페이', icon: '📱', color: '#1428A0', bg: '#EEF0FF' },
];

// ── 메인 모달 컴포넌트 ────────────────────────────────────────
interface PurchaseModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: 'use' | 'charge';
}

export default function PurchaseModal({ open, onClose, defaultTab = 'charge' }: PurchaseModalProps) {
  const credits = useCredits();
  const [tab, setTab] = useState<'use' | 'charge'>(defaultTab);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'payment' | 'done'>('select');

  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setStep('select');
      setSelectedProduct(null);
      setSelectedPackage(null);
      setSelectedPayment(null);
    }
  }, [open, defaultTab]);

  if (!open) return null;

  const selectedPkg = PACKAGES.find(p => p.id === selectedPackage);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* 모달 */}
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl">

        {/* 헤더 */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">크레딧 충전</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
          </div>
          {/* 현재 잔액 */}
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF9F02] text-white text-lg font-bold shrink-0">C</div>
            <div>
              <div className="text-xs text-slate-500">현재 보유 크레딧</div>
              <div className="text-xl font-bold text-slate-900">{credits.toLocaleString()} <span className="text-sm font-normal text-slate-500">credits</span></div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-slate-400">≈ {Math.floor(credits / 2900)}회 분석 가능</div>
            </div>
          </div>
          {/* 탭 */}
          <div className="mt-3 flex rounded-xl bg-slate-100 p-1 gap-1">
            {(['charge', 'use'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                {t === 'charge' ? '💳 충전하기' : '🎯 서비스 이용'}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ── 충전하기 탭 ── */}
          {tab === 'charge' && step === 'select' && (
            <>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">충전 패키지 선택</p>
                <div className="space-y-2">
                  {PACKAGES.map(pkg => (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedPackage(pkg.id)}
                      className={`w-full flex items-center justify-between rounded-2xl border-2 p-4 transition ${
                        selectedPackage === pkg.id
                          ? 'border-[#FF9F02] bg-orange-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{pkg.name}</span>
                          {pkg.save && (
                            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{pkg.save}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{pkg.credits.toLocaleString()} 크레딧</div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-slate-900">{pkg.price.toLocaleString()}원</div>
                        <div className="text-xs text-slate-400">{(pkg.price / (pkg.credits / 1000)).toFixed(0)}원/1,000c</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={!selectedPackage}
                onClick={() => setStep('payment')}
                className="w-full rounded-2xl bg-[#FF9F02] py-4 text-base font-bold text-white transition hover:bg-[#e8900a] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                결제 수단 선택 →
              </button>
            </>
          )}

          {/* ── 결제 수단 선택 ── */}
          {tab === 'charge' && step === 'payment' && (
            <>
              <div>
                <button
                  onClick={() => setStep('select')}
                  className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
                >
                  ← 패키지 다시 선택
                </button>

                {selectedPkg && (
                  <div className="mb-4 rounded-2xl bg-slate-50 border border-slate-200 p-4 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{selectedPkg.name} 패키지</div>
                      <div className="text-xs text-slate-500">{selectedPkg.credits.toLocaleString()} 크레딧 충전</div>
                    </div>
                    <div className="text-lg font-bold text-slate-900">{selectedPkg.price.toLocaleString()}원</div>
                  </div>
                )}

                <p className="text-sm font-semibold text-slate-700 mb-3">결제 수단 선택</p>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedPayment(method.id)}
                      className={`relative flex items-center gap-2 rounded-2xl border-2 p-3 transition ${
                        selectedPayment === method.id
                          ? 'border-[#FF9F02]'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      style={{ background: method.bg }}
                    >
                      <span className="text-xl">{method.icon}</span>
                      <span className="text-xs font-semibold" style={{ color: method.color }}>{method.name}</span>
                      {/* 준비 중 배지 */}
                      <span className="absolute -top-2 -right-2 rounded-full bg-slate-600 px-1.5 py-0.5 text-[9px] font-bold text-white">준비중</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={!selectedPayment}
                onClick={() => {
                  // 실제 결제 대신 안내 메시지
                  setStep('done');
                }}
                className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-4 text-sm font-semibold text-slate-400 transition hover:border-slate-400"
              >
                🚧 결제 시스템 준비 중입니다
              </button>

              <p className="text-center text-xs text-slate-400">
                정식 오픈 시 실제 결제가 가능해집니다.<br />베타 기간에는 무료 크레딧으로 이용해주세요.
              </p>
            </>
          )}

          {/* ── 준비 중 완료 화면 ── */}
          {tab === 'charge' && step === 'done' && (
            <div className="py-8 text-center space-y-4">
              <div className="text-5xl">🚧</div>
              <div className="text-lg font-bold text-slate-900">결제 시스템 준비 중</div>
              <p className="text-sm text-slate-500 leading-relaxed">
                현재 베타 서비스 기간으로<br />
                무료 크레딧으로 모든 기능을 이용할 수 있어요.<br />
                정식 오픈 시 알림을 드릴게요!
              </p>
              <button
                onClick={onClose}
                className="rounded-2xl bg-slate-900 px-8 py-3 text-sm font-semibold text-white"
              >
                확인
              </button>
            </div>
          )}

          {/* ── 서비스 이용 탭 ── */}
          {tab === 'use' && (
            <>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">이용 가능한 서비스</p>
                <p className="text-xs text-slate-400 mb-3">현재 보유 크레딧: {credits.toLocaleString()}c</p>
                <div className="space-y-3">
                  {PRODUCTS.map(product => {
                    const canUse = credits >= product.price;
                    return (
                      <div
                        key={product.id}
                        className={`relative flex items-center justify-between rounded-2xl border-2 p-4 ${
                          selectedProduct === product.id
                            ? 'border-[#FF9F02] bg-orange-50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        {product.badge && (
                          <span className="absolute -top-2.5 left-4 rounded-full bg-[#FF9F02] px-2 py-0.5 text-[10px] font-bold text-white">
                            {product.badge}
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{product.icon}</span>
                          <div>
                            <div className="text-sm font-bold text-slate-900">{product.name}</div>
                            <div className="text-xs text-slate-500">{product.desc}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <div className="text-sm font-bold text-slate-900">{product.price.toLocaleString()}c</div>
                          <div className="text-xs text-slate-400">≈ {product.price.toLocaleString()}원</div>
                          {!canUse && (
                            <div className="text-xs text-red-500 mt-0.5">크레딧 부족</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
                <p className="text-xs font-semibold text-blue-700 mb-1">💡 베타 기간 안내</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  현재 베타 서비스로 모든 기능을 무료로 이용할 수 있어요. 
                  크레딧이 부족하면 충전 탭에서 충전해주세요.
                  (베타 기간엔 실제 결제 없이 테스트 크레딧이 지급됩니다)
                </p>
              </div>

              <button
                onClick={() => {
                  // 베타: 테스트 크레딧 1만 지급
                  addCredits(10000);
                  alert('✅ 베타 테스트 크레딧 10,000c가 지급되었습니다!');
                }}
                className="w-full rounded-2xl border-2 border-dashed border-[#FF9F02] py-3 text-sm font-semibold text-[#FF9F02] transition hover:bg-orange-50"
              >
                🎁 베타 테스트 크레딧 받기 (+10,000c)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
