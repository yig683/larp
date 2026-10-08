// Oda: oyuncular, lobi, faz makinesi (lobi → brifing → oyun → sahne sonu → gece sonu), yayınlar.

import { DT, MAX_PLAYERS, PROTOCOL_VERSION, SLOT_IDS, SNAP_EVERY, STACK_NAMES, type SlotId } from '../shared/constants';
import { Rng } from '../shared/rng';
import { assignStacks, rotateAssign, slotMap, slotsOf, type StackAssign } from '../shared/roles';
import { encodeSnapshot, type C2S, type Gazette, type GameEvent, type Phase, type PlayerInfo, type S2C, type SceneId, type SceneResult } from '../shared/protocol';
import { TUNE_DEFS, TUNING_DEFAULTS, sanitizeTuning, type Tuning } from '../shared/tuning';
import { makeGazette } from './gazette';
import { Game, type StoryEvent } from './game';
import { buildReport, roleLine, type PlayerStat } from './report';
import { NIGHT_ORDER } from './scenes';

export interface Conn {
  send(text: string): void;
  sendBin(data: Uint8Array): void;
  close(): void;
}

export const BRIEF_SECS = 8;
export const END_SECS = 12;
export const RESULT_DELAY = 2.5;

class PlayerRt {
  conn: Conn | null = null;
  stack = -1;
  host = false;
  lastSeen = Date.now();
  ping = 0;
  fps = 0;
  pings: number[] = [];
  fpsS: number[] = [];
  disconnects = 0;
  constructor(
    readonly id: number,
    readonly sid: string,
    public name: string,
    public color: number,
  ) {}
}

interface Night {
  seed: number;
  scenes: SceneId[];
  index: number;
  assigns: StackAssign[];
  solo: boolean;
  results: SceneResult[];
  story: StoryEvent[];
  startedAt: number;
  roles: string[];
  notes: string[];
  issue: number;
}

