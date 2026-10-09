// Kont sistemi: bacaklar (hareket), kafa (bakış/ağız), eller (fizik, tutma, tokat).

import { COUNT, NPC_DIM } from '../shared/constants';
import {
  angDiff,
  approach,
  clamp,
  dist2,
  dist3,
  fwdX,
  fwdZ,
  qAxisAngle,
  qErrorVec,
  qMul,
  qYaw,
  rightX,
  rightZ,
  wrapPi,
  type Quat,
  type V3,
} from '../shared/math';
import { headPosOf, mouthPosOf, shoulderOf } from '../shared/body';
import { propRadius, type PropKind } from '../shared/props';
import { CF } from '../shared/protocol';
import type { CountRt, HandRt, PropRt } from './entities';
import type { Game } from './game';
import { propGroups } from './game';

export class CountSystem {
  constructor(private g: Game) {}

  // ------------------------------------------------------------ konumlar

  headPos(c: CountRt): V3 {
    return headPosOf(c.x, c.z, c.yaw, c.bow);
  }

  mouthPos(c: CountRt): V3 {
    return mouthPosOf(c.x, c.z, c.yaw, c.bow, c.headYaw, c.headPitch);
  }

  shoulder(c: CountRt, side: 0 | 1): V3 {
    return shoulderOf(c.x, c.z, c.yaw, c.bow, side);
  }

  // ------------------------------------------------------------ adım

  update(dt: number): void {
    const held = new Set<PropRt>();
    for (const c of this.g.counts) {
      if (c.mode !== 'stacked') continue;
      this.updateBody(c, dt);
      this.updateHead(c, dt);
      for (const h of c.hands) {
        this.updateHand(c, h, dt);
        if (h.held) held.add(h.held);
      }
    }
    for (const p of held) this.driveHeld(p);
  }

  /** Dünya adımından sonra: el hızları, tokat/yüz/çarpışma algısı. */
  post(dt: number): void {
    for (const c of this.g.counts) {
      if (c.mode !== 'stacked') continue;
      for (const h of c.hands) {
        const v = h.body.linvel();
        h.vel = { x: v.x, y: v.y, z: v.z };
        if (h.slapCd > 0) h.slapCd -= dt;
        if (h.faceCd > 0) h.faceCd -= dt;
        this.detectSlap(c, h);
        this.detectFace(c, h);
      }
      this.detectBumps(c);
    }
  }

  private updateBody(c: CountRt, dt: number): void {
    const t = this.g.tuning;
    // dönüş
    if (c.input.yaw !== null) {
      const d = angDiff(c.input.yaw, c.yaw);
      const maxTurn = t.turnRate * dt;
      c.yaw = wrapPi(c.yaw + clamp(d, -maxTurn, maxTurn));
    }
    // reverans
    if (c.input.bow && !c.prevBowKey && c.bowT < 0) c.bowT = 0;
    c.prevBowKey = c.input.bow;
    if (c.bowT >= 0) {
      c.bowT += dt;
      const T = c.bowT;
      let b = 0;
      if (T < 0.35) b = T / 0.35;
      else if (T < 0.95) b = 1;
      else if (T < 1.45) b = 1 - (T - 0.95) / 0.5;
      if (T >= 1.45) c.bowT = -1;
      c.bow = b * b * (3 - 2 * b);
    } else {
      c.bow = 0;
    }
    // hareket
    let mx = clamp(c.input.mx, -1, 1);
    let mz = clamp(c.input.mz, -1, 1);
    const l = Math.hypot(mx, mz);
    if (l > 1) {
      mx /= l;
      mz /= l;
    }
    const speed = (c.input.run ? t.runSpeed : t.walkSpeed) * (c.bow > 0.1 ? 0.45 : 1);
    const wantVx = (rightX(c.yaw) * mx + fwdX(c.yaw) * mz) * speed;
    const wantVz = (rightZ(c.yaw) * mx + fwdZ(c.yaw) * mz) * speed;
    const dvx = wantVx - c.vx;
    const dvz = wantVz - c.vz;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = t.accel * dt * (l < 0.01 ? 1.4 : 1);
    if (dl > maxDv) {
      c.vx += (dvx / dl) * maxDv;
      c.vz += (dvz / dl) * maxDv;
    } else {
      c.vx = wantVx;
      c.vz = wantVz;
    }
    c.cc.computeColliderMovement(c.collider, { x: c.vx * dt, y: 0, z: c.vz * dt }, undefined, c.filterGroups);
    const mv = c.cc.computedMovement();
    const px = c.x;
    const pz = c.z;
    c.x += mv.x;
    c.z += mv.z;
    const b = this.g.level.bounds;
    c.x = clamp(c.x, b.minX + 0.6, b.maxX - 0.6);
    c.z = clamp(c.z, b.minZ + 0.6, b.maxZ - 0.6);
    // gerçekleşen hız (engele çarpınca düşer)
    const rvx = (c.x - px) / dt;
    const rvz = (c.z - pz) / dt;
    c.ax = (rvx - c.vx) / dt;
    c.az = (rvz - c.vz) / dt;
    c.vx = rvx;
    c.vz = rvz;
    c.body.setNextKinematicTranslation({ x: c.x, y: COUNT.height / 2, z: c.z });
    // sallanma (görsel + el hedefi bobu)
    const sp = Math.hypot(c.vx, c.vz);
    const target = clamp(sp / 3.2 + Math.hypot(wantVx - c.vx, wantVz - c.vz) * 0.08, 0, 1);
    c.sway += (target - c.sway) * Math.min(1, dt * 5);
    c.phase += sp * dt * 2.1;
    if (sp > t.walkSpeed * 1.4 && this.g.hasWitness(c.x, c.z)) {
      // koşmak, kibar toplumda hoş karşılanmaz
      this.g.addSusp(c.stack, 2.2 * dt * 10 * 0.1, 'koşuyor', c.x, c.z);
    }
  }

