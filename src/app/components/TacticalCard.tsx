/**
 * 오늘의 전술 카드
 * 날짜 기반으로 하루 1개 전술 카드를 보여주고 퀴즈로 XP 획득.
 */
import { useState, useEffect, useRef } from 'react';

// ─── 전술 데이터 ───────────────────────────────────────────────
type QuizOption = { id: string; label: string; correct: boolean };
type Player = { x: number; y: number; team: 'blue' | 'red' | 'yellow'; label?: string };
type Arrow = { from: [number, number]; to: [number, number]; color: string; dashed?: boolean };

type TacticData = {
  id: string;
  title: string;
  subtitle: string;
  concept: string;           // 핵심 개념 한 줄 설명
  description: string;       // 상황 설명
  players: Player[];
  arrows: Arrow[];           // 정답 화살표 (퀴즈 정답 후 표시)
  quizQuestion: string;
  options: QuizOption[];
  explanation: string;       // 정답 후 설명
  xp: number;
};

const TACTICS: TacticData[] = [
  {
    id: 'space_creation',
    title: '공간 만들기',
    subtitle: '움직임의 기본',
    concept: '공 없을 때 달려야 팀이 산다',
    description: '파란 팀이 공을 갖고 있어요. 파란 선수 A는 수비수 근처에 가만히 서 있어요. 공을 받으려면 어떻게 해야 할까요?',
    players: [
      { x: 30, y: 50, team: 'blue', label: 'B' },   // 공 가진 선수
      { x: 65, y: 45, team: 'blue', label: 'A' },   // 움직여야 할 선수
      { x: 60, y: 48, team: 'red' },                  // 수비수
      { x: 75, y: 55, team: 'red' },
    ],
    arrows: [
      { from: [65, 45], to: [75, 30], color: '#60D394', dashed: false },  // A가 달려야 할 방향
      { from: [30, 50], to: [75, 30], color: '#60D394', dashed: true },   // 패스 경로
    ],
    quizQuestion: '파란 선수 A는 어떻게 해야 공을 받을 수 있을까요?',
    options: [
      { id: 'a', label: '공을 향해 달려간다', correct: false },
      { id: 'b', label: '수비수 반대 방향 공간으로 달린다', correct: true },
      { id: 'c', label: '제자리에서 손을 든다', correct: false },
    ],
    explanation: '수비수 반대 방향으로 달리면 "공간"이 생겨요! 수비수가 따라오면 팀원이 그 빈 공간을 쓸 수 있고, 수비수가 안 따라오면 내가 패스를 받을 수 있어요. 공 없을 때의 움직임이 축구의 핵심이에요.',
    xp: 30,
  },
  {
    id: 'triangle_pass',
    title: '삼각형 패스',
    subtitle: '패스의 기본',
    concept: '3명이 삼각형을 만들면 패스가 쉬워진다',
    description: '파란 선수들이 일직선으로 서 있어요. 수비수가 쉽게 막을 수 있는 상황이에요. 어떻게 위치를 바꿔야 할까요?',
    players: [
      { x: 25, y: 50, team: 'blue', label: 'A' },
      { x: 50, y: 50, team: 'blue', label: 'B' },
      { x: 75, y: 50, team: 'blue', label: 'C' },
      { x: 45, y: 50, team: 'red' },
      { x: 70, y: 50, team: 'red' },
    ],
    arrows: [
      { from: [50, 50], to: [50, 30], color: '#60D394' },
    ],
    quizQuestion: '파란 선수 B가 이동해서 삼각형을 만들려면 어디로 가야 할까요?',
    options: [
      { id: 'a', label: '선수 A 옆으로 더 가까이', correct: false },
      { id: 'b', label: '앞으로 나가서 삼각형 꼭짓점 만들기', correct: true },
      { id: 'c', label: '뒤로 빠져서 수비를 돕는다', correct: false },
    ],
    explanation: 'A-B-C가 삼각형이 되면 어느 방향으로든 패스 경로가 생겨요! 수비수 한 명이 한 선수를 막아도 나머지 두 방향은 열려 있어요. 삼각형은 패스 축구의 기본이에요.',
    xp: 30,
  },
  {
    id: 'pressing',
    title: '압박 (프레싱)',
    subtitle: '수비의 기본',
    concept: '공을 잃으면 팀 전체가 함께 되찾는다',
    description: '빨간 팀이 공을 갖게 됐어요. 파란 선수들은 어떻게 해야 할까요?',
    players: [
      { x: 55, y: 45, team: 'red', label: '공' },
      { x: 70, y: 35, team: 'red' },
      { x: 70, y: 60, team: 'red' },
      { x: 35, y: 45, team: 'blue', label: 'A' },
      { x: 45, y: 30, team: 'blue', label: 'B' },
      { x: 45, y: 65, team: 'blue', label: 'C' },
    ],
    arrows: [
      { from: [35, 45], to: [52, 45], color: '#60D394' },
      { from: [45, 30], to: [55, 37], color: '#60D394' },
      { from: [45, 65], to: [55, 55], color: '#60D394' },
    ],
    quizQuestion: '공을 잃었을 때 파란 팀은 어떻게 해야 할까요?',
    options: [
      { id: 'a', label: '빨리 우리 골대 앞으로 돌아간다', correct: false },
      { id: 'b', label: '공 근처로 같이 달려가서 압박한다', correct: true },
      { id: 'c', label: '각자 상대 선수 한 명씩 맡는다', correct: false },
    ],
    explanation: '공을 잃은 직후 5초 안에 바로 압박하면 상대가 패스할 틈이 없어요! 팀 전체가 공 쪽으로 좁혀가면 공간이 줄어들어서 공을 빼앗기 쉬워져요. 이걸 "게겐프레싱"이라고 해요.',
    xp: 35,
  },
  {
    id: 'defensive_line',
    title: '수비 라인',
    subtitle: '팀 수비의 기본',
    concept: '수비수들은 같이 올라가고 같이 내려온다',
    description: '우리 팀이 공격할 때 수비수들이 어디 있어야 할까요? 한 명은 앞에, 한 명은 뒤에 있으면 어떻게 될까요?',
    players: [
      { x: 70, y: 40, team: 'blue' },
      { x: 75, y: 50, team: 'blue', label: '공격' },
      { x: 40, y: 50, team: 'blue', label: 'D1' },
      { x: 55, y: 65, team: 'blue', label: 'D2' },
      { x: 60, y: 35, team: 'red', label: '위험' },
    ],
    arrows: [
      { from: [55, 65], to: [40, 65], color: '#60D394' },
    ],
    quizQuestion: '수비수 D2는 D1과 같은 라인에 맞춰야 할까요?',
    options: [
      { id: 'a', label: '아니요, 제자리에 있는게 안전해요', correct: false },
      { id: 'b', label: '네, 같은 선에 맞춰야 오프사이드 트랩이 돼요', correct: true },
      { id: 'c', label: '더 앞으로 나가야 해요', correct: false },
    ],
    explanation: '수비수들이 같은 라인에 있으면 "오프사이드 트랩"이 돼요! 한 명이 뒤에 처지면 상대 공격수가 오프사이드 없이 뒤 공간으로 달릴 수 있어서 위험해요. 수비는 항상 같이 올라가고 같이 내려와요.',
    xp: 35,
  },
  {
    id: 'corner_kick',
    title: '코너킥',
    subtitle: '세트피스 기본',
    concept: '코너킥은 미리 약속한 대로 움직인다',
    description: '우리 팀이 코너킥을 얻었어요. 선수들이 어디에 서야 할까요? 다 같이 골대 앞에 몰리면 좋을까요?',
    players: [
      { x: 95, y: 10, team: 'blue', label: 'CK' },
      { x: 80, y: 45, team: 'blue', label: 'A' },
      { x: 80, y: 25, team: 'blue', label: 'B' },
      { x: 70, y: 55, team: 'blue', label: 'C' },
      { x: 50, y: 50, team: 'blue', label: 'D' },
      { x: 78, y: 45, team: 'red' },
      { x: 78, y: 25, team: 'red' },
    ],
    arrows: [
      { from: [80, 45], to: [75, 38], color: '#60D394' },
      { from: [80, 25], to: [82, 40], color: '#60D394' },
    ],
    quizQuestion: '코너킥 상황에서 가장 중요한 것은?',
    options: [
      { id: 'a', label: '다 같이 골대 앞으로 몰린다', correct: false },
      { id: 'b', label: '미리 약속한 위치에 서서 신호에 맞춰 움직인다', correct: true },
      { id: 'c', label: '키 큰 선수만 들어가고 나머지는 뒤에 있는다', correct: false },
    ],
    explanation: '세트피스는 "약속 플레이"예요! 선수마다 맡은 자리가 있고, 키커의 신호에 맞춰 동시에 움직여야 해요. 일부는 앞으로, 일부는 공간으로 달리면 수비가 누구를 막아야 할지 헷갈려요. 팀으로 하는 숨겨진 전술이에요.',
    xp: 40,
  },
  {
    id: 'overlap',
    title: '오버래핑',
    subtitle: '측면 공격 전술',
    concept: '수비수도 공격에 참여해서 수적 우위를 만든다',
    description: '파란 팀 측면 수비수 D가 앞에 있는 윙어 W를 추월해서 달려 올라가요. 이걸 오버래핑이라 해요.',
    players: [
      { x: 80, y: 70, team: 'blue', label: 'D' },
      { x: 75, y: 45, team: 'blue', label: 'W' },
      { x: 70, y: 55, team: 'red' },
      { x: 55, y: 50, team: 'blue', label: '공' },
    ],
    arrows: [
      { from: [80, 70], to: [85, 25], color: '#60D394' },
      { from: [55, 50], to: [85, 25], color: '#60D394', dashed: true },
    ],
    quizQuestion: '오버래핑의 가장 큰 장점은 무엇일까요?',
    options: [
      { id: 'a', label: '수비수가 쉬어서 체력을 아낄 수 있다', correct: false },
      { id: 'b', label: '수비 1명을 상대로 공격 2명이 되어 수적 우위 생긴다', correct: true },
      { id: 'c', label: '윙어가 드리블로 1대1을 할 수 있다', correct: false },
    ],
    explanation: '오버래핑은 수비수가 윙어를 추월해 달리면서 상대 수비를 2대1 상황으로 만드는 거예요! 상대 수비는 둘 중 하나만 막을 수 있어서 항상 한 명이 자유로워져요. 현대 축구에서 측면 수비수(풀백)가 공격에 적극 참여하는 이유예요.',
    xp: 35,
  },
  {
    id: 'wall_pass',
    title: '원투 패스 (벽패스)',
    subtitle: '수비 뚫기 기술',
    concept: '공을 주고 달리면 수비수를 간단히 뚫는다',
    description: '파란 선수 A가 B에게 패스하고 곧바로 앞으로 달려요. B는 A에게 바로 돌려줘요. 이때 수비수는 어떻게 될까요?',
    players: [
      { x: 35, y: 50, team: 'blue', label: 'A' },
      { x: 55, y: 40, team: 'blue', label: 'B' },
      { x: 48, y: 50, team: 'red', label: '수비' },
    ],
    arrows: [
      { from: [35, 50], to: [55, 40], color: '#60D394' },
      { from: [35, 50], to: [65, 50], color: '#FACC15', dashed: true },
      { from: [55, 40], to: [65, 50], color: '#60D394', dashed: true },
    ],
    quizQuestion: '원투 패스 후 A 선수는 어떻게 해야 할까요?',
    options: [
      { id: 'a', label: '패스 후 제자리에 서서 기다린다', correct: false },
      { id: 'b', label: '패스 직후 수비수 뒤 공간으로 바로 달린다', correct: true },
      { id: 'c', label: '뒤로 빠져서 다시 받을 준비를 한다', correct: false },
    ],
    explanation: '원투 패스(1-2 패스)는 공을 주는 순간 달려야 효과가 있어요! A가 패스 후 바로 달리면 수비수는 공(B 쪽)과 달리는 선수(A) 중 하나만 선택해야 해요. B가 재빨리 공간으로 달리는 A에게 돌려주면 수비수는 이미 뒤처진 상태예요.',
    xp: 35,
  },
  {
    id: 'counter_attack',
    title: '역습 (카운터어택)',
    subtitle: '공격 전환 전술',
    concept: '공을 빼앗은 순간 빠르게 전진이 최우선',
    description: '빨간 팀이 공격하다 공을 잃었어요. 파란 팀 선수들이 앞으로 달릴 준비가 되어 있어요.',
    players: [
      { x: 45, y: 50, team: 'blue', label: '공' },
      { x: 65, y: 40, team: 'blue', label: 'A' },
      { x: 65, y: 60, team: 'blue', label: 'B' },
      { x: 55, y: 50, team: 'red' },
      { x: 70, y: 45, team: 'red' },
      { x: 70, y: 55, team: 'red' },
    ],
    arrows: [
      { from: [65, 40], to: [85, 35], color: '#60D394' },
      { from: [65, 60], to: [85, 65], color: '#60D394' },
      { from: [45, 50], to: [85, 48], color: '#60D394', dashed: true },
    ],
    quizQuestion: '역습 상황에서 가장 중요한 것은?',
    options: [
      { id: 'a', label: '천천히 볼을 돌리며 팀을 정비한다', correct: false },
      { id: 'b', label: '최대한 빠르게 앞으로 나가 상대 수비가 돌아오기 전에 공격한다', correct: true },
      { id: 'c', label: '볼을 안전하게 지키며 기다린다', correct: false },
    ],
    explanation: '역습은 시간이 생명이에요! 상대가 공격하다 공을 잃으면 수비수들이 앞에 몇 명 없어요. 그 순간 빠르게 달리면 수적 우위로 골을 넣을 수 있어요. 3~5초 안에 결정해야 해서 평소에 빠른 전환 연습이 필요해요.',
    xp: 35,
  },
  {
    id: 'defensive_block',
    title: '수비 블록',
    subtitle: '팀 수비 전술',
    concept: '촘촘한 블록으로 상대 공간을 없앤다',
    description: '파란 팀이 수비할 때 선수들이 넓게 퍼져있어요. 빨간 팀이 쉽게 드리블로 뚫을 수 있어요. 어떻게 해야 할까요?',
    players: [
      { x: 20, y: 50, team: 'blue', label: 'GK' },
      { x: 35, y: 30, team: 'blue', label: 'D1' },
      { x: 35, y: 70, team: 'blue', label: 'D2' },
      { x: 45, y: 50, team: 'blue', label: 'M' },
      { x: 60, y: 50, team: 'red', label: '공' },
      { x: 75, y: 35, team: 'red' },
    ],
    arrows: [
      { from: [35, 30], to: [38, 42], color: '#60D394' },
      { from: [35, 70], to: [38, 58], color: '#60D394' },
      { from: [45, 50], to: [48, 50], color: '#60D394' },
    ],
    quizQuestion: '수비 블록을 잘 만들려면 선수들이 어떻게 해야 할까요?',
    options: [
      { id: 'a', label: '각자 맡은 선수만 1대1로 막는다', correct: false },
      { id: 'b', label: '서로 가까이 모여서 공 쪽으로 좁혀 공간을 없앤다', correct: true },
      { id: 'c', label: '골대 앞에 다 모여서 슈팅만 막는다', correct: false },
    ],
    explanation: '수비 블록은 선수들이 서로 간격을 좁혀 "벽"을 만드는 거예요! 선수들 사이 공간이 넓으면 상대가 그 틈으로 패스하거나 드리블로 뚫어요. 공 쪽으로 전체가 이동하며 좁은 블록을 유지하면 상대가 갈 공간이 없어져요.',
    xp: 35,
  },
  {
    id: 'wide_play',
    title: '넓게 사용하기',
    subtitle: '공격 포지셔닝',
    concept: '필드를 넓게 쓸수록 상대 수비가 힘들어진다',
    description: '파란 팀 선수들이 가운데만 몰려있어요. 빨간 수비수 3명이 쉽게 다 막을 수 있어요. 어떻게 바꿔야 할까요?',
    players: [
      { x: 50, y: 40, team: 'blue', label: 'A' },
      { x: 55, y: 50, team: 'blue', label: '공' },
      { x: 50, y: 60, team: 'blue', label: 'B' },
      { x: 45, y: 50, team: 'red' },
      { x: 55, y: 40, team: 'red' },
      { x: 55, y: 60, team: 'red' },
    ],
    arrows: [
      { from: [50, 40], to: [20, 35], color: '#60D394' },
      { from: [50, 60], to: [20, 65], color: '#60D394' },
    ],
    quizQuestion: '공격할 때 선수들이 어떻게 위치잡아야 할까요?',
    options: [
      { id: 'a', label: '공 근처에 모여서 패스를 짧게 연결한다', correct: false },
      { id: 'b', label: '측면으로 넓게 퍼져서 수비를 늘린다', correct: true },
      { id: 'c', label: '골대 앞에 많이 있어야 슈팅 기회가 생긴다', correct: false },
    ],
    explanation: '선수들이 넓게 퍼지면 상대 수비도 따라서 넓어져야 해요! 그러면 수비와 수비 사이 공간이 생기고 그 공간으로 패스하거나 드리블할 수 있어요. 필드를 넓게 쓰는 게 공격의 기본이에요.',
    xp: 30,
  },
  {
    id: 'pass_and_move',
    title: '패스 후 움직임',
    subtitle: '공 없을 때의 움직임',
    concept: '공을 주고 멈추지 말고 바로 달려라',
    description: '파란 선수 A가 B에게 패스했어요. 그 다음 A는 어떻게 해야 할까요? 많은 선수들이 패스 후 멈추는 실수를 해요.',
    players: [
      { x: 30, y: 50, team: 'blue', label: 'A' },
      { x: 55, y: 45, team: 'blue', label: 'B' },
      { x: 70, y: 50, team: 'blue', label: 'C' },
      { x: 50, y: 55, team: 'red' },
      { x: 65, y: 45, team: 'red' },
    ],
    arrows: [
      { from: [30, 50], to: [55, 45], color: '#FACC15', dashed: true },
      { from: [30, 50], to: [45, 30], color: '#60D394' },
    ],
    quizQuestion: '패스 후 A 선수가 해야 할 일은?',
    options: [
      { id: 'a', label: '패스했으니 잠깐 쉬면서 상황을 본다', correct: false },
      { id: 'b', label: '패스 직후 새로운 공간으로 바로 달린다', correct: true },
      { id: 'c', label: '수비 위치로 돌아간다', correct: false },
    ],
    explanation: '"패스 후 달리기"는 축구의 핵심이에요! 공을 주고 달리면 ① 다시 패스를 받을 수 있고 ② 수비수를 끌어당겨 팀원을 자유롭게 만들어요. 공을 가진 선수보다 공 없는 선수의 움직임이 더 중요해요.',
    xp: 30,
  },
  {
    id: 'offside_trap',
    title: '오프사이드 트랩',
    subtitle: '수비 전술 (고급)',
    concept: '수비 라인이 동시에 앞으로 나가 오프사이드를 만든다',
    description: '빨간 공격수가 파란 수비 라인 뒤 공간으로 달리려 해요. 파란 수비수들이 동시에 앞으로 나가면 어떻게 될까요?',
    players: [
      { x: 20, y: 50, team: 'blue', label: 'GK' },
      { x: 38, y: 30, team: 'blue', label: 'D1' },
      { x: 38, y: 50, team: 'blue', label: 'D2' },
      { x: 38, y: 70, team: 'blue', label: 'D3' },
      { x: 45, y: 40, team: 'red', label: '공격' },
      { x: 65, y: 35, team: 'red', label: '패스' },
    ],
    arrows: [
      { from: [38, 30], to: [50, 30], color: '#60D394' },
      { from: [38, 50], to: [50, 50], color: '#60D394' },
      { from: [38, 70], to: [50, 70], color: '#60D394' },
    ],
    quizQuestion: '오프사이드 트랩이 성공하려면 수비수들이 어떻게 해야 할까요?',
    options: [
      { id: 'a', label: '각자 판단해서 앞으로 나간다', correct: false },
      { id: 'b', label: '신호에 맞춰 동시에 앞으로 나간다', correct: true },
      { id: 'c', label: '한 명만 앞으로 나가고 나머지는 자리를 지킨다', correct: false },
    ],
    explanation: '오프사이드 트랩은 타이밍이 생명이에요! 수비수 중 한 명이라도 뒤에 처지면 공격수가 오프사이드가 아니게 돼요. 주장이나 골키퍼가 "업!" 같은 신호를 외치면 모두 동시에 나가야 해요. 잘 맞으면 정말 효과적인 전술이에요.',
    xp: 40,
  },
  {
    id: 'switching_play',
    title: '방향 전환 (스위칭)',
    subtitle: '공격 전술',
    concept: '상대 수비가 한쪽으로 쏠리면 반대쪽으로 빠르게 바꾼다',
    description: '파란 팀이 왼쪽에서 공격해서 빨간 수비수들이 왼쪽으로 몰렸어요. 지금 오른쪽이 넓게 열려있어요.',
    players: [
      { x: 25, y: 65, team: 'blue', label: '공' },
      { x: 40, y: 55, team: 'blue', label: 'M' },
      { x: 80, y: 30, team: 'blue', label: 'W' },
      { x: 35, y: 60, team: 'red' },
      { x: 45, y: 65, team: 'red' },
      { x: 30, y: 45, team: 'red' },
    ],
    arrows: [
      { from: [25, 65], to: [40, 55], color: '#FACC15', dashed: true },
      { from: [40, 55], to: [80, 30], color: '#60D394', dashed: true },
    ],
    quizQuestion: '수비가 왼쪽에 몰려있을 때 공격팀이 해야 할 일은?',
    options: [
      { id: 'a', label: '계속 왼쪽으로 공격해서 수적 우위를 활용한다', correct: false },
      { id: 'b', label: '빠르게 반대쪽 열린 공간으로 공을 보낸다', correct: true },
      { id: 'c', label: '일단 볼을 유지하며 수비가 돌아올 때까지 기다린다', correct: false },
    ],
    explanation: '스위칭(방향 전환)은 상대 수비가 한쪽에 쏠렸을 때 빠르게 반대편으로 공을 보내는 거예요! 수비수들이 따라가기 전에 열린 공간을 활용해야 해요. 바르셀로나, 맨시티 같은 팀들이 자주 쓰는 전술이에요.',
    xp: 40,
  },
  {
    id: 'high_press',
    title: '하이프레스',
    subtitle: '공격적 수비 전술',
    concept: '상대 수비수가 공을 잡으면 바로 달려가서 압박한다',
    description: '빨간 팀 수비수가 공을 잡았어요. 파란 공격수들이 멀리서 지켜보고 있어요. 어떻게 해야 공을 빨리 되찾을 수 있을까요?',
    players: [
      { x: 25, y: 50, team: 'red', label: '공' },
      { x: 40, y: 40, team: 'red' },
      { x: 55, y: 50, team: 'blue', label: 'A' },
      { x: 60, y: 35, team: 'blue', label: 'B' },
      { x: 65, y: 60, team: 'blue', label: 'C' },
    ],
    arrows: [
      { from: [55, 50], to: [30, 50], color: '#60D394' },
      { from: [60, 35], to: [35, 38], color: '#60D394' },
    ],
    quizQuestion: '하이프레스에서 공격수들이 해야 할 행동은?',
    options: [
      { id: 'a', label: '상대 수비수가 드리블로 올라올 때까지 기다린다', correct: false },
      { id: 'b', label: '상대 수비수가 공을 잡는 즉시 빠르게 달려가 패스길을 막는다', correct: true },
      { id: 'c', label: '미드필드 라인을 지키며 상대가 넘어오면 막는다', correct: false },
    ],
    explanation: '하이프레스는 상대 진영에서 공을 빼앗는 적극적인 전술이에요! 상대 수비수들은 발이 느리고 패스 실수가 많아서 압박하면 공을 빼앗기 쉬워요. 공을 높은 위치에서 빼앗으면 바로 골찬스로 연결돼요. 리버풀 클롭 감독의 트레이드마크예요.',
    xp: 40,
  },
  {
    id: 'false_nine',
    title: '가짜 9번 (False 9)',
    subtitle: '공격 전술 (고급)',
    concept: '중앙 공격수가 내려와서 공간을 만들고 미드필더가 올라간다',
    description: '파란 팀 9번(공격수)이 뒤로 내려와서 빨간 수비수를 끌어내요. 그러면 뒤에서 미드필더가 그 빈 공간으로 달려올라가요.',
    players: [
      { x: 70, y: 50, team: 'blue', label: '9번' },
      { x: 50, y: 50, team: 'blue', label: 'M' },
      { x: 75, y: 50, team: 'red', label: 'CB' },
    ],
    arrows: [
      { from: [70, 50], to: [52, 55], color: '#60D394' },
      { from: [75, 50], to: [55, 55], color: '#EF4444', dashed: true },
      { from: [50, 50], to: [72, 45], color: '#FACC15' },
    ],
    quizQuestion: '9번이 내려오면 무슨 일이 일어날까요?',
    options: [
      { id: 'a', label: '중앙에 공격수가 없어져서 공격이 약해진다', correct: false },
      { id: 'b', label: '수비수가 따라내려오면 골대 앞 공간이 생기고 미드필더가 그 공간을 쓴다', correct: true },
      { id: 'c', label: '수비수가 올라오면 역습을 할 수 있다', correct: false },
    ],
    explanation: '가짜 9번은 메시, 피르미누 같은 선수들이 많이 써요! 9번이 내려오면 상대 수비수는 딜레마에 빠져요. "따라가면" 수비 뒤 공간이 열리고, "안 따라가면" 9번이 자유롭게 공을 받아요. 어느 쪽이든 공격팀에게 유리해져요.',
    xp: 45,
  },
];

