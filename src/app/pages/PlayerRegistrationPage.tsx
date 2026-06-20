import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

const CAPTURE_PATH = '/mobile-capture';

const PLAYER_STORAGE_KEYS = [
  'playerRecords',
  'players',
  'savedPlayers',
  'player_registration_records',
  'player-registration-records',
];

const SELECTED_PLAYER_STORAGE_KEYS = [
  'highlight-selected-player',
  'selected-highlight-player',
];

interface PlayerRecord {
  id: string;
  name: string;
  position?: string;
  teamName?: string;
  jerseyNumber?: string;
  uniformColor?: string;
  traits?: string;
  createdAt?: string;
  updatedAt?: string;
}

function safeReadJSON<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJSON(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
}

function normalizePlayerRecord(raw: unknown, index: number): PlayerRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const name = String(
    obj.name ??
      obj.playerName ??
      obj.fullName ??
      obj.athleteName ??
      '',
  ).trim();

  if (!name) return null;

  return {
    id: String(obj.id ?? obj.playerId ?? `player-${index + 1}`),
    name,
    position: String(obj.position ?? obj.playerPosition ?? '').trim(),
    teamName: String(obj.teamName ?? obj.team ?? obj.club ?? '').trim(),
    jerseyNumber: String(obj.jerseyNumber ?? obj.backNumber ?? obj.number ?? '').trim(),
    uniformColor: String(obj.uniformColor ?? obj.uniform_color ?? obj.kitColor ?? '').trim(),
    traits: String(obj.traits ?? obj.playerTraits ?? obj.identifyHints ?? '').trim(),
    createdAt: String(obj.createdAt ?? '').trim(),
    updatedAt: String(obj.updatedAt ?? '').trim(),
  };
}

function extractArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.results)) return obj.results as T[];
    if (Array.isArray(obj.players)) return obj.players as T[];
    if (Array.isArray(obj.records)) return obj.records as T[];
  }
  return [];
}

