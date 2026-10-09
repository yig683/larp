// İstemci genel durumu (tek yerde, basit bir nesne).

import type { SlotId } from '../shared/constants';
import type { Gazette, HudState, Phase, PlayerInfo, SceneInfo, SceneResult } from '../shared/protocol';
import type { Tuning } from '../shared/tuning';
import { TUNING_DEFAULTS } from '../shared/tuning';

export type AppPhase = 'menu' | Phase;

export interface Settings {
  name: string;
  sid: string;
  sens: number;
  volume: number;
  tts: boolean;
  quality: 'low' | 'mid' | 'high';
  hints: boolean;
  toggleGrip: boolean;
}

export interface SceneAssign {
  stack: number;
  slots: Record<SlotId, number>;
}

export interface ClientState {
  phase: AppPhase;
  connected: boolean;
  reconnecting: boolean;
  me: { id: number; host: boolean };
  hostToken: string;
  build: string;
  publicUrl: string | undefined;
  players: PlayerInfo[];
  scene: SceneInfo | null;
  assign: SceneAssign[];
  hud: HudState | null;
  wheel: Array<{ stack: number; q: string; phrases: Array<{ i: number; text: string }> }>;
  tuning: Tuning;
  result: SceneResult | null;
  resultNext: boolean;
  gazette: Gazette | null;
  report: string;
  briefingUntil: number;
  phaseSince: number;
  myStack: number;
  mySlots: SlotId[];
  activeSlot: SlotId | null;
  inKidMode: boolean;
  spectateStack: number;
  rtt: number;
  fps: number;
  settings: Settings;
  err: string;
  /** Yalnızca geliştirme/ekran görüntüsü araçları için: sabit serbest kamera. */
  debugCam: { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov: number } | null;
}

function loadSettings(): Settings {
  const d: Settings = { name: '', sid: '', sens: 1, volume: 0.7, tts: true, quality: 'mid', hints: true, toggleGrip: false };
  try {
    const raw = localStorage.getItem('tk.settings');
    if (raw) Object.assign(d, JSON.parse(raw) as Partial<Settings>);
  } catch {
    /* yoksay */
  }
  if (!d.sid) d.sid = 's' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  return d;
}

export function saveSettings(): void {
  try {
    localStorage.setItem('tk.settings', JSON.stringify(S.settings));
  } catch {
    /* yoksay */
  }
}

export const S: ClientState = {
  phase: 'menu',
  connected: false,
  reconnecting: false,
  me: { id: 0, host: false },
  hostToken: new URLSearchParams(location.search).get('host') ?? '',
  build: '',
  publicUrl: undefined,
  players: [],
  scene: null,
  assign: [],
  hud: null,
  wheel: [],
  tuning: { ...TUNING_DEFAULTS },
  result: null,
  resultNext: false,
  gazette: null,
  report: '',
  briefingUntil: 0,
  phaseSince: 0,
  myStack: -1,
  mySlots: [],
  activeSlot: null,
  inKidMode: false,
  spectateStack: 0,
  rtt: 0,
  fps: 60,
  settings: loadSettings(),
  err: '',
  debugCam: null,
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
