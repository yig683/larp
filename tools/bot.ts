// Test botu: gerçek WebSocket üzerinden oyuna katılır, durumu izler, girdi gönderir.

import WebSocket from 'ws';
import { PROTOCOL_VERSION, type SlotId } from '../shared/constants';
import { dist2, yawTo } from '../shared/math';
import {
  decodeSnapshot,
  type C2S,
  type Gazette,
  type GameEvent,
  type HudState,
  type InputMsg,
  type Phase,
  type PlayerInfo,
  type S2C,
  type SceneInfo,
  type SceneResult,
  type Snapshot,
} from '../shared/protocol';
import type { Tuning } from '../shared/tuning';

export interface SceneAssign {
  stack: number;
  slots: Record<SlotId, number>;
}

export class Bot {
  ws!: WebSocket;
  id = 0;
  host = false;
  phase: Phase = 'lobby';
  players: PlayerInfo[] = [];
  scene: SceneInfo | null = null;
  assign: SceneAssign[] = [];
  hud: HudState | null = null;
  snap: Snapshot | null = null;
  snapCount = 0;
  snapTimes: number[] = [];
  /** Sunucudan gelen toplam bayt (bant genişliği ölçümü için). */
  bytesIn = 0;
  /** Gelen WebRTC sinyalleri ve ICE ayarı (ses sohbeti testleri için). */
  rtcIn: Array<Extract<S2C, { t: 'rtc' }>> = [];
  ice: unknown[] = [];
  /** Çaylak yapay zekâsı durumu: kendi çaylağım ve paltoların yığılma noktaları. */
  kidId = 0;
  kidStack = -1;
  piles = new Map<number, { x: number; z: number }>();
  events: GameEvent[] = [];
  wheel: { stack: number; q: string; phrases: Array<{ i: number; text: string }> } | null = null;
  result: SceneResult | null = null;
  gazette: Gazette | null = null;
  report = '';
  err = '';
  tuning: Tuning | null = null;
  closed = false;
  pongs = 0;
  private waiters: Array<{ pred: () => boolean; resolve: () => void }> = [];
  private timer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private seq = 0;

  constructor(
    readonly name: string,
    readonly sid: string,
    private hostToken?: string,
  ) {}

  static async connect(url: string, name: string, opts: { hostToken?: string; sid?: string; version?: number } = {}): Promise<Bot> {
    const b = new Bot(name, opts.sid ?? `bot-${name}-${Math.random().toString(36).slice(2)}`, opts.hostToken);
    await b.open(url, opts.version ?? PROTOCOL_VERSION);
    return b;
  }

