// İstemci <-> sunucu protokolü. Metin çerçeveleri JSON (kontrol, olay), ikili çerçeveler snapshot'tır.

import type { SlotId } from './constants';
import type { Tuning } from './tuning';
import { clamp, wrapPi } from './math';

export type SceneId = 'reception' | 'dinner' | 'waltz';
export type Phase = 'lobby' | 'briefing' | 'playing' | 'sceneEnd' | 'nightEnd';

export interface PlayerInfo {
  id: number;
  name: string;
  /** 0..7: oyuncu rengi. */
  color: number;
  /** Yığın indeksi, -1 = seyirci. */
  stack: number;
  slots: SlotId[];
  connected: boolean;
  host: boolean;
  ping: number;
}

// ---------------------------------------------------------------- istemci -> sunucu

export interface HandInput {
  /** Omuza göre yerel hedef: sağ, yukarı, ileri (metre). */
  x: number;
  y: number;
  f: number;
  grip: boolean;
  slap: boolean;
}

export interface InputMsg {
  t: 'inp';
  seq: number;
  /** Bacaklar / çaylak: ileri(+) ve sağ(+) eksenleri -1..1. */
  mz?: number;
  mx?: number;
  /** Bacaklar / çaylak: istenen mutlak yaw (rad). */
  yaw?: number;
  run?: boolean;
  bow?: boolean;
  use?: boolean;
  /** Kafa: gövdeye göre bakış. */
  hyaw?: number;
  hpitch?: number;
  mouth?: boolean;
  hl?: HandInput;
  hr?: HandInput;
}

export type LobbyAction = 'start' | 'shuffle' | 'solo' | 'skip' | 'again' | 'lobby';

export type C2S =
  | { t: 'hello'; v: number; name: string; sid: string; host?: string }
  | InputMsg
  | { t: 'ping'; c: number }
  | { t: 'stats'; fps: number; rtt: number }
  | { t: 'say'; i: number }
  | { t: 'lobby'; a: LobbyAction }
  | { t: 'tune'; key: string; value: number }
  | { t: 'tuneReset' };

// ---------------------------------------------------------------- sunucu -> istemci

export interface Objective {
  id: string;
  text: string;
  done: boolean;
  prog?: string;
}

export interface StackHud {
  susp: number;
  bursts: number;
  maxBursts: number;
  mode: 'stacked' | 'burst';
  restack: number;
  score: number;
  obj: Objective[];
}

export interface HudState {
  t: 'hud';
  /** Kalan süre (sn); -1 = süresiz. */
  time: number;
  elapsed: number;
  stacks: StackHud[];
  banner?: string;
}

export interface SceneInfo {
  id: SceneId;
  index: number;
  total: number;
  title: string;
  intro: string;
  hint: string;
}

export type EntityDef =
  | { id: number; type: 'prop'; kind: string; x: number; y: number; z: number; q: [number, number, number, number] }
  | { id: number; type: 'npc'; arch: string; name: string; x: number; z: number; yaw: number }
  | { id: number; type: 'guard'; x: number; z: number; yaw: number }
  | { id: number; type: 'kid'; stack: number; player: number; name: string; color: number; x: number; z: number; yaw: number }
  | { id: number; type: 'coat'; stack: number; x: number; z: number; yaw: number };

export interface GazetteStory {
  head: string;
  body: string;
  kind: string;
  stack: number;
  /** Fotoğraf için istemcinin yerelde yakalayacağı olay etiketi. */
  photo?: string;
}

export interface Gazette {
  issue: number;
  date: string;
  headline: GazetteStory;
  stories: GazetteStory[];
  award: { title: string; text: string };
  weather: string;
  ads: string[];
  scores: Array<{ stack: number; name: string; score: number; bursts: number; peak: number }>;
  winner: number;
}

export interface SceneResult {
  scene: SceneId;
  title: string;
  success: boolean;
  lines: string[];
  stacks: Array<{ stack: number; score: number; success: boolean; bursts: number; peak: number }>;
}

export type GameEvent = { k: string } & Record<string, unknown>;