// 날짜 기반으로 오늘의 전술 선택
function getTodayTactic(): TacticData {
  const today = new Date();
  const dayIndex = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
  return TACTICS[dayIndex % TACTICS.length];
}

// ─── SVG 필드 ──────────────────────────────────────────────────
function SoccerField({
  players,
  arrows,
  showArrows,
}: {
  players: Player[];
  arrows: Arrow[];
  showArrows: boolean;
}) {
  const W = 320, H = 180;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl" style={{ background: '#2d7a3a' }}>
      {/* 필드 라인 */}
      <rect x="8" y="8" width={W - 16} height={H - 16} rx="4" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {/* 중앙선 */}
      <line x1={W / 2} y1="8" x2={W / 2} y2={H - 8} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {/* 중앙원 */}
      <circle cx={W / 2} cy={H / 2} r="28" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {/* 왼쪽 골대 */}
      <rect x="8" y={H / 2 - 22} width="18" height="44" rx="2" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      {/* 오른쪽 골대 */}
      <rect x={W - 26} y={H / 2 - 22} width="18" height="44" rx="2" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      {/* 페널티 박스 왼쪽 */}
      <rect x="8" y={H / 2 - 42} width="48" height="84" rx="2" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      {/* 페널티 박스 오른쪽 */}
      <rect x={W - 56} y={H / 2 - 42} width="48" height="84" rx="2" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />

      {/* 정답 화살표 */}
      {showArrows && arrows.map((a, i) => {
        const [x1, y1] = [a.from[0] * W / 100, a.from[1] * H / 100];
        const [x2, y2] = [a.to[0] * W / 100, a.to[1] * H / 100];
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        return (
          <g key={i}>
            <defs>
              <marker id={`arr-${i}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={a.color} />
              </marker>
            </defs>
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={a.color} strokeWidth="2.5"
              strokeDasharray={a.dashed ? '6,4' : undefined}
              markerEnd={`url(#arr-${i})`}
              style={{ animation: 'fadeIn 0.5s ease' }}
            />
          </g>
        );
      })}

      {/* 선수 */}
      {players.map((p, i) => {
        const cx = p.x * W / 100;
        const cy = p.y * H / 100;
        const color = p.team === 'blue' ? '#3B82F6' : p.team === 'red' ? '#EF4444' : '#FACC15';
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="10" fill={color} stroke="white" strokeWidth="1.5" />
            {p.label && (
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────
const TACTIC_XP_KEY = 'tactical-card-xp';

function getTodayKey() {
  const d = new Date();
  return `tactic-done-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type Props = {
  onXpGained?: (xp: number) => void;
};

export default function TacticalCard({ onXpGained }: Props) {
  const tactic = getTodayTactic();
  const todayKey = getTodayKey();

  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [selected, setSelected] = useState<string | null>(null);
  const [alreadyDone, setAlreadyDone] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(todayKey);
    if (done === '1') setAlreadyDone(true);
  }, [todayKey]);

  const correct = tactic.options.find(o => o.id === selected)?.correct ?? false;

  const handleSelect = (id: string) => {
    if (phase !== 'quiz') return;
    setSelected(id);
    setPhase('result');
    if (!alreadyDone) {
      localStorage.setItem(todayKey, '1');
      setAlreadyDone(true);
      const isCorrect = tactic.options.find(o => o.id === id)?.correct;
      if (isCorrect && onXpGained) onXpGained(tactic.xp);
    }
  };

  return (
    <div style={{ background: '#0f2035', border: '1px solid rgba(96,211,148,0.25)', borderRadius: 20, overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ background: 'linear-gradient(135deg, #1a3a2a 0%, #0f2035 100%)', padding: '14px 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 18 }}>🧠</span>
          <span style={{ fontSize: 11, color: '#60D394', fontWeight: 700, letterSpacing: 1 }}>오늘의 전술 카드</span>
          {alreadyDone && (
            <span style={{ marginLeft: 'auto', fontSize: 10, background: 'rgba(96,211,148,0.15)', color: '#60D394', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(96,211,148,0.3)' }}>
              ✓ 완료 +{tactic.xp}XP
            </span>
          )}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>{tactic.title}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{tactic.subtitle}</div>
      </div>

      <div style={{ padding: '14px 18px 18px' }}>
        {/* 핵심 개념 */}
        <div style={{ background: 'rgba(96,211,148,0.1)', border: '1px solid rgba(96,211,148,0.2)', borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#60D394', fontWeight: 600 }}>
          💡 {tactic.concept}
        </div>

        {/* 필드 */}
        <SoccerField players={tactic.players} arrows={tactic.arrows} showArrows={phase === 'result'} />

        {/* 상황 설명 */}
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6, margin: '12px 0' }}>
          {tactic.description}
        </p>

        {/* 인트로 → 퀴즈 시작 */}
        {phase === 'intro' && (
          <button
            onClick={() => setPhase('quiz')}
            style={{ width: '100%', padding: '12px', background: '#60D394', color: '#0a1f14', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}
          >
            퀴즈 풀기 → +{tactic.xp}XP 획득
          </button>
        )}

        {/* 퀴즈 */}
        {phase === 'quiz' && (
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 10 }}>
              ❓ {tactic.quizQuestion}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tactic.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleSelect(opt.id)}
                  style={{
                    padding: '12px 14px', borderRadius: 12, textAlign: 'left',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.85)', fontSize: 13, cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 결과 */}
        {phase === 'result' && (
          <div>
            {/* 정답/오답 배너 */}
            <div style={{
              padding: '10px 14px', borderRadius: 12, marginBottom: 12,
              background: correct ? 'rgba(96,211,148,0.15)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${correct ? 'rgba(96,211,148,0.4)' : 'rgba(239,68,68,0.3)'}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 20 }}>{correct ? '🎉' : '😅'}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: correct ? '#60D394' : '#f87171', margin: 0 }}>
                  {correct ? `정답! +${tactic.xp}XP 획득!` : '아쉽지만 괜찮아요!'}
                </p>
                {!correct && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>
                    정답: {tactic.options.find(o => o.correct)?.label}
                  </p>
                )}
              </div>
            </div>

            {/* 해설 */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontWeight: 600 }}>📖 해설</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, margin: 0 }}>
                {tactic.explanation}
              </p>
            </div>

            {/* 화살표 안내 */}
            <p style={{ fontSize: 11, color: 'rgba(96,211,148,0.7)', textAlign: 'center' }}>
              ↑ 위 필드에서 정답 움직임을 확인해보세요
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
