import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { ArrowLeft, Trash2, Star, Trophy, Video, X, Play } from 'lucide-react';
import { isTrainingUploadEnabled, uploadTrainingVideo } from '../lib/trainingVideo';

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
  const navigate = useNavigate();
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
    return total;
  }, [mood, goal, learned, skills, wentWell, toImprove, rating, coachNote, videoUrl]);

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

  return (
    <div style={pageStyle}>
      <div style={pitchBgStyle} />

      <div style={containerStyle}>
        {/* 상단 바 */}
        <div style={topBarStyle}>
          <button type="button" onClick={() => navigate('/')} style={backBtnStyle}>
            <ArrowLeft size={16} /> 홈
          </button>
          <div style={dateChipStyle}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayStr())}
              style={dateInputStyle}
            />
          </div>
        </div>

        {/* 헤더 */}
        <header style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 34 }}>⚽📒</div>
          <h1 style={titleStyle}>오늘의 훈련일지</h1>
          <p style={subtitleStyle}>오늘 한 훈련을 이모지로 즐겁게 기록해 봐요!</p>
        </header>

        {/* 레벨/연속 기록 배너 */}
        <section style={statsBannerStyle}>
          <div style={statBoxStyle}>
            <div style={statTopStyle}>
              <Trophy size={16} color={YELLOW} />
              <span style={statLabelStyle}>나의 레벨</span>
            </div>
            <div style={statValueStyle}>Lv.{level}</div>
            <div style={progressTrackStyle}>
              <div style={{ ...progressFillStyle, width: `${levelProgress}%` }} />
            </div>
            <div style={statHintStyle}>다음 레벨까지 {100 - levelProgress} XP</div>
          </div>
          <div style={statBoxStyle}>
            <div style={statTopStyle}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <span style={statLabelStyle}>연속 기록</span>
            </div>
            <div style={statValueStyle}>{streak}일</div>
            <div style={statHintStyle}>{streak > 0 ? '멋져요! 계속 가요' : '오늘부터 시작해요'}</div>
          </div>
        </section>

        {savedXp != null && (
          <div style={rewardBannerStyle}>
            🎉 오늘 일지 저장 완료! <strong style={{ color: NAVY }}>+{savedXp} XP</strong> 획득!
          </div>
        )}

        {/* 오늘의 기분 */}
        <Card title="오늘 기분은 어때요?" emoji="💛">
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
                  <span style={{ fontSize: 30 }}>{m.emoji}</span>
                  <span style={moodLabelStyle}>{m.label}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* 오늘의 목표 */}
        <Card title="오늘의 목표" emoji="🎯">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="예) 왼발 슈팅 10번 성공하기!"
            style={inputStyle}
          />
        </Card>

        {/* 기본기 훈련 체크 */}
        <Card title="오늘 한 기본기 훈련" emoji="✅" hint="한 만큼 콕콕 눌러요 (개당 +10 XP)">
          <div style={skillGridStyle}>
            {SKILLS.map((s) => {
              const done = skills.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSkill(s.id)}
                  style={{ ...skillChipStyle, ...(done ? skillChipDoneStyle : null) }}
                >
                  <span style={{ fontSize: 22 }}>{s.emoji}</span>
                  <span style={skillLabelStyle}>{s.label}</span>
                  {done && <span style={skillCheckStyle}>✓</span>}
                </button>
              );
            })}
          </div>
        </Card>

        {/* 오늘 배운 훈련 */}
        <Card title="오늘 배운 훈련" emoji="📚" hint="스티커를 눌러 꾸며봐요!">
          <textarea
            ref={learnedRef}
            value={learned}
            onChange={(e) => setLearned(e.target.value)}
            placeholder="오늘 무엇을 배우고 연습했는지 적어봐요 ⚽"
            style={textareaStyle}
          />
          <div style={stickerRowStyle}>
            {STICKERS.map((s) => (
              <button key={s} type="button" onClick={() => addSticker(s)} style={stickerBtnStyle}>
                {s}
              </button>
            ))}
          </div>
        </Card>

        {/* 오늘 훈련 영상 */}
        <Card title="오늘 훈련 영상" emoji="🎬" hint={uploadEnabled ? '+20 XP' : undefined}>
          {!uploadEnabled ? (
            <div style={videoDisabledStyle}>
              영상 업로드는 곧 열려요! 조금만 기다려 주세요 🙂
            </div>
          ) : videoUrl ? (
            <div>
              <video src={videoUrl} controls playsInline style={videoPlayerStyle} />
              <button type="button" onClick={removeVideo} style={videoRemoveBtnStyle}>
                <X size={15} /> 영상 빼기
              </button>
            </div>
          ) : uploadingVideo ? (
            <div style={uploadingBoxStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                영상 올리는 중… {videoProgress}%
              </div>
              <div style={progressTrackStyle}>
                <div style={{ ...progressFillStyle, width: `${Math.max(4, videoProgress)}%` }} />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              style={videoUploadBtnStyle}
            >
              <Video size={20} />
              오늘 한 훈련 영상 올리기
              <span style={videoUploadHintStyle}>고배속 영상도 OK · 최대 300MB</span>
            </button>
          )}
          {videoError ? <div style={videoErrorStyle}>{videoError}</div> : null}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoSelect}
            style={{ display: 'none' }}
          />
        </Card>

        {/* 잘한 점 / 아쉬운 점 */}
        <Card title="오늘 잘한 점" emoji="👍">
          <textarea
            value={wentWell}
            onChange={(e) => setWentWell(e.target.value)}
            placeholder="오늘 내가 제일 잘한 건? 🌟"
            style={{ ...textareaStyle, minHeight: 70 }}
          />
        </Card>

        <Card title="아쉬운 점 / 다음에 더 잘하고 싶은 것" emoji="💭">
          <textarea
            value={toImprove}
            onChange={(e) => setToImprove(e.target.value)}
            placeholder="조금 아쉬웠던 점이 있다면 적어봐요 💪"
            style={{ ...textareaStyle, minHeight: 70 }}
          />
        </Card>

        {/* 별점 */}
        <Card title="오늘 훈련 스스로 점수" emoji="⭐">
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
                  size={34}
                  color={n <= rating ? YELLOW : 'rgba(255,255,255,0.25)'}
                  fill={n <= rating ? YELLOW : 'none'}
                />
              </button>
            ))}
          </div>
        </Card>

        {/* 코치/부모 한마디 */}
        <Card title="코치님 · 부모님 한마디" emoji="💬" hint="(선택)">
          <input
            value={coachNote}
            onChange={(e) => setCoachNote(e.target.value)}
            placeholder="응원의 한마디를 적어주세요 😊"
            style={inputStyle}
          />
        </Card>

        {/* 저장 */}
        <div style={saveBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: TEXT_SUB }}>오늘 받을 XP</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: YELLOW }}>+{xp} XP</span>
          </div>
          <button type="button" onClick={handleSave} style={saveBtnStyle}>
            오늘 일지 저장하고 보상 받기 🎁
          </button>
          <button type="button" onClick={resetForm} style={resetBtnStyle}>
            새로 쓰기
          </button>
        </div>

        {/* 지난 훈련일지 */}
        <section style={{ marginTop: 26 }}>
          <h2 style={historyTitleStyle}>📅 지난 훈련일지</h2>
          {entries.length === 0 ? (
            <div style={emptyHistoryStyle}>아직 저장된 일지가 없어요. 첫 일지를 써볼까요? ✍️</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
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
        </section>
      </div>
    </div>
  );
}