const sanitizeName = (n: unknown): string => {
  if (typeof n !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
};

export class Room {
  readonly players = new Map<number, PlayerRt>();
  phase: Phase = 'lobby';
  phaseT = 0;
  game: Game | null = null;
  night: Night | null = null;
  tuning: Tuning;
  publicUrl: string | undefined;
  nightCount = 0;
  lastGazette: Gazette | null = null;
  lastReport = '';
  private nextId = 1;
  private tickN = 0;
  private hudSent = '';
  private idleSince = 0;

  constructor(
    readonly build: string,
    readonly hostToken: string,
    tuning?: Partial<Tuning>,
    private onTuning?: (t: Tuning) => void,
  ) {
    this.tuning = sanitizeTuning(tuning);
  }

  // ------------------------------------------------------------ yayın

  private send(p: PlayerRt, msg: S2C): void {
    p.conn?.send(JSON.stringify(msg));
  }
  broadcast(msg: S2C): void {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) p.conn?.send(s);
  }
  private broadcastBin(b: Uint8Array): void {
    for (const p of this.players.values()) p.conn?.sendBin(b);
  }

  connected(): PlayerRt[] {
    return Array.from(this.players.values()).filter((p) => p.conn);
  }

  playerInfos(): PlayerInfo[] {
    const assigns = this.night?.assigns ?? [];
    return Array.from(this.players.values()).map((p) => {
      const a = this.game ? assigns[p.stack] : undefined;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        stack: p.stack,
        slots: a ? slotsOf(a, p.id) : [],
        connected: !!p.conn,
        host: p.host,
        ping: Math.round(p.ping),
      };
    });
  }

  private pushPlayers(): void {
    this.broadcast({ t: 'players', players: this.playerInfos(), phase: this.phase });
  }

  // ------------------------------------------------------------ bağlantı

  join(conn: Conn, hello: Extract<C2S, { t: 'hello' }>): PlayerRt | null {
    if (hello.v !== PROTOCOL_VERSION) {
      conn.send(JSON.stringify({ t: 'err', msg: 'Sürüm uyuşmuyor: sayfayı yenile (Ctrl+F5).' } satisfies S2C));
      conn.close();
      return null;
    }
    const name = sanitizeName(hello.name) || 'Misafir';
    const sid = typeof hello.sid === 'string' ? hello.sid.slice(0, 40) : '';
    let p = Array.from(this.players.values()).find((x) => x.sid === sid && sid !== '');
    if (p) {
      p.conn?.close();
      p.conn = conn;
      p.name = name;
    } else {
      if (this.connected().length >= MAX_PLAYERS) {
        conn.send(JSON.stringify({ t: 'err', msg: 'Salon dolu (en fazla 12 kişi).' } satisfies S2C));
        conn.close();
        return null;
      }
      const used = new Set(Array.from(this.players.values()).map((x) => x.color));
      let color = 0;
      while (used.has(color) && color < 7) color++;
      p = new PlayerRt(this.nextId++, sid || `s${Math.random().toString(36).slice(2)}`, name, color);
      p.conn = conn;
      this.players.set(p.id, p);
    }
    p.lastSeen = Date.now();
    p.host = hello.host === this.hostToken && !!hello.host;
    this.send(p, {
      t: 'welcome',
      you: p.id,
      host: p.host,
      build: this.build,
      players: this.playerInfos(),
      phase: this.phase,
      tuning: this.tuning,
      publicUrl: p.host ? this.publicUrl : undefined,
    });
    this.pushPlayers();
    if (this.game) this.syncJoiner(p);
    return p;
  }

  private syncJoiner(p: PlayerRt): void {
    const g = this.game!;
    this.send(p, this.sceneMsg(g));
    this.send(p, { t: 'phase', phase: this.phase, countdown: Math.max(0, BRIEF_SECS - this.phaseT) });
    p.conn?.sendBin(encodeSnapshot(g.buildSnapshot(true, false)));
    this.send(p, g.buildHud());
    for (let s = 0; s < g.counts.length; s++) {
      const w = g.wheelMsg(s);
      if (w) this.send(p, w);
    }
    if (this.phase === 'sceneEnd' && g.result) this.send(p, { t: 'result', result: g.result, next: this.night!.index + 1 < this.night!.scenes.length });
    if (this.phase === 'nightEnd' && this.lastGazette) this.send(p, { t: 'night', gazette: this.lastGazette, report: this.lastReport });
  }

  leave(conn: Conn): void {
    const p = Array.from(this.players.values()).find((x) => x.conn === conn);
    if (!p) return;
    p.conn = null;
    p.disconnects++;
    this.game?.dropPlayer(p.id);
    if (this.phase === 'lobby') this.players.delete(p.id);
    this.pushPlayers();
  }

  playerByConn(conn: Conn): PlayerRt | undefined {
    return Array.from(this.players.values()).find((x) => x.conn === conn);
  }

  // ------------------------------------------------------------ mesajlar

  onMessage(p: PlayerRt, msg: C2S): void {
    p.lastSeen = Date.now();
    switch (msg.t) {
      case 'ping':
        this.send(p, { t: 'pong', c: msg.c });
        break;
      case 'stats':
        if (Number.isFinite(msg.rtt)) {
          p.ping = msg.rtt;
          if (p.pings.length < 1200) p.pings.push(msg.rtt);
        }
        if (Number.isFinite(msg.fps) && msg.fps > 0) {
          p.fps = msg.fps;
          if (p.fpsS.length < 1200) p.fpsS.push(msg.fps);
        }
        break;
      case 'inp':
        if (this.game && this.phase === 'playing') this.game.setInput(p.id, msg);
        break;
      case 'say': {
        const g = this.game;
        if (!g || this.phase !== 'playing' || p.stack < 0) break;
        const c = g.counts[p.stack];
        if (c && c.assign.slots.head === p.id && Number.isInteger(msg.i)) g.sayPhrase(p.stack, msg.i);
        break;
      }
      case 'lobby':
        if (p.host) this.hostAction(msg.a);
        break;
      case 'tune':
        if (p.host && typeof msg.key === 'string' && typeof msg.value === 'number') {
          const d = TUNE_DEFS.find((x) => x.key === msg.key);
          if (d && Number.isFinite(msg.value)) {
            this.tuning[d.key] = Math.min(d.max, Math.max(d.min, msg.value));
            this.broadcast({ t: 'tuning', tuning: this.tuning });
            this.onTuning?.(this.tuning);
          }
        }
        break;
      case 'tuneReset':
        if (p.host) {
          Object.assign(this.tuning, TUNING_DEFAULTS);
          this.broadcast({ t: 'tuning', tuning: this.tuning });
          this.onTuning?.(this.tuning);
        }
        break;
      default:
        break;
    }
  }

  private hostAction(a: string): void {
    switch (a) {
      case 'start':
        if (this.phase === 'lobby') this.startNight(false);
        break;
      case 'solo':
        if (this.phase === 'lobby') this.startNight(true);
        break;
      case 'skip':
        if (this.phase === 'briefing') this.beginPlaying();
        else if (this.phase === 'sceneEnd') this.nextScene();
        else if (this.phase === 'playing') this.game?.forceFinish();
        break;
      case 'again':
      case 'lobby':
        this.abortToLobby();
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ gece akışı

  startNight(solo: boolean): void {
    const active = this.connected().sort((a, b) => a.id - b.id);
    if (active.length === 0) return;
    const seed = (Date.now() & 0x7fffffff) >>> 0;
    const useSolo = solo || active.length === 1;
    let assigns: StackAssign[];
    if (useSolo) {
      const only = active.find((p) => p.host) ?? active[0]!;
      assigns = [{ stack: 0, members: [only.id], slots: slotMap([only.id]) }];
    } else {
      assigns = assignStacks(active.slice(0, 8).map((p) => p.id), new Rng(seed));
    }
    this.nightCount++;
    this.night = {
      seed,
      scenes: NIGHT_ORDER.slice(),
      index: 0,
      assigns,
      solo: useSolo,
      results: [],
      story: [],
      startedAt: Date.now(),
      roles: [],
      notes: [],
      issue: this.nightCount,
    };
    for (const p of this.players.values()) {
      p.pings = [];
      p.fpsS = [];
    }
    this.startScene(0);
  }

  private startScene(index: number): void {
    const night = this.night!;
    night.index = index;
    if (index > 0 && !night.solo) {
      // Oyuncu kümesi değiştiyse baştan dağıt, değişmediyse roller kaysın
      const connected = this.connected().map((p) => p.id).sort((a, b) => a - b).slice(0, 8);
      const inNight = night.assigns.flatMap((a) => a.members).sort((a, b) => a - b);
      const same = connected.length === inNight.length && connected.every((id, i) => id === inNight[i]);
      night.assigns = same ? night.assigns.map((a) => rotateAssign(a)) : assignStacks(connected, new Rng(night.seed + index));
    } else if (index > 0) {
      night.assigns = night.assigns.map((a) => rotateAssign(a));
    }
    this.game?.dispose();
    const ids = new Set(night.assigns.flatMap((a) => a.members));
    const pl = new Map<number, { id: number; name: string; color: number }>();
    for (const id of ids) {
      const p = this.players.get(id);
      if (p) pl.set(id, { id, name: p.name, color: p.color });
    }
    const sceneId = night.scenes[index]!;
    this.game = new Game({ scene: sceneId, index, total: night.scenes.length, assigns: night.assigns, players: pl, tuning: this.tuning, seed: night.seed + index * 101 });
    for (const p of this.players.values()) p.stack = -1;
    for (const a of night.assigns) for (const m of a.members) {
      const p = this.players.get(m);
      if (p) p.stack = a.stack;
    }
    const nameOf = (id: number): string => this.players.get(id)?.name ?? `#${id}`;
    night.roles.push(roleLine(this.game.info.title, night.assigns.map((a) => ({ stack: a.stack, slots: a.slots })), nameOf));
    this.phase = 'briefing';
    this.phaseT = 0;
    this.hudSent = '';
    this.broadcast(this.sceneMsg(this.game));
    this.broadcast({ t: 'phase', phase: 'briefing', countdown: BRIEF_SECS });
    this.broadcastBin(encodeSnapshot(this.game.buildSnapshot(true)));
    this.flushEvents();
    this.broadcast(this.game.buildHud());
    this.pushPlayers();
  }

  private sceneMsg(g: Game): S2C {
    return {
      t: 'scene',
      info: g.info,
      entities: g.entityDefs(),
      assign: g.opts.assigns.map((a) => ({ stack: a.stack, slots: a.slots })),
    };
  }

  private beginPlaying(): void {
    if (this.phase !== 'briefing') return;
    this.phase = 'playing';
    this.phaseT = 0;
    this.broadcast({ t: 'phase', phase: 'playing' });
    this.pushPlayers();
  }

  private finishScene(): void {
    const g = this.game!;
    const night = this.night!;
    const result = g.result!;
    night.results.push(result);
    night.story.push(...g.story);
    night.notes.push(`Süre: ${Math.round(g.time)} sn · hikâye olayı: ${g.story.length}`);
    this.phase = 'sceneEnd';
    this.phaseT = 0;
    this.broadcast({ t: 'result', result, next: night.index + 1 < night.scenes.length });
    this.broadcast({ t: 'phase', phase: 'sceneEnd' });
  }

  private nextScene(): void {
    const night = this.night;
    if (!night) return;
    if (night.index + 1 < night.scenes.length) this.startScene(night.index + 1);
    else this.finishNight();
  }

  private finishNight(): void {
    const night = this.night!;
    const stackCount = night.assigns.length;
    const gz = makeGazette(night.story, night.results, new Rng(night.seed ^ 0x5bd1e995), night.issue, stackCount);
    const stats: PlayerStat[] = Array.from(this.players.values()).map((p) => ({ name: p.name, pings: p.pings, fps: p.fpsS, disconnects: p.disconnects }));
    const report = buildReport({
      build: this.build,
      startedAt: night.startedAt,
      playerCount: this.connected().length,
      solo: night.solo,
      players: stats,
      results: night.results,
      sceneNotes: night.notes,
      tuning: this.tuning,
      roles: night.roles,
    });
    this.lastGazette = gz;
    this.lastReport = report;
    this.phase = 'nightEnd';
    this.phaseT = 0;
    this.broadcast({ t: 'night', gazette: gz, report });
    this.broadcast({ t: 'phase', phase: 'nightEnd' });
  }

  abortToLobby(): void {
    this.game?.dispose();
    this.game = null;
    this.night = null;
    this.phase = 'lobby';
    this.phaseT = 0;
    for (const p of this.players.values()) p.stack = -1;
    for (const [id, p] of Array.from(this.players.entries())) if (!p.conn) this.players.delete(id);
    this.broadcast({ t: 'phase', phase: 'lobby' });
    this.pushPlayers();
  }

  // ------------------------------------------------------------ zaman

  private flushEvents(): void {
    const g = this.game;
    if (!g) return;
    const evs = g.drainEvents();
    if (evs.length === 0) return;
    const plain: GameEvent[] = [];
    for (const e of evs) {
      if (e.k === 'wheel') {
        this.broadcast({ t: 'wheel', stack: e.stack as number, q: e.q as string, phrases: e.phrases as Array<{ i: number; text: string }> });
      } else plain.push(e);
    }
    if (plain.length > 0) this.broadcast({ t: 'evs', list: plain });
  }

  /** 60 Hz'de çağrılır. */
  tick(): void {
    this.tickN++;
    this.phaseT += DT;
    const g = this.game;
    if (this.phase === 'briefing') {
      if (this.phaseT >= BRIEF_SECS) this.beginPlaying();
    } else if (this.phase === 'playing' && g) {
      if (this.connected().length > 0) {
        g.step();
        this.flushEvents();
        if (this.tickN % SNAP_EVERY === 0) this.broadcastBin(encodeSnapshot(g.buildSnapshot(g.needKeyframe())));
        if (this.tickN % 12 === 0) {
          const hud = g.buildHud();
          const sig = JSON.stringify({ ...hud, elapsed: 0, time: Math.round(hud.time) });
          if (sig !== this.hudSent || this.tickN % 60 === 0) {
            this.hudSent = sig;
            this.broadcast(hud);
          }
        }
        if (g.result && g.time - g.endT >= RESULT_DELAY) this.finishScene();
      }
    } else if (this.phase === 'sceneEnd') {
      if (this.phaseT >= END_SECS) this.nextScene();
    }
    if (this.tickN % 60 === 0) this.housekeeping();
  }

  private housekeeping(): void {
    const now = Date.now();
    for (const p of this.players.values()) {
      if (p.conn && now - p.lastSeen > 45000) p.conn.close();
    }
    if (this.phase === 'lobby' && this.tickN % 180 === 0) this.pushPlayers();
    if (this.connected().length === 0) {
      if (!this.idleSince) this.idleSince = now;
      if (this.phase !== 'lobby' && now - this.idleSince > 120000) this.abortToLobby();
    } else this.idleSince = 0;
  }

  /** Sunucu sağlığı için kısa özet. */
  status(): string {
    return `faz=${this.phase} oyuncu=${this.connected().length}/${this.players.size} sahne=${this.game?.info.id ?? '-'}`;
  }
}

export { SLOT_IDS, STACK_NAMES };
export type { SlotId };
