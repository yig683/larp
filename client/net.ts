// WebSocket istemcisi (otomatik yeniden bağlanma) ve snapshot enterpolasyonu.

import { PROTOCOL_VERSION } from '../shared/constants';
import { lerp, lerpAngle, qSlerp } from '../shared/math';
import { decodeSnapshot, type BodyState, type C2S, type CharState, type ContState, type CountState, type S2C, type Snapshot } from '../shared/protocol';

export interface NetHandlers {
  onMsg(m: S2C): void;
  onSnap(s: Snapshot): void;
  onStatus(s: 'open' | 'closed'): void;
}

export class Net {
  private ws: WebSocket | null = null;
  private stopped = false;
  private pingTimer: number | undefined;
  rtt = 0;
  connected = false;

  constructor(
    private helloFn: () => Extract<C2S, { t: 'hello' }>,
    private h: NetHandlers,
  ) {}

  connect(): void {
    this.stopped = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.send(this.helloFn());
      this.h.onStatus('open');
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = JSON.parse(e.data) as S2C;
        if (m.t === 'pong') this.rtt = this.rtt * 0.6 + (performance.now() - m.c) * 0.4;
        this.h.onMsg(m);
      } else {
        const s = decodeSnapshot(e.data as ArrayBuffer);
        if (s) this.h.onSnap(s);
      }
    };
    ws.onclose = () => {
      this.connected = false;
      window.clearInterval(this.pingTimer);
      this.h.onStatus('closed');
      if (!this.stopped) window.setTimeout(() => this.connect(), 1500);
    };
    ws.onerror = () => {
      /* onclose ele alır */
    };
  }

  send(m: C2S): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  close(): void {
    this.stopped = true;
    this.ws?.close();
  }
}

// ---------------------------------------------------------------- enterpolasyon

interface Sample<T> {
  t: number;
  v: T;
}

function pushSample<T>(map: Map<number, Sample<T>[]>, id: number, t: number, v: T): void {
  let a = map.get(id);
  if (!a) {
    a = [];
    map.set(id, a);
  }
  if (a.length > 0 && a[a.length - 1]!.t >= t) return;
  a.push({ t, v });
  if (a.length > 8) a.shift();
}

function bracket<T>(a: Sample<T>[], rt: number): { s0: Sample<T>; s1: Sample<T>; f: number } | null {
  if (a.length === 0) return null;
  if (rt >= a[a.length - 1]!.t) return { s0: a[a.length - 1]!, s1: a[a.length - 1]!, f: 0 };
  if (rt <= a[0]!.t) return { s0: a[0]!, s1: a[0]!, f: 0 };
  for (let i = a.length - 1; i > 0; i--) {
    if (a[i - 1]!.t <= rt) {
      const s0 = a[i - 1]!;
      const s1 = a[i]!;
      return { s0, s1, f: (rt - s0.t) / Math.max(1e-6, s1.t - s0.t) };
    }
  }
  return { s0: a[0]!, s1: a[0]!, f: 0 };
}

export class Interp {
  private bodies = new Map<number, Sample<BodyState>[]>();
  private chars = new Map<number, Sample<CharState>[]>();
  private counts = new Map<number, Sample<CountState>[]>();
  conts = new Map<number, ContState>();
  private offset = 0;
  private haveOffset = false;
  snapsPerSec = 0;
  private snapN = 0;
  private snapT0 = performance.now();

  push(s: Snapshot, nowMs: number): void {
    const t = s.tick / 60;
    const off = t - nowMs / 1000;
    if (!this.haveOffset) {
      this.offset = off;
      this.haveOffset = true;
    } else if (off > this.offset) this.offset = off;
    else this.offset += (off - this.offset) * 0.01;
    for (const b of s.bodies) pushSample(this.bodies, b.id, t, b);
    for (const c of s.chars) pushSample(this.chars, c.id, t, c);
    for (const c of s.counts) pushSample(this.counts, c.stack, t, c);
    for (const c of s.conts) this.conts.set(c.id, c);
    this.snapN++;
    if (nowMs - this.snapT0 > 2000) {
      this.snapsPerSec = this.snapN / ((nowMs - this.snapT0) / 1000);
      this.snapN = 0;
      this.snapT0 = nowMs;
    }
  }

  reset(): void {
    this.bodies.clear();
    this.chars.clear();
    this.counts.clear();
    this.conts.clear();
    this.haveOffset = false;
  }

  /** Yerel zamandan, gecikme payı düşülmüş sunucu zamanı. */
  renderTime(nowMs: number, delay: number): number {
    return nowMs / 1000 + this.offset - delay;
  }

  body(id: number, rt: number): BodyState | null {
    const a = this.bodies.get(id);
    if (!a) return null;
    const br = bracket(a, rt);
    if (!br) return null;
    const { s0, s1, f } = br;
    if (f === 0) return s1.v;
    const q = qSlerp({ x: s0.v.qx, y: s0.v.qy, z: s0.v.qz, w: s0.v.qw }, { x: s1.v.qx, y: s1.v.qy, z: s1.v.qz, w: s1.v.qw }, f);
    return {
      id,
      x: lerp(s0.v.x, s1.v.x, f),
      y: lerp(s0.v.y, s1.v.y, f),
      z: lerp(s0.v.z, s1.v.z, f),
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w,
    };
  }

  char(id: number, rt: number): CharState | null {
    const a = this.chars.get(id);
    if (!a) return null;
    const br = bracket(a, rt);
    if (!br) return null;
    const { s0, s1, f } = br;
    if (f === 0) return s1.v;
    return { id, x: lerp(s0.v.x, s1.v.x, f), z: lerp(s0.v.z, s1.v.z, f), yaw: lerpAngle(s0.v.yaw, s1.v.yaw, f), st: s1.v.st, aux: s1.v.aux };
  }

  count(stack: number, rt: number): CountState | null {
    const a = this.counts.get(stack);
    if (!a) return null;
    const br = bracket(a, rt);
    if (!br) return null;
    const { s0, s1, f } = br;
    if (f === 0) return s1.v;
    const A = s0.v;
    const B = s1.v;
    return {
      stack,
      x: lerp(A.x, B.x, f),
      z: lerp(A.z, B.z, f),
      yaw: lerpAngle(A.yaw, B.yaw, f),
      headYaw: lerpAngle(A.headYaw, B.headYaw, f),
      headPitch: lerp(A.headPitch, B.headPitch, f),
      mouth: lerp(A.mouth, B.mouth, f),
      bow: lerp(A.bow, B.bow, f),
      sway: lerp(A.sway, B.sway, f),
      susp: lerp(A.susp, B.susp, f),
      flags: B.flags,
      stain: B.stain,
    };
  }

  latestCount(stack: number): CountState | null {
    const a = this.counts.get(stack);
    return a && a.length > 0 ? a[a.length - 1]!.v : null;
  }
  latestChar(id: number): CharState | null {
    const a = this.chars.get(id);
    return a && a.length > 0 ? a[a.length - 1]!.v : null;
  }
}

export { PROTOCOL_VERSION };