  private open(url: string, version: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';
      this.ws.on('open', () => {
        this.send({ t: 'hello', v: version, name: this.name, sid: this.sid, host: this.hostToken });
        // gerçek istemci gibi 2 sn'de bir ping: sunucu 45 sn sessiz bağlantıyı kapatır
        this.pingTimer = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 2000);
        resolve();
      });
      this.ws.on('error', reject);
      this.ws.on('close', () => {
        this.closed = true;
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.check();
      });
      this.ws.on('message', (data, isBinary) => {
        this.bytesIn += isBinary ? (data as ArrayBuffer).byteLength : Buffer.byteLength(data.toString());
        if (isBinary) {
          const s = decodeSnapshot(data as ArrayBuffer);
          if (s) {
            this.snap = s;
            this.snapCount++;
            this.snapTimes.push(Date.now());
          }
        } else {
          this.onMsg(JSON.parse(data.toString()) as S2C);
        }
        this.check();
      });
    });
  }

  private onMsg(m: S2C): void {
    switch (m.t) {
      case 'welcome':
        this.id = m.you;
        this.host = m.host;
        this.players = m.players;
        this.phase = m.phase;
        this.tuning = m.tuning;
        this.ice = m.ice ?? [];
        break;
      case 'rtc':
        this.rtcIn.push(m);
        break;
      case 'players':
        this.players = m.players;
        this.phase = m.phase;
        break;
      case 'phase':
        this.phase = m.phase;
        break;
      case 'scene':
        this.scene = m.info;
        this.assign = m.assign;
        this.result = null;
        break;
      case 'hud':
        this.hud = m;
        break;
      case 'evs':
        this.events.push(...m.list);
        if (this.events.length > 4000) this.events.splice(0, 2000);
        for (const e of m.list) this.trackKid(e);
        break;
      case 'wheel':
        this.wheel = m;
        break;
      case 'result':
        this.result = m.result;
        break;
      case 'night':
        this.gazette = m.gazette;
        this.report = m.report;
        break;
      case 'tuning':
        this.tuning = m.tuning;
        break;
      case 'pong':
        this.pongs++;
        break;
      case 'err':
        this.err = m.msg;
        break;
    }
  }

  private trackKid(e: GameEvent): void {
    if (e.k === 'burst') this.piles.set(Number(e.stack), { x: Number(e.x), z: Number(e.z) });
    else if (e.k === 'spawn') {
      const d = e.def as { id: number; type: string; player?: number; stack: number };
      if (d.type === 'kid' && d.player === this.id) {
        this.kidId = d.id;
        this.kidStack = d.stack;
      }
    } else if (e.k === 'despawn' && Number(e.id) === this.kidId) {
      this.kidId = 0;
      this.kidStack = -1;
    }
  }

  send(msg: C2S): void {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
  input(m: Omit<InputMsg, 't' | 'seq'>): void {
    this.send({ t: 'inp', seq: this.seq++, ...m });
  }

  private check(): void {
    for (const w of this.waiters.slice()) {
      if (w.pred()) {
        this.waiters = this.waiters.filter((x) => x !== w);
        w.resolve();
      }
    }
  }

  waitFor(pred: () => boolean, ms = 8000, label = 'koşul'): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new Error(`${this.name}: zaman aşımı (${label}); faz=${this.phase} hata=${this.err}`));
      }, ms);
      const w = {
        pred,
        resolve: () => {
          clearTimeout(to);
          resolve();
        },
      };
      this.waiters.push(w);
    });
  }

  /** Bu oyuncunun sahnedeki slotları. */
  mySlots(): SlotId[] {
    const out: SlotId[] = [];
    for (const a of this.assign) for (const [slot, id] of Object.entries(a.slots)) if (id === this.id) out.push(slot as SlotId);
    return out;
  }
  myStack(): number {
    for (const a of this.assign) if (Object.values(a.slots).includes(this.id)) return a.stack;
    return -1;
  }

  /** Rastgele ama makul bir oyuncu gibi girdi yollar (yük testi için). */
  autoplay(hz = 30): void {
    this.stopAutoplay();
    let t = 0;
    let yaw = 0;
    this.timer = setInterval(() => {
      t += 1 / hz;
      if (this.kidId && this.phase === 'playing') {
        // çaylak: paltonun yanına koş, yanına varınca E'ye basılı tut
        const kid = this.snap?.chars.find((c) => c.id === this.kidId);
        const pile = this.piles.get(this.kidStack);
        if (kid && pile) {
          const d = dist2(kid.x, kid.z, pile.x, pile.z);
          this.input({ mx: 0, mz: d > 1.1 ? 1 : 0, yaw: yawTo(kid.x, kid.z, pile.x, pile.z), run: d > 3, use: d < 1.7 });
        }
        return;
      }
      const slots = this.mySlots();
      if (slots.length === 0 || this.phase !== 'playing') return;
      const msg: Omit<InputMsg, 't' | 'seq'> = {};
      if (slots.includes('legs')) {
        yaw += Math.sin(t * 0.7) * 0.02;
        msg.mz = Math.sin(t * 0.5) > 0 ? 1 : -0.3;
        msg.mx = Math.cos(t * 0.3) * 0.4;
        msg.yaw = yaw;
        msg.run = Math.sin(t * 0.2) > 0.8;
        msg.bow = Math.sin(t * 0.9) > 0.95;
      }
      if (slots.includes('head')) {
        msg.hyaw = Math.sin(t * 0.6) * 0.8;
        msg.hpitch = Math.sin(t * 0.4) * 0.3;
        msg.mouth = Math.sin(t * 1.3) > 0.2;
      }
      if (slots.includes('handL')) msg.hl = { x: -0.2 + Math.sin(t) * 0.5, y: -0.2 + Math.cos(t * 1.3) * 0.4, f: 0.7 + Math.sin(t * 0.8) * 0.4, grip: Math.sin(t * 0.9) > 0.3, slap: Math.sin(t * 0.33) > 0.985 };
      if (slots.includes('handR')) msg.hr = { x: 0.2 + Math.cos(t) * 0.5, y: -0.1 + Math.sin(t * 1.1) * 0.4, f: 0.8 + Math.cos(t * 0.7) * 0.4, grip: Math.cos(t * 0.8) > 0.2, slap: false };
      this.input(msg);
      if (slots.includes('head') && this.wheel && Math.sin(t * 0.37) > 0.995) {
        const w = this.wheel.phrases;
        if (w.length > 0) this.send({ t: 'say', i: Math.floor(Math.abs(Math.sin(t * 13)) * w.length) });
      }
    }, 1000 / hz);
  }
  stopAutoplay(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  close(): void {
    this.stopAutoplay();
    if (this.pingTimer) clearInterval(this.pingTimer);
    try {
      this.ws.close();
    } catch {
      /* yoksay */
    }
  }
}