function loadAllPlayers(): PlayerRecord[] {
  const merged: PlayerRecord[] = [];

  for (const key of PLAYER_STORAGE_KEYS) {
    const parsed = safeReadJSON<unknown>(localStorage, key, []);
    const items = extractArray(parsed);

    items.forEach((item, index) => {
      const normalized = normalizePlayerRecord(item, index);
      if (normalized) merged.push(normalized);
    });
  }

  const unique = new Map<string, PlayerRecord>();

  merged.forEach((player) => {
    const uniqueKey = `${player.name}__${player.position ?? ''}__${player.teamName ?? ''}__${player.jerseyNumber ?? ''}`;
    if (!unique.has(uniqueKey)) unique.set(uniqueKey, player);
  });

  return Array.from(unique.values()).sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function savePlayersToAllKeys(players: PlayerRecord[]) {
  for (const key of PLAYER_STORAGE_KEYS) {
    safeWriteJSON(localStorage, key, players);
  }
}

function saveSelectedPlayer(player: PlayerRecord) {
  for (const key of SELECTED_PLAYER_STORAGE_KEYS) {
    safeWriteJSON(localStorage, key, player);
    safeWriteJSON(sessionStorage, key, player);
  }
}

function createPlayerId() {
  return `player_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export default function PlayerRegistrationPage() {
  const navigate = useNavigate();

  const [savedPlayers, setSavedPlayers] = useState<PlayerRecord[]>([]);

  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [teamName, setTeamName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [traits, setTraits] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setSavedPlayers(loadAllPlayers());
  }, []);

  const canSubmit = useMemo(() => {
    return Boolean(name.trim());
  }, [name]);

  const clearMessages = () => {
    setStatusMessage('');
    setErrorMessage('');
  };

  const resetForm = () => {
    setName('');
    setPosition('');
    setTeamName('');
    setJerseyNumber('');
    setTraits('');
    setEditingId(null);
    clearMessages();
  };

  const handleEditSavedPlayer = (player: PlayerRecord) => {
    clearMessages();
    setName(player.name ?? '');
    setPosition(player.position ?? '');
    setTeamName(player.teamName ?? '');
    setJerseyNumber(player.jerseyNumber ?? '');
    setTraits(player.traits ?? '');
    setEditingId(player.id);
    setStatusMessage(`"${player.name}" 선수 정보를 수정하고 있습니다. 변경 후 "수정 내용 저장"을 눌러 주세요.`);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleUseSavedPlayer = (player: PlayerRecord) => {
    clearMessages();
    saveSelectedPlayer(player);
    setStatusMessage(`"${player.name}" 선수로 촬영을 시작합니다.`);
    navigate(CAPTURE_PATH);
  };

  const handleDeleteSavedPlayer = (player: PlayerRecord) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`"${player.name}" 선수를 삭제할까요? 되돌릴 수 없습니다.`);
      if (!ok) return;
    }

    const remaining = loadAllPlayers().filter((item) => item.id !== player.id);
    savePlayersToAllKeys(remaining);
    setSavedPlayers(remaining);

    if (editingId === player.id) {
      resetForm();
    }

    setStatusMessage(`"${player.name}" 선수를 삭제했습니다.`);
  };

  const upsertCurrentPlayer = () => {
    if (!name.trim()) {
      setErrorMessage('선수 이름은 반드시 입력해 주세요.');
      return null;
    }

    const now = new Date().toISOString();
    const existing = loadAllPlayers();

    if (editingId) {
      let updated: PlayerRecord | null = null;
      const next = existing.map((item) => {
        if (item.id !== editingId) return item;
        updated = {
          ...item,
          name: name.trim(),
          position: position.trim(),
          teamName: teamName.trim(),
          jerseyNumber: jerseyNumber.trim(),
          traits: traits.trim(),
          updatedAt: now,
        };
        return updated;
      });

      if (updated) {
        savePlayersToAllKeys(next);
        saveSelectedPlayer(updated);
        setSavedPlayers(next);
        return updated;
      }
    }

    const newPlayer: PlayerRecord = {
      id: createPlayerId(),
      name: name.trim(),
      position: position.trim(),
      teamName: teamName.trim(),
      jerseyNumber: jerseyNumber.trim(),
      uniformColor: '',
      traits: traits.trim(),
      createdAt: now,
      updatedAt: now,
    };

    const mergedMap = new Map<string, PlayerRecord>();

    existing.forEach((player) => {
      const key = `${player.name}__${player.position ?? ''}__${player.teamName ?? ''}__${player.jerseyNumber ?? ''}`;
      mergedMap.set(key, player);
    });

    const newKey = `${newPlayer.name}__${newPlayer.position ?? ''}__${newPlayer.teamName ?? ''}__${newPlayer.jerseyNumber ?? ''}`;
    const previous = mergedMap.get(newKey);

    const finalPlayer: PlayerRecord = previous
      ? {
          ...previous,
          ...newPlayer,
          id: previous.id || newPlayer.id,
          createdAt: previous.createdAt || newPlayer.createdAt,
          updatedAt: now,
        }
      : newPlayer;

    mergedMap.set(newKey, finalPlayer);

    const finalPlayers = Array.from(mergedMap.values()).sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    savePlayersToAllKeys(finalPlayers);
    saveSelectedPlayer(finalPlayer);
    setSavedPlayers(finalPlayers);

    return finalPlayer;
  };

  const handleRegisterOnly = () => {
    const wasEditing = Boolean(editingId);
    clearMessages();

    const finalPlayer = upsertCurrentPlayer();
    if (!finalPlayer) return;

    setEditingId(null);
    setStatusMessage(
      wasEditing
        ? `"${finalPlayer.name}" 선수 정보를 수정했습니다.`
        : `"${finalPlayer.name}" 선수 정보를 저장했습니다.`,
    );
  };

  const handleRegisterAndGo = () => {
    clearMessages();

    const finalPlayer = upsertCurrentPlayer();
    if (!finalPlayer) return;

    setStatusMessage(`"${finalPlayer.name}" 선수 정보를 저장했고, 촬영 페이지로 이동합니다.`);
    navigate(CAPTURE_PATH);
  };

  const handleGoToAnalysis = () => {
    clearMessages();

    const finalPlayer = upsertCurrentPlayer();
    if (!finalPlayer) return;

    setStatusMessage(`"${finalPlayer.name}" 선수 정보를 기준으로 촬영 페이지로 이동합니다.`);
    navigate(CAPTURE_PATH);
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <section style={heroCardStyle}>
          <div style={eyebrowStyle}>PLAYER REGISTRATION</div>
          <h1 style={heroTitleStyle}>선수 등록</h1>
          <p style={heroDescriptionStyle}>
            선수 정보를 저장한 뒤 <strong>촬영하기</strong> 버튼을 누르면,
            등록한 정보가 모바일 촬영·AI 분석 흐름에 자동으로 연결됩니다.
          </p>
        </section>

        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>선수 정보 입력</h2>
            <span style={sectionHintStyle}>이름은 필수, 나머지는 선택 입력</span>
          </div>

          <div style={formGridStyle}>
            <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <label style={labelStyle}>선수 이름</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="예: 김태윤"
                style={inputStyle}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>포지션</label>
              <input
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                placeholder="예: GK, CB, CM, ST"
                style={inputStyle}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>팀명</label>
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="예: 10X FC U18"
                style={inputStyle}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>등번호</label>
              <input
                value={jerseyNumber}
                onChange={(event) => setJerseyNumber(event.target.value)}
                placeholder="예: 1"
                style={inputStyle}
              />
            </div>

            <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <label style={labelStyle}>선수 특징</label>
              <textarea
                value={traits}
                onChange={(event) => setTraits(event.target.value)}
                placeholder="예: 오른발, 키가 큼, 오른쪽 터치라인 근처에서 주로 플레이"
                style={textareaStyle}
              />
              <div style={fieldHelpStyle}>
                등번호·포지션·활동 구역을 구체적으로 입력할수록 해당 선수 중심 분석 정확도가 높아집니다.
                유니폼 색상은 경기마다 달라질 수 있어, 촬영 화면에서 그날의 유니폼을 입력합니다.
              </div>
            </div>
          </div>

          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={handleRegisterAndGo}
              disabled={!canSubmit}
              style={{
                ...primaryButtonStyle,
                gridColumn: '1 / -1',
                ...(!canSubmit ? disabledButtonStyle : null),
              }}
            >
              {editingId ? '수정 내용 저장 후 촬영하기' : '저장 후 촬영하기'}
            </button>

            <button
              type="button"
              onClick={handleRegisterOnly}
              disabled={!canSubmit}
              style={{
                ...secondaryButtonStyle,
                ...(!canSubmit ? disabledButtonStyle : null),
              }}
            >
              {editingId ? '수정 내용 저장' : '선수 정보 저장'}
            </button>

            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                style={outlineButtonStyle}
              >
                수정 취소
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoToAnalysis}
                disabled={!canSubmit}
                style={{
                  ...outlineButtonStyle,
                  ...(!canSubmit ? disabledButtonStyle : null),
                }}
              >
                촬영하기
              </button>
            )}

            {!editingId && (
              <button
                type="button"
                onClick={resetForm}
                style={{ ...secondaryButtonStyle, gridColumn: '1 / -1' }}
              >
                입력 초기화
              </button>
            )}
          </div>
        </section>

        {(statusMessage || errorMessage) && (
          <section
            style={{
              ...statusBoxStyle,
              ...(errorMessage ? statusErrorStyle : statusSuccessStyle),
            }}
          >
            <div style={statusTitleStyle}>현재 상태</div>
            <div style={statusMessageStyle}>{errorMessage || statusMessage}</div>
          </section>
        )}

        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>저장된 선수 목록</h2>
            <span style={sectionHintStyle}>
              촬영·수정·삭제를 선택할 수 있습니다.
            </span>
          </div>

          {savedPlayers.length === 0 ? (
            <div style={emptyStateStyle}>
              아직 저장된 선수가 없습니다. 위에서 먼저 선수 정보를 입력해 주세요.
            </div>
          ) : (
            <div style={cardGridStyle}>
              {savedPlayers.map((player) => (
                <div
                  key={player.id}
                  style={{
                    ...playerCardStyle,
                    ...(editingId === player.id ? playerCardActiveStyle : null),
                  }}
                >
                  <div style={playerCardTitleStyle}>{player.name}</div>
                  <div style={playerMetaStyle}>포지션: {player.position || '-'}</div>
                  <div style={playerMetaStyle}>팀명: {player.teamName || '-'}</div>
                  <div style={playerMetaStyle}>등번호: {player.jerseyNumber || '-'}</div>
                  <div style={playerTraitsStyle}>
                    특징: {player.traits || '-'}
                  </div>

                  <div style={cardActionRowStyle}>
                    <button
                      type="button"
                      onClick={() => handleUseSavedPlayer(player)}
                      style={cardPrimaryActionStyle}
                    >
                      이 선수로 촬영
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditSavedPlayer(player)}
                      style={cardGhostActionStyle}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedPlayer(player)}
                      style={cardDangerActionStyle}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top, rgba(255,159,2,0.10), transparent 28%), linear-gradient(180deg, #0a0a0d 0%, #111216 100%)',
  color: '#f7f7f8',
  padding: '14px 12px calc(28px + env(safe-area-inset-bottom))',
};

const containerStyle: CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const heroCardStyle: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,159,2,0.12), rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 18,
  padding: '16px 16px',
  boxShadow: '0 10px 24px rgba(0,0,0,0.22)',
};

const eyebrowStyle: CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(255,159,2,0.14)',
  color: '#FF9F02',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  marginBottom: 8,
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.15,
  fontWeight: 800,
};

const heroDescriptionStyle: CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  color: 'rgba(255,255,255,0.7)',
  fontSize: 13,
  lineHeight: 1.6,
};

const panelStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 14,
  boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
};

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 18,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 800,
};

const sectionHintStyle: CSSProperties = {
  color: 'rgba(255,255,255,0.58)',
  fontSize: 13,
};

const formGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.72)',
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  height: 48,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
  padding: '0 14px',
  fontSize: 16,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const textareaStyle: CSSProperties = {
  minHeight: 88,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
  padding: '12px 14px',
  fontSize: 16,
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
  lineHeight: 1.6,
  width: '100%',
  boxSizing: 'border-box',
};

const fieldHelpStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.6,
  color: 'rgba(255,255,255,0.56)',
};

const buttonRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
  marginTop: 14,
};

const baseButtonStyle: CSSProperties = {
  minHeight: 50,
  borderRadius: 14,
  border: 'none',
  padding: '0 14px',
  fontSize: 15,
  fontWeight: 800,
  cursor: 'pointer',
  width: '100%',
};

const primaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: '#FF9F02',
  color: '#171717',
};

const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.10)',
};

const outlineButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: 'transparent',
  color: '#FF9F02',
  border: '1px solid rgba(255,159,2,0.45)',
};

const disabledButtonStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.36)',
  border: '1px solid rgba(255,255,255,0.08)',
  cursor: 'not-allowed',
};

const statusBoxStyle: CSSProperties = {
  borderRadius: 18,
  padding: '18px 18px',
  border: '1px solid rgba(255,159,2,0.25)',
};

const statusSuccessStyle: CSSProperties = {
  background: 'rgba(255,159,2,0.14)',
};

const statusErrorStyle: CSSProperties = {
  background: 'rgba(255,120,80,0.14)',
  border: '1px solid rgba(255,120,80,0.24)',
};

const statusTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: '#FF9F02',
  marginBottom: 8,
};

const statusMessageStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  color: '#fff',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const emptyStateStyle: CSSProperties = {
  padding: 18,
  borderRadius: 16,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.72)',
  fontSize: 14,
  lineHeight: 1.7,
};

const cardGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 14,
};

const playerCardStyle: CSSProperties = {
  textAlign: 'left',
  padding: 16,
  borderRadius: 16,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
};

const playerCardActiveStyle: CSSProperties = {
  border: '1px solid rgba(255,159,2,0.55)',
  background: 'rgba(255,159,2,0.10)',
};

const cardActionRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 0.8fr 0.8fr',
  gap: 8,
  marginTop: 14,
};

const cardActionBaseStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 11,
  border: 'none',
  padding: '0 10px',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
};

const cardPrimaryActionStyle: CSSProperties = {
  ...cardActionBaseStyle,
  background: '#FF9F02',
  color: '#171717',
};

const cardGhostActionStyle: CSSProperties = {
  ...cardActionBaseStyle,
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.12)',
};

const cardDangerActionStyle: CSSProperties = {
  ...cardActionBaseStyle,
  background: 'rgba(255,90,80,0.14)',
  color: '#ff8d84',
  border: '1px solid rgba(255,90,80,0.30)',
};

const playerCardTitleStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  marginBottom: 10,
};

const playerMetaStyle: CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.76)',
  lineHeight: 1.7,
};

const playerTraitsStyle: CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  color: 'rgba(255,255,255,0.86)',
  lineHeight: 1.7,
  wordBreak: 'break-word',
};
