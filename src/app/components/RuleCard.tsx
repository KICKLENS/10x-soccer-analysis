import { useState, useEffect } from 'react';

interface RuleData {
  id: string;
  year: string;
  tag: string;
  title: string;
  summary: string;
  detail: string;
  example: string;
  emoji: string;
  isNew?: boolean;
}

const RULES: RuleData[] = [
  {
    id: 'gk_6sec',
    year: '2023-24 강화 시행',
    tag: '골키퍼',
    emoji: '🧤',
    title: '골키퍼 공 보유 6초 제한',
    summary: '골키퍼는 손으로 공을 잡은 뒤 6초 안에 반드시 내보내야 해요.',
    detail: '원래부터 있던 규칙이지만 2023-24 시즌부터 심판이 더 엄격하게 적용하기 시작했어요. 6초를 넘기면 상대팀 간접 프리킥이 주어져요.',
    example: '예) 골키퍼가 공을 잡고 10초 넘게 들고 있으면 → 심판이 경고 후 상대 팀 간접 프리킥',
    isNew: true,
  },
  {
    id: 'throwin_time',
    year: '2023-24 시범 도입',
    tag: '스로인',
    emoji: '🤾',
    title: '스로인 8초 제한',
    summary: '스로인 기회를 얻은 뒤 8초 안에 공을 던져야 해요.',
    detail: 'IFAB(국제축구평의회)가 경기 템포를 높이기 위해 도입했어요. 8초를 넘기면 상대 팀에게 스로인 기회가 넘어가요. 일부 리그에서 시범 적용 중이에요.',
    example: '예) 스로인 기회를 얻고 천천히 자리 잡다가 8초 초과 → 상대 팀 스로인',
    isNew: true,
  },
  {
    id: 'five_subs',
    year: '2022 영구 규정화',
    tag: '교체',
    emoji: '🔄',
    title: '5명 교체 가능',
    summary: '한 경기에서 최대 5명까지 선수를 교체할 수 있어요.',
    detail: '원래는 3명이었는데 코로나19 시기에 선수 보호를 위해 5명으로 늘렸어요. 이후 2022년에 영구 규정이 됐어요. 단, 교체는 최대 3번의 기회에 나눠서 해야 해요 (연장전 제외).',
    example: '예) 전반에 2명, 후반에 3명 교체 가능 (총 5명)',
    isNew: false,
  },
  {
    id: 'handball_rule',
    year: '2021 개정',
    tag: '핸드볼',
    emoji: '✋',
    title: '핸드볼 판정 기준 변경',
    summary: '팔이 몸에 자연스럽게 붙어있으면 핸드볼이 아니에요.',
    detail: '이전에는 손에 공이 맞으면 무조건 핸드볼이었어요. 개정 후에는 팔이 "부자연스럽게 벌려져 있을 때"만 핸드볼로 판정해요. 넘어지면서 바닥을 짚을 때 맞는 경우는 핸드볼이 아니에요.',
    example: '예) 공이 달려오는데 팔을 몸에 붙이고 있다가 맞음 → 핸드볼 아님',
    isNew: false,
  },
  {
    id: 'goalkick_opponent',
    year: '2019 개정',
    tag: '골킥',
    emoji: '⚽',
    title: '골킥 시 상대 선수 진입 허용',
    summary: '골킥을 찰 때 상대 선수가 페널티박스 안에 있어도 돼요.',
    detail: '2019년 이전에는 골킥이 페널티박스 밖으로 나가기 전에 상대 선수가 박스 안에 있으면 반칙이었어요. 개정 후에는 진입 가능해요. 이 때문에 골키퍼가 짧은 패스로 빌드업하는 전술이 더 활발해졌어요.',
    example: '예) 골킥 상황에서 상대 공격수가 페널티박스 안에서 기다려도 합법',
    isNew: false,
  },
  {
    id: 'defensive_wall',
    year: '2019 개정',
    tag: '프리킥',
    emoji: '🧱',
    title: '수비 벽 점프 금지',
    summary: '프리킥 수비 벽에서 선수가 공을 막으려고 일부러 뛰면 안 돼요.',
    detail: '수비팀이 벽을 만들 때 공이 아래로 지나가는 걸 막으려고 뛰어오르면 간접 프리킥이 주어져요. 공격팀의 지면 프리킥을 보호하기 위한 규정이에요.',
    example: '예) 프리킥에서 수비 벽이 공을 막으려고 점프 → 상대 팀 간접 프리킥',
    isNew: false,
  },
  {
    id: 'var_system',
    year: '2018 도입',
    tag: 'VAR',
    emoji: '📺',
    title: 'VAR (비디오 판독) 시스템',
    summary: '골, 페널티, 퇴장, 선수 오인 상황에서 비디오로 다시 확인할 수 있어요.',
    detail: 'VAR은 Video Assistant Referee의 약자예요. 심판이 명백히 잘못된 판정을 했을 때만 사용해요. 4가지 상황(골, 페널티킥, 레드카드, 선수 오인)에만 적용되고, 모든 판정에 쓰이지는 않아요.',
    example: '예) 골이 들어갔는데 오프사이드인지 VAR로 확인 → 수십 초 내 결론',
    isNew: false,
  },
  {
    id: 'added_time',
    year: '2022-23 강화 시행',
    tag: '추가시간',
    emoji: '⏱️',
    title: '추가 시간 정확하게 표기',
    summary: '골, 교체, VAR, 부상 시간을 모두 합산해 추가 시간을 정확히 계산해요.',
    detail: '2022 카타르 월드컵부터 전반에 10분 이상 추가 시간을 주는 경우가 많아졌어요. 이전에는 4~5분이 관행이었지만, 이제는 실제 낭비된 시간만큼 정확하게 추가해요. 경기 시간이 실질적으로 늘어난 효과가 있어요.',
    example: '예) 전반에 골 3개 + 교체 3번 + VAR 1번 → 추가 시간 12분 표기',
    isNew: false,
  },
  {
    id: 'semi_auto_offside',
    year: '2022 월드컵 도입',
    tag: '오프사이드',
    emoji: '🤖',
    title: '세미자동 오프사이드 기술 (SAOT)',
    summary: 'AI와 카메라로 오프사이드를 수십 초 만에 자동 판정해요.',
    detail: '카타르 월드컵에서 처음 도입됐어요. 선수 신체에 29개 추적 포인트를 실시간으로 분석해서 오프사이드 여부를 빠르게 판정해요. 기존 VAR보다 10배 빠르게 결론이 나요.',
    example: '예) 공격수가 1cm 오프사이드 → 기존엔 수분 대기, 이제는 수십 초 안에 판정',
    isNew: false,
  },
  {
    id: 'concussion_sub',
    year: '2023-24 시범 도입',
    tag: '교체',
    emoji: '🪖',
    title: '뇌진탕 의심 시 임시 교체',
    summary: '선수가 뇌진탕이 의심되면 경기 중 임시로 교체해서 검사받을 수 있어요.',
    detail: '선수 안전을 위한 규정이에요. 뇌진탕 의심 선수를 잠시 교체해 검사하고, 이상이 없으면 다시 복귀할 수 있어요. 이 교체는 5번 교체 횟수에 포함되지 않아요.',
    example: '예) 헤딩 충돌 후 어지러워 보이는 선수 → 경기 중 3분 검사 후 복귀 또는 교체',
    isNew: true,
  },
  {
    id: 'yellow_card_reset',
    year: '국제대회 적용',
    tag: '경고',
    emoji: '🟨',
    title: '토너먼트 결승 전 경고 리셋',
    summary: '월드컵 등 국제대회 결승전 전에 누적 경고가 리셋돼요.',
    detail: '8강, 4강에서 경고 누적으로 출전 정지가 된 선수도 결승전에는 출전할 수 있어요. 팬들과 선수들이 가장 중요한 경기를 풀전력으로 볼 수 있도록 하기 위한 규정이에요.',
    example: '예) 준결승에서 경고받은 선수 → 결승 출전 가능 (경고 카운트 리셋)',
    isNew: false,
  },
  {
    id: 'penalty_retake',
    year: '상시 규정',
    tag: '페널티킥',
    emoji: '⚡',
    title: '골키퍼 페널티킥 움직임 제한',
    summary: '페널티킥 때 골키퍼는 공이 차이기 전까지 골라인에 발이 있어야 해요.',
    detail: '골키퍼가 미리 한쪽으로 움직이면 반칙이에요. 주심이 이를 확인하고 위반 시 페널티킥을 다시 차게 해요. VAR 도입 이후 더 엄격하게 적용되고 있어요.',
    example: '예) 골키퍼가 공 차기 전에 오른쪽으로 크게 이동 → 재킥 명령',
    isNew: false,
  },
];

