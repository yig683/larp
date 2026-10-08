// Vals: iki Kont el ele tutuşup pistte iki tur döner (tek yığınsa partner Düşes).

import { angDiff, dist2, dist3, yawTo } from '../../shared/math';
import { npcHandPoint } from '../../shared/npc';
import type { Objective } from '../../shared/protocol';
import { CH } from '../../shared/protocol';
import type { Game } from '../game';
import type { HandRt, NpcRt } from '../entities';
import type { SceneLogic, SceneOutcome } from './types';

const LAPS = 2;
const TARGET = LAPS * Math.PI * 2;
const LINK_DIST = 0.4;
const BREAK_DIST = 1.25;

interface Dancer {
  npc: NpcRt;
  r: number;
  a: number;
  w: number;
}

export class WaltzScene implements SceneLogic {
  readonly id = 'waltz' as const;
  readonly title = 'Vals';
  readonly intro = 'Eller kenetlenir, bacaklar birlikte adım atar. Partnerinle pistte iki tur dön; dansçılara çarpma.';
  readonly hint = "İki Kont: birinin eli öbürünün elini tutsun (sol tık basılı). Tek Kont: Düşes'in elini tut.";
  readonly timeLimit = 250;

  private dancers: Dancer[] = [];
  private partner: Dancer | null = null;
  private pairs: Array<{ a: HandRt; b: HandRt }> = [];
  private npcLinks: Array<{ h: HandRt; npc: NpcRt }> = [];
  private sweep = 0;
  private phiPrev: number | null = null;
  private linkedTime = 0;
  private done = false;
  private bannerText: string | undefined;
  private bannerUntil = 0;

  spawn(stack: number, n: number): { x: number; z: number; yaw: number } {
    if (n === 1) return { x: -2.6, z: 2.6, yaw: -Math.PI / 2 };
    return stack === 0 ? { x: -2.9, z: 2.6, yaw: -Math.PI / 2 } : { x: 2.9, z: 2.6, yaw: Math.PI / 2 };
  }

  setup(g: Game): void {
    const archs = ['lady', 'sir', 'madame', 'critic', 'colonel', 'banker'];
    const names = ['Leydi Pembe', 'Sör Reginald', 'Madam Fifi', 'Eleştirmen Cemile', 'Albay Kızılcık', 'Bankacı Kasa'];
    for (let i = 0; i < 4; i++) {
      const n = g.spawnNpc(archs[i]!, names[i]!, 0, 0, 0, 'dancer');
      n.data.fixedYaw = 1;
      n.baseSt = CH.DANCE;
      n.st = CH.DANCE;
      const d: Dancer = { npc: n, r: i % 2 === 0 ? 4.6 : 5.1, a: (i / 4) * Math.PI * 2 + 0.4, w: 0.27 };
      this.dancers.push(d);
      this.moveDancer(g, d, 0);
    }
    if (g.counts.length === 1) {
      const du = g.spawnNpc('duchess', 'Düşes Beatrix', 0, 0, 0, 'partner');
      du.data.fixedYaw = 1;
      du.baseSt = CH.DANCE;
      du.st = CH.DANCE;
      this.partner = { npc: du, r: 2.8, a: 2.0, w: 0.3 };
      this.moveDancer(g, this.partner, 0, true);
    }
    const m = g.spawnNpc('maestro', 'Maestro Lorenzo', -7.2, -7.9, 0);
    m.data.fixedYaw = 1;
    const h = g.spawnNpc('host', 'Baron von Altın', 0, -9.5, Math.PI);
    h.data.fixedYaw = 1;
    g.spawnNpc('colonel', 'Albay Kızılcık', -9.0, -3.5, 0.9);
    g.spawnNpc('banker', 'Bankacı Kasa', 9.0, -3.5, -0.9);
    this.announce(g, g.counts.length > 1 ? 'Vals! Birinin eli öbürünün elini tutsun.' : "Vals! Düşes'in elini tut ve onunla dön.", 7);
  }