export type S2C =
  | {
      t: 'welcome';
      you: number;
      host: boolean;
      build: string;
      players: PlayerInfo[];
      phase: Phase;
      tuning: Tuning;
      publicUrl?: string;
    }
  | { t: 'players'; players: PlayerInfo[]; phase: Phase }
  | { t: 'pong'; c: number }
  | { t: 'scene'; info: SceneInfo; entities: EntityDef[]; assign: Array<{ stack: number; slots: Record<SlotId, number> }> }
  | { t: 'phase'; phase: Phase; countdown?: number }
  | HudState
  | { t: 'evs'; list: GameEvent[] }
  | { t: 'wheel'; stack: number; q: string; phrases: Array<{ i: number; text: string }> }
  | { t: 'tuning'; tuning: Tuning }
  | { t: 'result'; result: SceneResult; next: boolean }
  | { t: 'night'; gazette: Gazette; report: string }
  | { t: 'err'; msg: string };

// ---------------------------------------------------------------- yaygın durum kodları

/** NPC / karakter durum baytı. */
export const CH = {
  IDLE: 0,
  WALK: 1,
  TALK: 2,
  HAPPY: 3,
  ANGRY: 4,
  SHOCK: 5,
  GREET_HAND: 6,
  GREET_HAT: 7,
  GREET_BOW: 8,
  DANCE: 9,
  HIT: 10,
  CAUGHT: 11,
  RUN: 12,
  RESTACK: 13,
} as const;

/** Kont bayrakları. */
export const CF = {
  BURST: 1,
  CHEW: 2,
  GRIP_L: 4,
  GRIP_R: 8,
  SLAP_L: 16,
  SLAP_R: 32,
  LINKED: 64,
  HAT_OFF: 128,
} as const;

// ---------------------------------------------------------------- ikili snapshot

export interface BodyState {
  id: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}
export interface CharState {
  id: number;
  x: number;
  z: number;
  yaw: number;
  st: number;
  aux: number;
}
export interface CountState {
  stack: number;
  x: number;
  z: number;
  yaw: number;
  headYaw: number;
  headPitch: number;
  mouth: number;
  bow: number;
  sway: number;
  susp: number;
  flags: number;
  stain: number;
}
export interface ContState {
  id: number;
  load: number;
  sx: number;
  sz: number;
}
export interface Snapshot {
  tick: number;
  bodies: BodyState[];
  chars: CharState[];
  counts: CountState[];
  conts: ContState[];
}

const POS_SCALE = 32767 / 48;
const qPos = (v: number): number => Math.max(-32767, Math.min(32767, Math.round(v * POS_SCALE)));
const dPos = (i: number): number => i / POS_SCALE;
const qAng = (a: number): number => Math.round((wrapPi(a) / Math.PI) * 32767);
const dAng = (i: number): number => (i / 32767) * Math.PI;
const qUnit = (v: number): number => Math.round(clamp(v, -1, 1) * 32767);
const dUnit = (i: number): number => i / 32767;
const q8 = (v: number): number => Math.round(clamp(v, 0, 1) * 255);
const d8 = (i: number): number => i / 255;
const q8s = (v: number): number => Math.round(clamp(v, -1, 1) * 127);
const d8s = (i: number): number => i / 127;

export const SNAP_MAGIC = 0xa1;

const SZ_BODY = 16;
const SZ_CHAR = 10;
const SZ_COUNT = 18;
const SZ_CONT = 5;

export function snapshotSize(s: Snapshot): number {
  return 1 + 4 + 2 + s.bodies.length * SZ_BODY + 2 + s.chars.length * SZ_CHAR + 1 + s.counts.length * SZ_COUNT + 2 + s.conts.length * SZ_CONT;
}