const RULE_SEEN_KEY = 'kicklens_rule_seen_dates';

function getTodayRule(): RuleData {
  // 로그인/접속할 때마다 다른 규정 → 날짜 기반 순환
  const today = new Date().toDateString();
  const seen: string[] = JSON.parse(localStorage.getItem(RULE_SEEN_KEY) || '[]');
  const todayIdx = seen.indexOf(today);
  if (todayIdx !== -1) {
    return RULES[todayIdx % RULES.length];
  }
  // 새 날짜 → 다음 인덱스
  const nextIdx = seen.length % RULES.length;
  const updated = [...seen, today].slice(-RULES.length * 2);
  localStorage.setItem(RULE_SEEN_KEY, JSON.stringify(updated));
  return RULES[nextIdx];
}

export default function RuleCard() {
  const [rule] = useState<RuleData>(getTodayRule);
  const [expanded, setExpanded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    const key = `kicklens_rule_ack_${rule.id}`;
    setAcknowledged(!!localStorage.getItem(key));
  }, [rule.id]);

  const handleAck = () => {
    localStorage.setItem(`kicklens_rule_ack_${rule.id}`, '1');
    setAcknowledged(true);
  };

  return (
    <div className="rounded-2xl border border-blue-200/40 bg-gradient-to-br from-blue-950/60 to-slate-900/80 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/8">
        <span className="text-2xl">{rule.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">오늘의 FIFA 규정</span>
            {rule.isNew && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>
            )}
            <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
              {rule.tag}
            </span>
            <span className="text-[10px] text-white/35">{rule.year}</span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white leading-tight">{rule.title}</h3>
        </div>
      </div>

      {/* 요약 */}
      <div className="px-5 py-4">
        <p className="text-sm text-white/80 leading-relaxed">{rule.summary}</p>

        {/* 예시 */}
        <div className="mt-3 rounded-xl bg-white/5 border border-white/8 px-4 py-3">
          <p className="text-xs text-white/55 leading-relaxed">{rule.example}</p>
        </div>

        {/* 상세 보기 토글 */}
        {expanded && (
          <div className="mt-3 rounded-xl bg-blue-500/10 border border-blue-400/20 px-4 py-3">
            <p className="text-xs text-blue-200 leading-relaxed">{rule.detail}</p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition"
          >
            {expanded ? '▲ 간단히 보기' : '▼ 자세히 보기'}
          </button>
          <div className="flex-1" />
          {!acknowledged ? (
            <button
              onClick={handleAck}
              className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white transition"
            >
              ✓ 알겠어요!
            </button>
          ) : (
            <span className="rounded-xl bg-green-500/20 border border-green-400/30 px-4 py-2 text-xs font-bold text-green-400">
              ✓ 확인 완료
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