  private announce(g: Game, text: string, secs: number): void {
    this.bannerText = text;
    this.bannerUntil = g.time + secs;
    g.emit({ k: 'banner', text });
  }

  private moveDancer(g: Game, d: Dancer, dt: number, faceCenter = false): void {
    d.a += d.w * dt;
    const x = Math.cos(d.a) * d.r;
    const z = Math.sin(d.a) * d.r;
    // saat yönünde dönüş: teğet yön = (-sin a, cos a)
    const yaw = faceCenter ? yawTo(x, z, 0, 0) : yawTo(x, z, x - Math.sin(d.a), z + Math.cos(d.a));
    g.npcSys.place(d.npc, x, z, yaw);
  }

  update(g: Game, dt: number): void {
    for (const d of this.dancers) this.moveDancer(g, d, dt);
    if (this.partner) this.moveDancer(g, this.partner, dt, true);
    this.updateLinks(g, dt);
    this.updateProgress(g, dt);
  }

  private updateLinks(g: Game, dt: number): void {
    const stacked = g.counts.filter((c) => c.mode === 'stacked');
    // Kopanları temizle
    this.pairs = this.pairs.filter((p) => {
      const d = dist3(p.a.body.translation(), p.b.body.translation());
      const ok = p.a.input.grip && p.b.input.grip && d < BREAK_DIST && g.counts[p.a.stack]!.mode === 'stacked' && g.counts[p.b.stack]!.mode === 'stacked';
      if (!ok) {
        p.a.link = null;
        p.b.link = null;
        g.emit({ k: 'unlink', a: p.a.id, b: p.b.id });
        if (d >= BREAK_DIST) {
          for (const s of [p.a.stack, p.b.stack]) {
            const c = g.counts[s]!;
            g.addSusp(s, 5, 'eller ayrıldı', c.x, c.z);
          }
          g.log('unlink', p.a.stack, 3);
        }
      }
      return ok;
    });
    this.npcLinks = this.npcLinks.filter((l) => {
      const hp = npcHandPoint(l.npc.x, l.npc.z, l.npc.yaw);
      const d = dist3(l.h.body.translation(), hp);
      const ok = l.h.input.grip && d < BREAK_DIST && g.counts[l.h.stack]!.mode === 'stacked';
      if (!ok) {
        l.h.linkNpc = null;
        g.emit({ k: 'unlink', a: l.h.id, b: l.npc.id });
        if (d >= BREAK_DIST) g.addSusp(l.h.stack, 5, 'Düşes\'in elini bıraktı', l.npc.x, l.npc.z);
      }
      return ok;
    });
    // Yeni bağlar
    if (stacked.length === 2) {
      for (const ha of stacked[0]!.hands) {
        if (ha.link || !ha.input.grip) continue;
        for (const hb of stacked[1]!.hands) {
          if (hb.link || !hb.input.grip) continue;
          if (dist3(ha.body.translation(), hb.body.translation()) < LINK_DIST) {
            ha.link = hb;
            hb.link = ha;
            this.pairs.push({ a: ha, b: hb });
            g.emit({ k: 'link', a: ha.id, b: hb.id });
            break;
          }
        }
      }
    } else if (stacked.length === 1 && this.partner) {
      const du = this.partner.npc;
      const hp = npcHandPoint(du.x, du.z, du.yaw);
      for (const h of stacked[0]!.hands) {
        if (h.linkNpc || !h.input.grip || this.npcLinks.length > 0) continue;
        if (dist3(h.body.translation(), hp) < LINK_DIST + 0.1) {
          h.linkNpc = du;
          this.npcLinks.push({ h, npc: du });
          g.emit({ k: 'link', a: h.id, b: du.id });
        }
      }
    }
    // Yay kuvveti: kenetli ellere birbirine doğru çekme
    for (const p of this.pairs) {
      const a = p.a.body.translation();
      const b = p.b.body.translation();
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const f = Math.min(170, 130 * Math.max(0, d - 0.2));
      const ix = (dx / d) * f * dt;
      const iy = (dy / d) * f * dt;
      const iz = (dz / d) * f * dt;
      p.a.body.applyImpulse({ x: ix, y: iy, z: iz }, true);
      p.b.body.applyImpulse({ x: -ix, y: -iy, z: -iz }, true);
    }
    for (const l of this.npcLinks) {
      const a = l.h.body.translation();
      const hp = npcHandPoint(l.npc.x, l.npc.z, l.npc.yaw);
      const dx = hp.x - a.x;
      const dy = hp.y - a.y;
      const dz = hp.z - a.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const f = Math.min(150, 140 * Math.max(0, d - 0.05));
      l.h.body.applyImpulse({ x: (dx / d) * f * dt, y: (dy / d) * f * dt, z: (dz / d) * f * dt }, true);
    }
  }

