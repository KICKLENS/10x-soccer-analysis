import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import confetti from 'canvas-confetti';
import { Trash2, Star, Trophy, Video, X, Play } from 'lucide-react';
import { isTrainingUploadEnabled, uploadTrainingVideo } from '../lib/trainingVideo';
import TacticalBoard, { type BoardToken } from '../components/TacticalBoard';
import TacticalCard from '../components/TacticalCard';
import RuleCard from '../components/RuleCard';
import PageNav from '../components/PageNav';

const STORAGE_KEY = 'training-journal-entries';

const NAVY = '#0B1220';
const PANEL = '#14253D';
const PANEL_SOFT = '#1B2D49';
const STROKE = 'rgba(120,170,230,0.18)';
const YELLOW = '#FFCC33';
const ORANGE = '#FF9F02';
const TEXT_SUB = 'rgba(214,228,247,0.72)';

type MoodOption = { emoji: string; label: string };
const MOODS: MoodOption[] = [
  { emoji: '🤩', label: '최고예요' },
  { emoji: '😄', label: '좋아요' },
  { emoji: '🙂', label: '괜찮아요' },
  { emoji: '😐', label: '그냥그냥' },
  { emoji: '😣', label: '힘들어요' },
  { emoji: '😭', label: '속상해요' },
];

type SkillOption = { id: string; emoji: string; label: string };
const SKILLS: SkillOption[] = [
  { id: 'dribble', emoji: '⚽', label: '드리블' },
  { id: 'pass', emoji: '🤝', label: '패스' },
  { id: 'shoot', emoji: '🎯', label: '슈팅' },
  { id: 'trap', emoji: '🧤', label: '볼컨트롤' },
  { id: 'lifting', emoji: '🦶', label: '리프팅' },
  { id: 'step', emoji: '👟', label: '스텝' },
  { id: 'jumprope', emoji: '🪢', label: '줄넘기' },
  { id: 'stamina', emoji: '🏃', label: '체력' },
  { id: 'heading', emoji: '🙆', label: '헤딩' },
  { id: 'defense', emoji: '🛡️', label: '수비' },
];

const STICKERS = ['⚽', '🥅', '🧤', '🎯', '🤝', '🏃', '🦶', '🔥', '💪', '⭐', '👍', '😎', '🏆', '🥇'];

