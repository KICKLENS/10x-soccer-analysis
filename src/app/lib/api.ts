const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');

export const API_BASE_URL = import.meta.env.DEV
  ? ''
  : configuredApiBase || 'https://api.10x.ai.kr';

export type SelectedPlayer = {
  name?: string;
  position?: string;
  teamName?: string;
  jerseyNumber?: string;
  uniformColor?: string;
  traits?: string;
  photo?: string;
  dob?: string;
  heightCm?: string;
  weightKg?: string;
  nationality?: string;
};

const SELECTED_PLAYER_KEYS = [
  'highlight-selected-player',
  'selected-highlight-player',
];

export function toAbsoluteUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) {
    return API_BASE_URL ? `${API_BASE_URL}${url}` : url;
  }
  return API_BASE_URL ? `${API_BASE_URL}/${url}` : `/${url}`;
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${input}`, init);
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const body = await response.text();
    const err = new Error(
      body.startsWith('<!DOCTYPE') || body.startsWith('<html')
        ? `서버 연결에 문제가 있습니다 (${response.status}). 잠시 후 다시 시도해 주세요.`
        : body || `API 응답 오류 (${response.status})`,
    ) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error || data.message || `API 요청 실패 (${response.status})`) as Error & {
      status?: number;
    };
    err.status = response.status;
    throw err;
  }

  return data;
}

export function readSelectedPlayer(): SelectedPlayer {
  for (const key of SELECTED_PLAYER_KEYS) {
    try {
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (!raw) continue;
      const player = JSON.parse(raw) as SelectedPlayer;
      if (player?.name?.trim()) {
        return {
          name: player.name.trim(),
          position: player.position?.trim() || '',
          teamName: player.teamName?.trim() || '',
          jerseyNumber: player.jerseyNumber?.trim() || '',
          uniformColor: player.uniformColor?.trim() || '',
          traits: player.traits?.trim() || '',
          photo: player.photo || '',
          dob: player.dob?.trim() || '',
          heightCm: player.heightCm?.trim() || '',
          weightKg: player.weightKg?.trim() || '',
          nationality: player.nationality?.trim() || '',
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    name: '',
    position: '골키퍼',
    teamName: '',
    jerseyNumber: '',
    uniformColor: '',
    traits: '',
  };
}

export function readSelectedPlayerPosition(): string {
  return readSelectedPlayer().position || '골키퍼';
}