  private linked(): boolean {
    return this.pairs.length > 0 || this.npcLinks.length > 0;
  }

  private updateProgress(g: Game, dt: number): void {
    if (this.done) return;
    const stacked = g.counts.filter((c) => c.mode === 'stacked');
    let mx: number | null = null;
    let mz: number | null = null;
    if (stacked.length === 2 && this.pairs.length > 0) {
      mx = (stacked[0]!.x + stacked[1]!.x) / 2;
      mz = (stacked[0]!.z + stacked[1]!.z) / 2;
    } else if (stacked.length === 1 && this.partner && this.npcLinks.length > 0) {
      mx = (stacked[0]!.x + this.partner.npc.x) / 2;
      mz = (stacked[0]!.z + this.partner.npc.z) / 2;
    }
    if (mx === null || mz === null) {
      this.phiPrev = null;
      return;
    }
    this.linkedTime += dt;
    const phi = Math.atan2(mz, mx);
    const r = Math.hypot(mx, mz);
    if (this.phiPrev !== null && r > 0.6 && r < 4.3) {
      const dphi = angDiff(phi, this.phiPrev);
      if (Math.abs(dphi) < 0.4) this.sweep = Math.max(0, this.sweep + dphi);
    }
    this.phiPrev = phi;
    if (this.sweep >= TARGET) {
      this.done = true;
      for (const c of g.counts) {
        c.score += 160;
        g.emit({ k: 'obj', stack: c.stack, id: 'laps', done: 1 });
        g.addSusp(c.stack, -25, 'vals tamam', c.x, c.z, true);
      }
      g.emit({ k: 'toast', x: 0, y: 2.5, z: 0 });
      g.log('waltzDone', 0, 8);
    }
  }

  objectives(g: Game, stack: number): Objective[] {
    void stack;
    const pct = Math.min(100, Math.round((this.sweep / TARGET) * 100));
    return [
      { id: 'link', text: g.counts.length > 1 ? 'Eller kenetlensin (sol tık basılı tut)' : "Düşes'in elini tut", done: this.linkedTime > 4, prog: this.linked() ? 'kenetli' : 'serbest' },
      { id: 'laps', text: `Pistte ${LAPS} tur dön`, done: this.done, prog: `%${pct}` },
    ];
  }

  banner(g: Game): string | undefined {
    return g.time < this.bannerUntil ? this.bannerText : undefined;
  }

  outcome(g: Game): SceneOutcome | null {
    if (!this.done) {
      if (g.counts.every((c) => c.mode === 'failed')) return { perStack: g.counts.map(() => false), lines: ['Vals yarıda kaldı.'] };
      return null;
    }
    return {
      perStack: g.counts.map((c) => c.mode !== 'failed'),
      lines: [`Vals tamamlandı! Eller ${Math.round(this.linkedTime)} saniye kenetli kaldı.`],
    };
  }
}

export { dist2 };