export function encodeSnapshot(s: Snapshot): Uint8Array {
  const buf = new ArrayBuffer(snapshotSize(s));
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint8(o, SNAP_MAGIC);
  o += 1;
  dv.setUint32(o, s.tick >>> 0, true);
  o += 4;
  dv.setUint16(o, s.bodies.length, true);
  o += 2;
  for (const b of s.bodies) {
    dv.setUint16(o, b.id, true);
    dv.setInt16(o + 2, qPos(b.x), true);
    dv.setInt16(o + 4, qPos(b.y), true);
    dv.setInt16(o + 6, qPos(b.z), true);
    dv.setInt16(o + 8, qUnit(b.qx), true);
    dv.setInt16(o + 10, qUnit(b.qy), true);
    dv.setInt16(o + 12, qUnit(b.qz), true);
    dv.setInt16(o + 14, qUnit(b.qw), true);
    o += SZ_BODY;
  }
  dv.setUint16(o, s.chars.length, true);
  o += 2;
  for (const c of s.chars) {
    dv.setUint16(o, c.id, true);
    dv.setInt16(o + 2, qPos(c.x), true);
    dv.setInt16(o + 4, qPos(c.z), true);
    dv.setInt16(o + 6, qAng(c.yaw), true);
    dv.setUint8(o + 8, c.st & 255);
    dv.setUint8(o + 9, c.aux & 255);
    o += SZ_CHAR;
  }
  dv.setUint8(o, s.counts.length);
  o += 1;
  for (const c of s.counts) {
    dv.setUint8(o, c.stack);
    dv.setInt16(o + 1, qPos(c.x), true);
    dv.setInt16(o + 3, qPos(c.z), true);
    dv.setInt16(o + 5, qAng(c.yaw), true);
    dv.setInt16(o + 7, qAng(c.headYaw), true);
    dv.setInt16(o + 9, qAng(c.headPitch), true);
    dv.setUint8(o + 11, q8(c.mouth));
    dv.setUint8(o + 12, q8(c.bow));
    dv.setUint8(o + 13, q8(c.sway));
    dv.setUint8(o + 14, q8(c.susp / 100));
    dv.setUint8(o + 15, c.flags & 255);
    dv.setUint8(o + 16, Math.min(255, c.stain));
    dv.setUint8(o + 17, 0);
    o += SZ_COUNT;
  }
  dv.setUint16(o, s.conts.length, true);
  o += 2;
  for (const c of s.conts) {
    dv.setUint16(o, c.id, true);
    dv.setUint8(o + 2, q8(c.load));
    dv.setInt8(o + 3, q8s(c.sx));
    dv.setInt8(o + 4, q8s(c.sz));
    o += SZ_CONT;
  }
  return new Uint8Array(buf);
}

export function decodeSnapshot(data: ArrayBuffer | Uint8Array): Snapshot | null {
  const ab = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  const dv = new DataView(ab as ArrayBuffer);
  if (dv.byteLength < 10 || dv.getUint8(0) !== SNAP_MAGIC) return null;
  let o = 1;
  const tick = dv.getUint32(o, true);
  o += 4;
  const nb = dv.getUint16(o, true);
  o += 2;
  const bodies: BodyState[] = [];
  for (let i = 0; i < nb; i++) {
    bodies.push({
      id: dv.getUint16(o, true),
      x: dPos(dv.getInt16(o + 2, true)),
      y: dPos(dv.getInt16(o + 4, true)),
      z: dPos(dv.getInt16(o + 6, true)),
      qx: dUnit(dv.getInt16(o + 8, true)),
      qy: dUnit(dv.getInt16(o + 10, true)),
      qz: dUnit(dv.getInt16(o + 12, true)),
      qw: dUnit(dv.getInt16(o + 14, true)),
    });
    o += SZ_BODY;
  }
  const nch = dv.getUint16(o, true);
  o += 2;
  const chars: CharState[] = [];
  for (let i = 0; i < nch; i++) {
    chars.push({
      id: dv.getUint16(o, true),
      x: dPos(dv.getInt16(o + 2, true)),
      z: dPos(dv.getInt16(o + 4, true)),
      yaw: dAng(dv.getInt16(o + 6, true)),
      st: dv.getUint8(o + 8),
      aux: dv.getUint8(o + 9),
    });
    o += SZ_CHAR;
  }
  const nco = dv.getUint8(o);
  o += 1;
  const counts: CountState[] = [];
  for (let i = 0; i < nco; i++) {
    counts.push({
      stack: dv.getUint8(o),
      x: dPos(dv.getInt16(o + 1, true)),
      z: dPos(dv.getInt16(o + 3, true)),
      yaw: dAng(dv.getInt16(o + 5, true)),
      headYaw: dAng(dv.getInt16(o + 7, true)),
      headPitch: dAng(dv.getInt16(o + 9, true)),
      mouth: d8(dv.getUint8(o + 11)),
      bow: d8(dv.getUint8(o + 12)),
      sway: d8(dv.getUint8(o + 13)),
      susp: d8(dv.getUint8(o + 14)) * 100,
      flags: dv.getUint8(o + 15),
      stain: dv.getUint8(o + 16),
    });
    o += SZ_COUNT;
  }
  const ncn = dv.getUint16(o, true);
  o += 2;
  const conts: ContState[] = [];
  for (let i = 0; i < ncn; i++) {
    conts.push({
      id: dv.getUint16(o, true),
      load: d8(dv.getUint8(o + 2)),
      sx: d8s(dv.getInt8(o + 3)),
      sz: d8s(dv.getInt8(o + 4)),
    });
    o += SZ_CONT;
  }
  return { tick, bodies, chars, counts, conts };
}
