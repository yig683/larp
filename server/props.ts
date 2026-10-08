// Eşya sistemi: sıvı sallanması/dökülmesi, kaşıkla alma, ağızla yeme, çarpma sesleri ve kırılma.

import { COUNT, G, NPC_DIM, groups } from '../shared/constants';
import { clamp, dist2, dist3, qRotate, type V3 } from '../shared/math';
import { CH } from '../shared/protocol';
import { sloshMag, spillAmount, stepSlosh } from '../shared/slosh';
import type { CountRt, PropRt } from './entities';
import type { Game } from './game';
import { RAPIER } from './rapier';

export class PropSystem {
  constructor(private g: Game) {}

  // ------------------------------------------------------------ geometri

  private world(p: PropRt, local: V3): V3 {
    const t = p.body.translation();
    const r = qRotate(p.body.rotation(), local);
    return { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
  }

  /** Kaşık ucu (yerel ipucu), kadeh için ağız kenarı, diğerleri için merkez. */
  tipWorld(p: PropRt): V3 {
    const tip = p.kind.tip;
    if (tip) return this.world(p, { x: tip[0], y: tip[1], z: tip[2] });
    return this.world(p, { x: 0, y: 0, z: 0 });
  }

  consumePoint(p: PropRt): V3 {
    if (p.kind.tip) return this.tipWorld(p);
    if (p.kind.container && !p.kind.container.reservoir) return this.world(p, { x: 0, y: p.kind.dim[0]! * 0.9, z: 0 });
    return this.world(p, { x: 0, y: 0, z: 0 });
  }

  // ------------------------------------------------------------ adım

  update(dt: number): void {
    const props = Array.from(this.g.props.values());
    for (const p of props) {
      if (!this.g.props.has(p.id)) continue;
      this.trackMotion(p, dt);
      if (!this.g.props.has(p.id)) continue; // kırıldı
      if (p.kind.container) this.updateContainer(p, dt);
      const t = p.body.translation();
      if (t.y < -3 || Math.abs(t.x) > 22 || Math.abs(t.z) > 16) this.respawn(p);
    }
    this.scoop(dt);
    for (const c of this.g.counts) if (c.mode === 'stacked') this.feed(c, dt);
  }

  private respawn(p: PropRt): void {
    if (p.holders.length > 0) return;
    p.body.setTranslation({ x: p.spawn.x, y: p.spawn.y + 0.05, z: p.spawn.z }, true);
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  private trackMotion(p: PropRt, dt: number): void {
    const v = p.body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    const ax = clamp((v.x - p.pvx) / dt, -40, 40);
    const az = clamp((v.z - p.pvz) / dt, -40, 40);
    const k = Math.min(1, dt * 18);
    p.asx += (ax - p.asx) * k;
    p.asz += (az - p.asz) * k;
    p.pvx = v.x;
    p.pvz = v.z;
    if (p.noiseCd > 0) p.noiseCd -= dt;
    if (p.holders.length === 0 && p.noiseCd <= 0 && p.speedPrev > 2.4 && speed < p.speedPrev * 0.45) this.impact(p, p.speedPrev);
    p.speedPrev = speed;
  }

  private responsible(p: PropRt): CountRt | null {
    let best: CountRt | null = null;
    let bd = 3.5;
    for (const c of this.g.counts) {
      if (c.mode !== 'stacked') continue;
      const t = p.body.translation();
      const d = dist2(c.x, c.z, t.x, t.z);
      if (p.lastStack === c.stack && this.g.time - p.lastTouch < 6) return c;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private impact(p: PropRt, mag: number): void {
    p.noiseCd = 0.5;
    const t = p.body.translation();
    const who = this.responsible(p);
    const breaks = !!p.kind.fragile && p.kind.kind !== 'bowl' && mag > 4.6;
    this.g.emit({ k: 'crash', x: t.x, y: t.y, z: t.z, mag: Math.round(mag * 10) / 10, kind: p.kind.kind, broke: breaks ? 1 : 0 });
    if (who) {
      who.stats.crashes++;
      const amount = (breaks ? 10 : mag > 3.5 ? 6 : 3) * (p.kind.mass > 5 ? 1.4 : 1);
      this.g.addSusp(who.stack, amount, breaks ? 'bir şey kırıldı' : 'gürültü çıkardı', t.x, t.z);
      const n = this.g.nearestNpc(t.x, t.z, 9);
      if (n && n.st === CH.IDLE) this.g.npcSys.react(n, 'shock', 'crash', who.stack);
      this.g.log(breaks ? 'shatter' : 'crash', who.stack, breaks ? 5 : 2, { a: p.kind.kind });
    }
    if (breaks) {
      if (p.kind.container && p.load > 0.05) this.spill(p, p.load, true);
      this.g.removeProp(p);
    }
  }

  // ------------------------------------------------------------ sıvı

  private updateContainer(p: PropRt, dt: number): void {
    const cdef = p.kind.container!;
    const t = this.g.tuning;
    stepSlosh(p.slosh, p.asx, p.asz, dt, { omega: t.sloshOmega, zeta: t.sloshZeta, gain: t.sloshGain });
    const up = qRotate(p.body.rotation(), { x: 0, y: 1, z: 0 });
    const tilt = Math.acos(clamp(up.y, -1, 1));
    const baseTilt = p.holders.length > 0 ? (p.kind.hold.pitch ?? 0) : 0;
    const eff = Math.max(0, tilt - baseTilt - 0.12) + sloshMag(p.slosh);
    // Şiddetli sallanınca sıvı eğimden bağımsız dışarı fırlar
    const fling = Math.max(0, Math.hypot(p.asx, p.asz) - t.flingAccel) * t.flingRate * dt;
    if (p.load > 0.001 && (eff > t.spillThreshold || fling > 0)) {
      let amt = (spillAmount(eff, t.spillThreshold, t.spillRate, dt) + fling) * (cdef.cap > 1 ? 2.5 : 1);
      amt = Math.min(amt, p.load);
      p.load -= amt;
      p.spillAcc += amt;
      const chunk = cdef.cap > 1 ? 0.4 : 0.12;
      if (p.spillAcc >= chunk) {
        this.spill(p, p.spillAcc, false);
        p.spillAcc = 0;
      }
    } else if (p.spillAcc > 0 && eff < t.spillThreshold * 0.5) {
      p.spillAcc = 0;
    }
  }

  /** Dökülen sıvının indiği yeri bul: Kont paltosu, NPC, masa veya zemin. */
  private spill(p: PropRt, amount: number, shattered: boolean): void {
    const t = p.body.translation();
    const m = sloshMag(p.slosh) || 1;
    const x = t.x + (p.slosh.x / m) * 0.13;
    const z = t.z + (p.slosh.z / m) * 0.13;
    const y = t.y + 0.06;
    const liquid = p.kind.container!.liquid;
    const who = this.responsible(p);
    let onto: 'floor' | 'table' | 'coat' | 'npc' = 'floor';
    let npcId = 0;
    let ownerStack = -1;
    let ly = 0;

    // 1) Bir Kont'un paltosuna mı düştü?
    for (const c of this.g.counts) {
      if (c.mode !== 'stacked') continue;
      if (dist2(c.x, c.z, x, z) < COUNT.radius + 0.08 && y > 0.25 && y < 2.55) {
        onto = 'coat';
        ownerStack = c.stack;
        ly = y;
        c.stain = Math.min(255, c.stain + Math.ceil(amount * 12));
        break;
      }
    }
    // 2) Bir NPC'ye mi?
    if (onto === 'floor') {
      for (const n of this.g.npcs.values()) {
        if (dist2(n.x, n.z, x, z) < NPC_DIM.radius + 0.1 && y > 0.25 && y < NPC_DIM.height) {
          onto = 'npc';
          npcId = n.id;
          ly = Math.min(y, 1.5);
          break;
        }
      }
    }
    // 3) Aşağıda ne var (masa/zemin)
    if (onto === 'floor') {
      const hit = this.g.world.castRay(new RAPIER.Ray({ x, y, z }, { x: 0, y: -1, z: 0 }), 8, true, undefined, groups(0xffff, G.STATIC));
      ly = hit ? y - hit.timeOfImpact + 0.01 : 0.01;
      if (ly > 0.5) onto = 'table';
    }
    this.g.emit({ k: 'splash', x, y: ly, z, liquid, onto, stack: ownerStack, npc: npcId, amt: Math.round(amount * 100) / 100, shatter: shattered ? 1 : 0 });

    if (!who) return;
    who.stats.spills++;
    if (onto === 'npc') {
      const n = this.g.npcs.get(npcId)!;
      who.stats.spilledOnNpc++;
      this.g.addSusp(who.stack, 22, `${n.name} üzerine döktü`, n.x, n.z, true);
      this.g.npcSys.react(n, 'angry', 'spill', who.stack);
      this.g.log('spillNpc', who.stack, 9, { a: n.name, b: liquid });
    } else if (onto === 'coat') {
      const c = this.g.counts[ownerStack]!;
      this.g.addSusp(c.stack, 3, 'kendi paltosuna döktü', c.x, c.z);
      this.g.log('stain', c.stack, 2, { b: liquid });
    } else if (amount >= 0.25) {
      this.g.addSusp(who.stack, amount >= 0.8 ? 6 : 3, 'yere döktü', x, z);
      this.g.log('spillFloor', who.stack, 2, { b: liquid });
    }
  }

  // ------------------------------------------------------------ kaşıkla alma

  private scoop(dt: number): void {
    const t = this.g.tuning;
    const bowls: PropRt[] = [];
    for (const p of this.g.props.values()) if (p.kind.container?.reservoir && p.load > 0.01) bowls.push(p);
    if (bowls.length === 0) return;
    for (const sp of this.g.props.values()) {
      const cd = sp.kind.container;
      if (!cd || !cd.scoop || sp.load >= cd.cap - 0.001) continue;
      const tip = this.tipWorld(sp);
      const up = qRotate(sp.body.rotation(), { x: 0, y: 1, z: 0 });
      if (up.y < 0.7 || sloshMag(sp.slosh) > 0.4) continue;
      for (const b of bowls) {
        const bp = b.body.translation();
        if (Math.hypot(tip.x - bp.x, tip.z - bp.z) > 0.17) continue;
        if (tip.y > bp.y + 0.04 || tip.y < bp.y - 0.05) continue;
        const take = Math.min(t.scoopRate * dt, cd.cap - sp.load, b.load);
        const before = sp.load;
        sp.load += take;
        b.load -= take;
        if (Math.floor(before * 4) !== Math.floor(sp.load * 4)) {
          const c = this.g.counts[sp.holders[0]?.stack ?? 0];
          this.g.emit({ k: 'scoop', stack: c?.stack ?? 0 });
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------ yeme

  private feed(c: CountRt, dt: number): void {
    if (c.mouth < 0.6) return;
    const mp = this.g.countSys.mouthPos(c);
    const r = this.g.tuning.mouthRadius;
    for (const p of Array.from(this.g.props.values())) {
      if (p.consumed) continue;
      const k = p.kind;
      const food = k.food;
      const cd = k.container;
      if (!food && !(cd && !cd.reservoir)) continue;
      const d = dist3(this.consumePoint(p), mp);
      if (d > r) continue;
      if (cd?.scoop) {
        if (p.load < 0.08) continue;
        const amt = p.load;
        p.load = 0;
        c.stats.soup += amt;
        c.chew = 0.7;
        this.g.emit({ k: 'eat', stack: c.stack, what: 'soup', amt: Math.round(amt * 100) / 100 });
        this.g.log('eatSoup', c.stack, 1);
        return;
      }
      if (cd && !cd.reservoir) {
        if (p.load < 0.02) continue;
        const amt = Math.min(p.load, 0.9 * dt);
        p.load -= amt;
        c.stats.wine += amt;
        if (Math.floor(c.stats.wine * 5) !== Math.floor((c.stats.wine - amt) * 5)) this.g.emit({ k: 'eat', stack: c.stack, what: 'wine', amt: Math.round(amt * 100) / 100 });
        continue;
      }
      if (food) {
        c.chew = 2.4;
        if (food.what === 'bread') c.stats.bread++;
        else c.stats.apple++;
        this.g.emit({ k: 'eat', stack: c.stack, what: food.what, amt: 1 });
        this.g.log('eat' + food.what, c.stack, 1);
        p.consumed = true;
        this.g.removeProp(p);
        return;
      }
    }
  }
}

export { CH };