type JournalEntry = {
  id: string;
  date: string;
  mood: string;
  goal: string;
  learned: string;
  skills: string[];
  wentWell: string;
  toImprove: string;
  rating: number;
  coachNote: string;
  videoUrl?: string;
  board?: BoardToken[];
  boardNote?: string;
  xp: number;
  createdAt: string;
};

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function prettyDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${days[date.getDay()]})`;
  } catch {
    return iso;
  }
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 900px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

function loadEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: JournalEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota
  }
}

function computeStreak(entries: JournalEntry[]): number {
  if (!entries.length) return 0;
  const dates = new Set(entries.map((e) => e.date));
  let streak = 0;
  const cursor = new Date();
  // 오늘 기록이 없으면 어제부터 카운트 (오늘 아직 안 썼어도 어제까지 연속 인정)
  if (!dates.has(todayStr())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (let i = 0; i < 400; i += 1) {
    const mm = String(cursor.getMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getDate()).padStart(2, '0');
    const key = `${cursor.getFullYear()}-${mm}-${dd}`;
    if (dates.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export default function TrainingJournalPage() {
  const isDesktop = useIsDesktop();
  const learnedRef = useRef<HTMLTextAreaElement>(null);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [date, setDate] = useState<string>(todayStr());
  const [mood, setMood] = useState('');
  const [goal, setGoal] = useState('');
  const [learned, setLearned] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [wentWell, setWentWell] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [rating, setRating] = useState(0);
  const [coachNote, setCoachNote] = useState('');
  const [savedXp, setSavedXp] = useState<number | null>(null);

  const [board, setBoard] = useState<BoardToken[]>([]);
  const [boardNote, setBoardNote] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadEnabled, setUploadEnabled] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState('');
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEntries(loadEntries());
    isTrainingUploadEnabled().then(setUploadEnabled);
  }, []);

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setVideoError('영상 파일만 올릴 수 있어요.');
      return;
    }
    if (file.size > 300 * 1024 * 1024) {
      setVideoError('영상이 너무 커요 (최대 300MB). 더 짧게 촬영하거나 화질을 낮춰 주세요.');
      return;
    }

    setVideoError('');
    setUploadingVideo(true);
    setVideoProgress(0);
    try {
      const url = await uploadTrainingVideo(file, setVideoProgress);
      setVideoUrl(url);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : '영상 업로드에 실패했어요.');
    } finally {
      setUploadingVideo(false);
    }
  };

  const removeVideo = () => {
    setVideoUrl('');
    setVideoError('');
    setVideoProgress(0);
  };

  const xp = useMemo(() => {
    let total = 0;
    if (mood) total += 10;
    if (goal.trim()) total += 15;
    if (learned.trim()) total += 20;
    total += skills.length * 10;
    if (wentWell.trim()) total += 15;
    if (toImprove.trim()) total += 15;
    if (rating > 0) total += 10;
    if (coachNote.trim()) total += 10;
    if (videoUrl) total += 20;
    if (board.length > 0) total += 10;
    if (boardNote.trim()) total += 10;
    return total;
  }, [mood, goal, learned, skills, wentWell, toImprove, rating, coachNote, videoUrl, board, boardNote]);

  const totalXp = useMemo(() => entries.reduce((sum, e) => sum + (e.xp || 0), 0), [entries]);
  const level = Math.floor(totalXp / 100) + 1;
  const levelProgress = totalXp % 100;
  const streak = useMemo(() => computeStreak(entries), [entries]);

  const toggleSkill = (id: string) => {
    setSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const addSticker = (sticker: string) => {
    setLearned((prev) => `${prev}${sticker}`);
    learnedRef.current?.focus();
  };

  const resetForm = () => {
    setMood('');
    setGoal('');
    setLearned('');
    setSkills([]);
    setWentWell('');
    setToImprove('');
    setRating(0);
    setCoachNote('');
    setVideoUrl('');
    setVideoError('');
    setVideoProgress(0);
    setBoard([]);
    setBoardNote('');
  };

  const loadEntryToForm = (entry: JournalEntry) => {
    setDate(entry.date);
    setMood(entry.mood);
    setGoal(entry.goal);
    setLearned(entry.learned);
    setSkills(entry.skills || []);
    setWentWell(entry.wentWell);
    setToImprove(entry.toImprove);
    setRating(entry.rating || 0);
    setCoachNote(entry.coachNote || '');
    setVideoUrl(entry.videoUrl || '');
    setVideoError('');
    setVideoProgress(0);
    setBoard(Array.isArray(entry.board) ? entry.board : []);
    setBoardNote(entry.boardNote || '');
    setSavedXp(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteEntry = (id: string) => {
    if (!window.confirm('이 훈련일지를 삭제할까요?')) return;
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    saveEntries(next);
  };

  const handleSave = () => {
    if (uploadingVideo) {
      window.alert('영상 업로드가 끝난 뒤 저장해 주세요! ⏳');
      return;
    }
    if (xp === 0) {
      window.alert('한 가지라도 기록해 주세요! 😊');
      return;
    }
    const entry: JournalEntry = {
      id: `tj_${date}`,
      date,
      mood,
      goal: goal.trim(),
      learned: learned.trim(),
      skills,
      wentWell: wentWell.trim(),
      toImprove: toImprove.trim(),
      rating,
      coachNote: coachNote.trim(),
      videoUrl: videoUrl || undefined,
      board: board.length ? board : undefined,
      boardNote: boardNote.trim() || undefined,
      xp,
      createdAt: new Date().toISOString(),
    };

    const next = [entry, ...entries.filter((e) => e.id !== entry.id)].sort((a, b) =>
      a.date < b.date ? 1 : -1,
    );
    setEntries(next);
    saveEntries(next);
    setSavedXp(xp);

    confetti({ particleCount: 120, spread: 75, origin: { y: 0.7 }, colors: [YELLOW, ORANGE, '#ffffff', '#5A8FCE'] });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => setSavedXp(null), 6000);
  };

  const formGridStyle: CSSProperties = isDesktop
    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'stretch' }
    : { display: 'grid', gridTemplateColumns: '1fr', gap: 10 };

  const showTacticalXpToast = (gained: number) => {
    const el = document.createElement('div');
    el.textContent = `🧠 전술 퀴즈 정답! +${gained}XP`;
    Object.assign(el.style, {
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      background: '#60D394', color: '#0a1f14', padding: '10px 20px',
      borderRadius: '20px', fontWeight: '700', fontSize: '14px',
      zIndex: '9999', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  };

  return (
    <div style={pageStyle}>
      <div style={pitchBgStyle} />

      <div style={{ ...containerStyle, maxWidth: isDesktop ? 920 : 560 }}>
        <PageNav />
        <div style={{ ...topBarStyle, justifyContent: 'flex-end' }}>
          <div style={dateChipStyle}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayStr())}
              style={dateInputStyle}
            />
          </div>
        </div>

        <header style={headerCompactStyle}>
          <div>
            <h1 style={titleStyle}>오늘의 훈련일지</h1>
              <p style={subtitleStyle}>오늘 한 훈련을 이모티콘으로 즐겁게 기록해봐요!</p>
          </div>
          <div style={statsInlineStyle}>
            <div style={statPillStyle}>
              <Trophy size={14} color={YELLOW} />
              <span>Lv.{level}</span>
              <span style={statPillMutedStyle}>{levelProgress}/100</span>
            </div>
            <div style={statPillStyle}>
              <span>🔥</span>
              <span>{streak}일 연속</span>
            </div>
          </div>
        </header>

        {savedXp != null && (
          <div style={rewardBannerStyle}>
            🎉 오늘 일지 저장 완료! <strong style={{ color: NAVY }}>+{savedXp} XP</strong> 획득!
          </div>
        )}

        <SectionLabel title="오늘의 학습" first />
        <div style={stackStyle}>
          <RuleCard />
          <TacticalCard onXpGained={showTacticalXpToast} />
        </div>

        <SectionLabel title="오늘 기록" />
        <div style={formGridStyle}>
          <Card title="오늘 기분" emoji="💛" compact fill>
            <div style={moodRowStyle}>
              {MOODS.map((m) => {
                const active = mood === m.emoji;
                return (
                  <button
                    key={m.emoji}
                    type="button"
                    onClick={() => setMood(active ? '' : m.emoji)}
                    style={{ ...moodBtnStyle, ...(active ? moodBtnActiveStyle : null) }}
                  >
                    <span style={{ fontSize: 26 }}>{m.emoji}</span>
                    <span style={moodLabelStyle}>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="오늘의 목표" emoji="🎯" compact fill>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="예) 왼발 슈팅 10번 성공하기!"
              style={inputStyle}
            />
          </Card>
        </div>

        <div style={{ ...formGridStyle, marginTop: 10 }}>
          <Card title="오늘 한 기본기" emoji="✅" hint="개당 +10 XP" compact style={isDesktop ? { gridColumn: '1 / -1' } : undefined}>
            <div style={{ ...skillGridStyle, gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)' }}>
              {SKILLS.map((s) => {
                const done = skills.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSkill(s.id)}
                    style={{ ...skillChipStyle, ...(done ? skillChipDoneStyle : null) }}
                  >
                    <span style={{ fontSize: 20 }}>{s.emoji}</span>
                    <span style={skillLabelStyle}>{s.label}</span>
                    {done && <span style={skillCheckStyle}>✓</span>}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="오늘 배운 훈련" emoji="📚" compact fill>
            <textarea
              ref={learnedRef}
              value={learned}
              onChange={(e) => setLearned(e.target.value)}
              placeholder="오늘 무엇을 배우고 연습했는지 적어봐요 ⚽"
              style={{ ...textareaStyle, minHeight: 88 }}
            />
            <div style={stickerRowStyle}>
              {STICKERS.map((s) => (
                <button key={s} type="button" onClick={() => addSticker(s)} style={stickerBtnStyle}>
                  {s}
                </button>
              ))}
            </div>
          </Card>

          <Card title="오늘 훈련 영상" emoji="🎬" hint={uploadEnabled ? '+20 XP' : undefined} compact fill>
            {!uploadEnabled ? (
              <div style={videoDisabledStyle}>영상 업로드는 곧 열려요 🙂</div>
            ) : videoUrl ? (
              <div>
                <video src={videoUrl} controls playsInline style={videoPlayerStyle} />
                <button type="button" onClick={removeVideo} style={videoRemoveBtnStyle}>
                  <X size={15} /> 영상 빼기
                </button>
              </div>
            ) : uploadingVideo ? (
              <div style={uploadingBoxStyle}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  영상 올리는 중… {videoProgress}%
                </div>
                <div style={progressTrackStyle}>
                  <div style={{ ...progressFillStyle, width: `${Math.max(4, videoProgress)}%` }} />
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => videoInputRef.current?.click()} style={videoUploadBtnStyle}>
                <Video size={18} />
                훈련 영상 올리기
                <span style={videoUploadHintStyle}>최대 300MB</span>
              </button>
            )}
            {videoError ? <div style={videoErrorStyle}>{videoError}</div> : null}
            <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoSelect} style={{ display: 'none' }} />
          </Card>
        </div>

        <SectionLabel title="복습 & 돌아보기" />
        <Card title="전술판으로 복습" emoji="📋" hint="배치·메모 각 +10 XP" compact>
          <p style={boardDescStyle}>오늘 배운 훈련·경기 장면을 필드에 배치해 복습해 봐요.</p>
          <TacticalBoard value={board} onChange={setBoard} />
          <div style={boardNoteWrapStyle}>
            <div style={boardNoteLabelStyle}>✍️ 전술 복습 메모</div>
            <p style={boardNoteHintStyle}>
              전술 카드처럼, 그림 아래에 오늘 훈련·경기에서 무슨 상황이었는지 적어보세요.
            </p>
            <textarea
              value={boardNote}
              onChange={(e) => setBoardNote(e.target.value)}
              placeholder="예) 코너킥 상황 — 파란 9번이 가까운 골post 쪽으로 침투했고, 공은 6번에게 크로스됐어요. 다음엔 far post 쪽 공간도 봐야겠어요."
              style={{ ...textareaStyle, minHeight: 96, marginTop: 8 }}
            />
          </div>
        </Card>

        <div style={{ ...formGridStyle, marginTop: 10 }}>
          <Card title="오늘 잘한 점" emoji="👍" compact fill>
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              placeholder="오늘 내가 제일 잘한 건? 🌟"
              style={{ ...textareaStyle, minHeight: 88 }}
            />
          </Card>

          <Card title="아쉬운 점" emoji="💭" compact fill>
            <textarea
              value={toImprove}
              onChange={(e) => setToImprove(e.target.value)}
              placeholder="다음에 더 잘하고 싶은 것 💪"
              style={{ ...textareaStyle, minHeight: 88 }}
            />
          </Card>

          <Card title="스스로 점수" emoji="⭐" compact fill>
            <div style={starRowStyle}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  style={starBtnStyle}
                  aria-label={`${n}점`}
                >
                  <Star
                    size={30}
                    color={n <= rating ? YELLOW : 'rgba(255,255,255,0.25)'}
                    fill={n <= rating ? YELLOW : 'none'}
                  />
                </button>
              ))}
            </div>
          </Card>

          <Card title="코치 · 부모 한마디" emoji="💬" hint="선택" compact fill>
            <input
              value={coachNote}
              onChange={(e) => setCoachNote(e.target.value)}
              placeholder="응원의 한마디 😊"
              style={inputStyle}
            />
          </Card>
        </div>

        {/* 저장 */}
        <div style={saveBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: TEXT_SUB }}>오늘 받을 XP</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: YELLOW }}>+{xp} XP</span>
          </div>
          <button type="button" onClick={handleSave} style={saveBtnStyle}>
            오늘 일지 저장하고 보상 받기 🎁
          </button>
          <button type="button" onClick={resetForm} style={resetBtnStyle}>
            새로 쓰기
          </button>
        </div>

        <SectionLabel title="지난 훈련일지" />
        {entries.length === 0 ? (
          <div style={emptyHistoryStyle}>아직 저장된 일지가 없어요. 첫 일지를 써볼까요? ✍️</div>
        ) : (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr' }}>
            {entries.map((e) => (
                <div key={e.id} style={historyCardStyle}>
                  <button type="button" onClick={() => loadEntryToForm(e)} style={historyMainBtnStyle}>
                    <span style={{ fontSize: 28 }}>{e.mood || '⚽'}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={historyDateStyle}>
                        {prettyDate(e.date)}
                        {e.videoUrl ? (
                          <span style={historyVideoBadgeStyle}>
                            <Play size={10} /> 영상
                          </span>
                        ) : null}
                        {e.board && e.board.length ? (
                          <span style={historyBoardBadgeStyle}>📋 전술판</span>
                        ) : null}
                      </span>
                      <span style={historyGoalStyle}>{e.goal || e.learned || '훈련 기록'}</span>
                    </span>
                    <span style={historyXpStyle}>+{e.xp}XP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEntry(e.id)}
                    aria-label="삭제"
                    style={historyDelBtnStyle}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ title, first }: { title: string; first?: boolean }) {
  return <h2 style={{ ...sectionLabelStyle, ...(first ? { marginTop: 0 } : null) }}>{title}</h2>;
}

function Card({
  title,
  emoji,
  hint,
  children,
  style,
  compact,
  fill,
}: {
  title: string;
  emoji: string;
  hint?: string;
  children: React.ReactNode;
  style?: CSSProperties;
  compact?: boolean;
  fill?: boolean;
}) {
  return (
    <section
      style={{
        ...cardStyle,
        ...(compact ? cardCompactStyle : null),
        ...(fill ? cardFillStyle : null),
        ...style,
      }}
    >
      <div style={{ ...cardHeaderStyle, ...(compact ? cardHeaderCompactStyle : null) }}>
        <span style={{ fontSize: compact ? 18 : 20 }}>{emoji}</span>
        <h3 style={{ ...cardTitleStyle, ...(compact ? cardTitleCompactStyle : null) }}>{title}</h3>
        {hint ? <span style={cardHintStyle}>{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: NAVY,
  position: 'relative',
  overflowX: 'hidden',
  color: '#fff',
};

const pitchBgStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  opacity: 0.5,
  backgroundImage: `
    linear-gradient(rgba(120,170,230,0.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120,170,230,0.10) 1px, transparent 1px),
    radial-gradient(circle at 50% 0%, rgba(90,143,206,0.18), transparent 45%)
  `,
  backgroundSize: '46px 46px, 46px 46px, 100% 100%',
};

const containerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 560,
  margin: '0 auto',
  padding: '16px 14px calc(40px + env(safe-area-inset-bottom))',
};

const topBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
};

const dateChipStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${STROKE}`,
  background: PANEL,
  padding: '4px 10px',
};

const dateInputStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  colorScheme: 'dark',
  outline: 'none',
};

const headerCompactStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 14,
  flexWrap: 'wrap',
};

const statsInlineStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  flexShrink: 0,
};

const statPillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 999,
  border: `1px solid ${STROKE}`,
  background: PANEL,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 800,
  color: '#fff',
};

const statPillMutedStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'rgba(214,228,247,0.45)',
};

const sectionLabelStyle: CSSProperties = {
  marginTop: 20,
  marginBottom: 10,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.06em',
  color: 'rgba(214,228,247,0.42)',
};

const stackStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
};

const titleStyle: CSSProperties = {
  marginTop: 0,
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: '-0.01em',
};

const subtitleStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: TEXT_SUB,
};

const rewardBannerStyle: CSSProperties = {
  marginBottom: 12,
  borderRadius: 14,
  background: `linear-gradient(90deg, ${YELLOW}, ${ORANGE})`,
  color: NAVY,
  fontWeight: 700,
  fontSize: 14,
  padding: '11px 14px',
  textAlign: 'center',
};

const cardStyle: CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${STROKE}`,
  background: 'rgba(20,37,61,0.82)',
  backdropFilter: 'blur(6px)',
  padding: '14px 14px 15px',
  marginBottom: 0,
};

const cardCompactStyle: CSSProperties = {
  padding: '12px 12px 13px',
  borderRadius: 14,
};

const cardFillStyle: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginBottom: 10,
  flexWrap: 'wrap',
};

const cardHeaderCompactStyle: CSSProperties = {
  marginBottom: 8,
};

const cardTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 800 };
const cardTitleCompactStyle: CSSProperties = { fontSize: 14 };
const cardHintStyle: CSSProperties = { fontSize: 11, color: 'rgba(214,228,247,0.5)' };

const progressTrackStyle: CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.10)',
  overflow: 'hidden',
};
const progressFillStyle: CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: `linear-gradient(90deg, ${ORANGE}, ${YELLOW})`,
  transition: 'width 0.4s ease',
};

const moodRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 7,
};

const moodBtnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
  padding: '10px 4px',
  borderRadius: 14,
  border: `1.5px solid ${STROKE}`,
  background: 'rgba(255,255,255,0.03)',
  color: '#fff',
  cursor: 'pointer',
  transition: 'transform 0.12s ease, background 0.12s ease',
};

const moodBtnActiveStyle: CSSProperties = {
  background: 'rgba(255,204,51,0.16)',
  borderColor: YELLOW,
  transform: 'translateY(-2px)',
};

const moodLabelStyle: CSSProperties = { fontSize: 11.5, color: TEXT_SUB, fontWeight: 600 };

const inputStyle: CSSProperties = {
  width: '100%',
  height: 44,
  borderRadius: 12,
  border: `1px solid ${STROKE}`,
  background: 'rgba(8,15,28,0.6)',
  color: '#fff',
  fontSize: 14,
  padding: '0 12px',
  outline: 'none',
};

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 88,
  borderRadius: 12,
  border: `1px solid ${STROKE}`,
  background: 'rgba(8,15,28,0.6)',
  color: '#fff',
  fontSize: 14,
  lineHeight: 1.55,
  padding: '10px 12px',
  outline: 'none',
  resize: 'vertical',
};

const skillGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: 7,
};

const skillChipStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '10px 2px',
  borderRadius: 13,
  border: `1.5px solid ${STROKE}`,
  background: 'rgba(255,255,255,0.03)',
  color: '#fff',
  cursor: 'pointer',
  transition: 'transform 0.12s ease',
};

const skillChipDoneStyle: CSSProperties = {
  background: 'rgba(47,191,113,0.18)',
  borderColor: 'rgba(47,191,113,0.7)',
  transform: 'translateY(-2px)',
};

const skillLabelStyle: CSSProperties = { fontSize: 11.5, fontWeight: 700 };

const skillCheckStyle: CSSProperties = {
  position: 'absolute',
  top: 5,
  right: 7,
  fontSize: 12,
  fontWeight: 900,
  color: '#34d676',
};

const stickerRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 10,
};

const stickerBtnStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: `1px solid ${STROKE}`,
  background: 'rgba(255,255,255,0.05)',
  fontSize: 18,
  cursor: 'pointer',
};

const starRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 4,
  flex: 1,
  alignItems: 'center',
};

const starBtnStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
};

const saveBarStyle: CSSProperties = {
  marginTop: 16,
  borderRadius: 16,
  border: `1px solid ${STROKE}`,
  background: `linear-gradient(180deg, ${PANEL_SOFT} 0%, ${PANEL} 100%)`,
  padding: 14,
};

const saveBtnStyle: CSSProperties = {
  width: '100%',
  borderRadius: 15,
  border: 'none',
  background: `linear-gradient(90deg, ${ORANGE}, ${YELLOW})`,
  color: NAVY,
  fontSize: 16,
  fontWeight: 900,
  padding: '15px 16px',
  cursor: 'pointer',
};

const resetBtnStyle: CSSProperties = {
  width: '100%',
  marginTop: 9,
  borderRadius: 15,
  border: `1px solid ${STROKE}`,
  background: 'transparent',
  color: TEXT_SUB,
  fontSize: 13.5,
  fontWeight: 700,
  padding: '11px 16px',
  cursor: 'pointer',
};

const emptyHistoryStyle: CSSProperties = {
  borderRadius: 16,
  border: `1px dashed ${STROKE}`,
  background: 'rgba(255,255,255,0.02)',
  padding: '22px 16px',
  textAlign: 'center',
  fontSize: 13.5,
  color: TEXT_SUB,
};

const historyCardStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
  alignItems: 'stretch',
};

const historyMainBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  textAlign: 'left',
  borderRadius: 15,
  border: `1px solid ${STROKE}`,
  background: 'rgba(20,37,61,0.7)',
  padding: '11px 13px',
  color: '#fff',
  cursor: 'pointer',
  minWidth: 0,
};

const historyDateStyle: CSSProperties = { display: 'block', fontSize: 13.5, fontWeight: 700 };
const historyGoalStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: TEXT_SUB,
  marginTop: 2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '46vw',
};

const historyXpStyle: CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  fontSize: 12.5,
  fontWeight: 800,
  color: YELLOW,
};

const historyDelBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 13px',
  borderRadius: 15,
  border: '1px solid rgba(255,90,80,0.3)',
  background: 'rgba(255,90,80,0.12)',
  color: '#ff8d84',
  cursor: 'pointer',
};

const historyVideoBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  marginLeft: 7,
  padding: '1px 7px',
  borderRadius: 999,
  fontSize: 10.5,
  fontWeight: 700,
  color: NAVY,
  background: YELLOW,
  verticalAlign: 'middle',
};

const historyBoardBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  marginLeft: 6,
  padding: '1px 7px',
  borderRadius: 999,
  fontSize: 10.5,
  fontWeight: 700,
  color: '#fff',
  background: 'rgba(47,123,224,0.5)',
  verticalAlign: 'middle',
};

const boardDescStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_SUB,
  lineHeight: 1.6,
  marginBottom: 11,
};

const boardNoteWrapStyle: CSSProperties = {
  marginTop: 14,
  borderRadius: 14,
  border: '1px solid rgba(96,211,148,0.22)',
  background: 'rgba(96,211,148,0.08)',
  padding: '12px 14px',
};

const boardNoteLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: '#60D394',
};

const boardNoteHintStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11.5,
  color: 'rgba(214,228,247,0.55)',
  lineHeight: 1.5,
};

const videoUploadBtnStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '16px 12px',
  borderRadius: 12,
  border: `1.5px dashed ${STROKE}`,
  background: 'rgba(255,255,255,0.03)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const videoUploadHintStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 500,
  color: 'rgba(214,228,247,0.55)',
};

const videoPlayerStyle: CSSProperties = {
  width: '100%',
  borderRadius: 13,
  border: `1px solid ${STROKE}`,
  background: '#000',
};

const videoRemoveBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  marginTop: 9,
  padding: '8px 13px',
  borderRadius: 11,
  border: '1px solid rgba(255,90,80,0.3)',
  background: 'rgba(255,90,80,0.12)',
  color: '#ff8d84',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const uploadingBoxStyle: CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${STROKE}`,
  background: 'rgba(8,15,28,0.6)',
  padding: '16px 15px',
};

const videoDisabledStyle: CSSProperties = {
  borderRadius: 13,
  border: `1px dashed ${STROKE}`,
  background: 'rgba(255,255,255,0.02)',
  padding: '16px 14px',
  textAlign: 'center',
  fontSize: 13,
  color: TEXT_SUB,
};

const videoErrorStyle: CSSProperties = {
  marginTop: 9,
  fontSize: 12.5,
  fontWeight: 600,
  color: '#ff9a90',
  lineHeight: 1.5,
};