  private updateHead(c: CountRt, dt: number): void {
    const k = Math.min(1, dt * 14);
    c.headYaw += (c.input.hyaw - c.headYaw) * k;
    c.headPitch += (c.input.hpitch - c.headPitch) * k;
    if (c.chew > 0) {
      c.chew -= dt;
      c.mouth = 0.22 + 0.2 * Math.sin(this.g.time * 17);
    } else {
      const want = c.input.mouth ? 1 : 0;
      c.mouth = approach(c.mouth, want, dt * (want > c.mouth ? 7 : 9));
    }
  }

  private updateHand(c: CountRt, h: HandRt, dt: number): void {
    const t = this.g.tuning;
    const sh = this.shoulder(c, h.side);
    const inp = h.input;
    // Tokat başlat
    if (inp.slap && h.slapCd <= 0 && h.slapT <= 0) {
      h.slapT = 0.28;
      h.slapCd = 1.1;
      h.slapHit = false;
      c.stats.slaps++;
      this.g.emit({ k: 'slap', stack: c.stack, hand: h.side });
    }
    // Hedef (omuza göre yerel -> dünya)
    let lx = inp.x;
    let ly = inp.y;
    let lf = inp.f;
    if (h.slapT > 0) {
      h.slapT -= dt;
      lx = h.side === 0 ? -0.25 : 0.25;
      ly = 0.05;
      lf = t.handReach;
    }
    // omuzdan en fazla `handReach` uzağa
    const len = Math.hypot(lx, ly, lf);
    if (len > t.handReach) {
      const s = t.handReach / len;
      lx *= s;
      ly *= s;
      lf *= s;
    }
    // yürürken el bobu
    const bob = 0.03 * c.sway * (t.swayAccel / 3.2);
    lx += Math.sin(c.phase) * bob;
    ly += Math.abs(Math.cos(c.phase)) * bob * 0.6;
    let tx = sh.x + rightX(c.yaw) * lx + fwdX(c.yaw) * lf;
    let ty = sh.y + ly;
    let tz = sh.z + rightZ(c.yaw) * lx + fwdZ(c.yaw) * lf;
    // Ağıza çekim yardımı
    if (h.held && c.mouth > 0.35 && t.assist > 0 && this.isFeedable(h.held)) {
      const cp = this.g.propSys.consumePoint(h.held);
      const mp = this.mouthPos(c);
      const d = dist3(cp, mp);
      const R = 0.95;
      if (d < R) {
        const w = clamp((1 - d / R) * t.assist * 1.6, 0, 0.92);
        tx += (mp.x - cp.x) * w;
        ty += (mp.y - cp.y) * w;
        tz += (mp.z - cp.z) * w;
      }
    }
    // PD kuvveti
    const pos = h.body.translation();
    const vel = h.body.linvel();
    const slap = h.slapT > 0;
    const kp = t.handKp * (slap ? 3 : 1);
    const kd = t.handKd * (slap ? 1.4 : 1);
    const maxF = t.handMaxForce * (slap ? 2.6 : 1);
    let fx = kp * (tx - pos.x) - kd * vel.x;
    let fy = kp * (ty - pos.y) - kd * vel.y;
    let fz = kp * (tz - pos.z) - kd * vel.z;
    const fl = Math.hypot(fx, fy, fz);
    if (fl > maxF) {
      const s = maxF / fl;
      fx *= s;
      fy *= s;
      fz *= s;
    }
    h.body.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
    // Omuzdan çok uzaklaştıysa ışınla (fizik sıkışması)
    const far = dist3(pos, sh);
    if (far > t.handReach + 1.2) {
      h.body.setTranslation({ x: tx, y: ty, z: tz }, true);
      h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    // Tutma
    if (inp.grip && !h.prevGrip && !h.held) this.tryGrab(c, h);
    if (!inp.grip && h.held) this.release(h);
    h.prevGrip = inp.grip;
    if (h.held && dist3(pos, h.held.body.translation()) > 1.6) this.release(h);
  }

  isFeedable(p: PropRt): boolean {
    const k = p.kind;
    if (k.food) return true;
    if (k.container && !k.container.reservoir && p.load > 0.05) return true;
    return false;
  }

  // ------------------------------------------------------------ tutma

  tryGrab(c: CountRt, h: HandRt): void {
    const hp = h.body.translation();
    let best: PropRt | null = null;
    let bd = this.g.tuning.grabRadius;
    for (const p of this.g.props.values()) {
      if (!p.kind.grab || p.consumed) continue;
      if (p.holders.length >= 2) continue;
      if (p.holders.length === 1 && p.holders[0]!.stack !== c.stack) continue;
      const d = dist3(hp, p.body.translation()) - propRadius(p.kind);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) return;
    this.attach(c, h, best);
  }

  attach(c: CountRt, h: HandRt, p: PropRt): void {
    h.held = p;
    p.holders.push(h);
    p.lastStack = c.stack;
    p.lastTouch = this.g.time;
    p.collider.setCollisionGroups(propGroups(p.kind.kind, c.stack));
    p.body.wakeUp();
    this.g.emit({ k: 'grab', stack: c.stack, hand: h.side, kind: p.kind.kind, id: p.id });
  }

  release(h: HandRt): void {
    const p = h.held;
    if (!p) return;
    h.held = null;
    p.holders = p.holders.filter((x) => x !== h);
    p.lastTouch = this.g.time;
    if (p.holders.length === 0) {
      p.collider.setCollisionGroups(propGroups(p.kind.kind, -1));
      const v = h.vel;
      const sp = Math.hypot(v.x, v.y, v.z);
      const s = sp > 9 ? 9 / sp : 1;
      p.body.setLinvel({ x: v.x * s, y: v.y * s, z: v.z * s }, true);
      p.body.wakeUp();
    }
    this.g.emit({ k: 'drop', stack: h.stack, hand: h.side, kind: p.kind.kind, id: p.id });
  }

  private orient(k: PropKind, yaw: number, roll: number): Quat {
    const base = qYaw(yaw);
    if (k.hold.mode === 'spoon') return qMul(base, qAxisAngle(1, 0, 0, k.hold.pitch ?? 0.2));
    if (k.hold.mode === 'upright') return roll === 0 ? base : qMul(base, qAxisAngle(0, 0, -1, roll));
    return base;
  }

  /** Tutulan eşyayı elin hedefine süren hız/dönüş denetimi. */
  private driveHeld(p: PropRt): void {
    const hs = p.holders;
    if (hs.length === 0) return;
    const c = this.g.counts[hs[0]!.stack]!;
    const yaw = c.yaw;
    const k = p.kind;
    let tx: number;
    let ty: number;
    let tz: number;
    let roll = 0;
    if (hs.length === 1) {
      const hp = hs[0]!.body.translation();
      tx = hp.x + fwdX(yaw) * k.hold.fwd;
      ty = hp.y + k.hold.up;
      tz = hp.z + fwdZ(yaw) * k.hold.fwd;
    } else {
      const a = hs[0]!.body.translation();
      const b = hs[1]!.body.translation();
      tx = (a.x + b.x) / 2 + fwdX(yaw) * k.hold.fwd * 0.5;
      ty = (a.y + b.y) / 2 + k.hold.up;
      tz = (a.z + b.z) / 2 + fwdZ(yaw) * k.hold.fwd * 0.5;
      // sol-sağ el yüksekliği farkı eşyayı yatırır
      const left = hs[0]!.side === 0 ? a : b;
      const right = hs[0]!.side === 0 ? b : a;
      const sep = Math.max(0.2, Math.abs((right.x - left.x) * rightX(yaw) + (right.z - left.z) * rightZ(yaw)));
      roll = Math.atan2(right.y - left.y, sep);
    }
    const pos = p.body.translation();
    const heavy = clamp(1.6 - k.mass * 0.07, 0.12, 1);
    const maxSpeed = this.g.tuning.holdSpeed * heavy;
    let vx = (tx - pos.x) * 18;
    let vy = (ty - pos.y) * 18;
    let vz = (tz - pos.z) * 18;
    const sp = Math.hypot(vx, vy, vz);
    if (sp > maxSpeed) {
      const s = maxSpeed / sp;
      vx *= s;
      vy *= s;
      vz *= s;
    }
    p.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    const e = qErrorVec(p.body.rotation(), this.orient(k, yaw, roll));
    const wmax = 14;
    p.body.setAngvel({ x: clamp(e.x * 14, -wmax, wmax), y: clamp(e.y * 14, -wmax, wmax), z: clamp(e.z * 14, -wmax, wmax) }, true);
  }

  // ------------------------------------------------------------ algı

  private detectSlap(c: CountRt, h: HandRt): void {
    if (h.slapT <= 0 || h.slapHit) return;
    const hp = h.body.translation();
    for (const n of this.g.npcs.values()) {
      if (dist2(hp.x, hp.z, n.x, n.z) < NPC_DIM.radius + 0.28 && hp.y > 0.2 && hp.y < NPC_DIM.height + 0.1) {
        h.slapHit = true;
        this.g.npcSys.hit(n, c, h);
        return;
      }
    }
  }

  private detectFace(c: CountRt, h: HandRt): void {
    if (h.faceCd > 0) return;
    const hp = h.body.translation();
    for (const n of this.g.npcs.values()) {
      if (n.tag === 'partner') continue; // vals eşine dokunmak serbest
      if (dist3(hp, { x: n.x, y: 1.62, z: n.z }) < 0.42) {
        h.faceCd = 2.5;
        if (h.slapT > 0) return; // tokat zaten ayrıca ele alınıyor
        this.g.addSusp(c.stack, 12, `${n.name} yüzüne dokunuldu`, n.x, n.z);
        this.g.npcSys.react(n, 'shock', 'bump', c.stack);
        this.g.log('face', c.stack, 6, { a: n.name });
        return;
      }
    }
  }

  private detectBumps(c: CountRt): void {
    const sp = Math.hypot(c.vx, c.vz);
    for (const n of this.g.npcs.values()) {
      if (n.tag === 'partner') continue; // vals eşi: çarpışma cezası yok
      const d = dist2(c.x, c.z, n.x, n.z);
      if (d < COUNT.radius + NPC_DIM.radius + 0.08 && n.bumpCd <= 0) {
        if (sp > 0.5 || c.sway > 0.5) {
          n.bumpCd = 1.4;
          c.stats.bumps++;
          this.g.addSusp(c.stack, 6, `${n.name} ile çarpıştı`, n.x, n.z);
          this.g.npcSys.react(n, 'shock', 'bump', c.stack);
          this.g.log('bump', c.stack, 3, { a: n.name });
        }
      }
    }
  }
}

export { CF };