function Card({
  title,
  emoji,
  hint,
  children,
}: {
  title: string;
  emoji: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={{ fontSize: 20 }}>{emoji}</span>
        <h3 style={cardTitleStyle}>{title}</h3>
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

const backBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '9px 14px',
  borderRadius: 12,
  border: `1px solid ${STROKE}`,
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
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

const titleStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 26,
  fontWeight: 900,
  letterSpacing: '-0.01em',
};

const subtitleStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 13.5,
  color: TEXT_SUB,
};

const statsBannerStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
  marginBottom: 14,
};

const statBoxStyle: CSSProperties = {
  borderRadius: 18,
  border: `1px solid ${STROKE}`,
  background: `linear-gradient(180deg, ${PANEL_SOFT} 0%, ${PANEL} 100%)`,
  padding: '13px 14px',
};

const statTopStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
const statLabelStyle: CSSProperties = { fontSize: 12, color: TEXT_SUB, fontWeight: 600 };
const statValueStyle: CSSProperties = { marginTop: 4, fontSize: 24, fontWeight: 900, color: YELLOW };
const statHintStyle: CSSProperties = { marginTop: 4, fontSize: 11, color: 'rgba(214,228,247,0.55)' };

const progressTrackStyle: CSSProperties = {
  marginTop: 8,
  height: 7,
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

const rewardBannerStyle: CSSProperties = {
  marginBottom: 14,
  borderRadius: 16,
  background: `linear-gradient(90deg, ${YELLOW}, ${ORANGE})`,
  color: NAVY,
  fontWeight: 700,
  fontSize: 14.5,
  padding: '13px 16px',
  textAlign: 'center',
};

const cardStyle: CSSProperties = {
  borderRadius: 18,
  border: `1px solid ${STROKE}`,
  background: 'rgba(20,37,61,0.82)',
  backdropFilter: 'blur(6px)',
  padding: '15px 15px 16px',
  marginBottom: 12,
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
  flexWrap: 'wrap',
};

const cardTitleStyle: CSSProperties = { fontSize: 16, fontWeight: 800 };
const cardHintStyle: CSSProperties = { fontSize: 11.5, color: 'rgba(214,228,247,0.55)' };

const moodRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 9,
};

const moodBtnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '12px 6px',
  borderRadius: 16,
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
  height: 48,
  borderRadius: 13,
  border: `1px solid ${STROKE}`,
  background: 'rgba(8,15,28,0.6)',
  color: '#fff',
  fontSize: 15,
  padding: '0 14px',
  outline: 'none',
};

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 96,
  borderRadius: 13,
  border: `1px solid ${STROKE}`,
  background: 'rgba(8,15,28,0.6)',
  color: '#fff',
  fontSize: 15,
  lineHeight: 1.6,
  padding: '12px 14px',
  outline: 'none',
  resize: 'vertical',
};

const skillGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 9,
};

const skillChipStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  padding: '12px 4px',
  borderRadius: 15,
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
  width: 40,
  height: 40,
  borderRadius: 11,
  border: `1px solid ${STROKE}`,
  background: 'rgba(255,255,255,0.05)',
  fontSize: 20,
  cursor: 'pointer',
};

const starRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 6,
};

const starBtnStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
};

const saveBarStyle: CSSProperties = {
  marginTop: 18,
  borderRadius: 20,
  border: `1px solid ${STROKE}`,
  background: `linear-gradient(180deg, ${PANEL_SOFT} 0%, ${PANEL} 100%)`,
  padding: 16,
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

const historyTitleStyle: CSSProperties = { fontSize: 17, fontWeight: 800, marginBottom: 11 };

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

const videoUploadBtnStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  padding: '20px 14px',
  borderRadius: 15,
  border: `1.5px dashed ${STROKE}`,
  background: 'rgba(255,255,255,0.03)',
  color: '#fff',
  fontSize: 15,
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
