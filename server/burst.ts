// Palto patlaması: çaylaklar, güvenlik kovalamacası, kurtarma ve yeniden yığılma.

import { COUNT, G, GUARD_DIM, ID, KID, groups } from '../shared/constants';
import { angDiff, clamp, dist2, wrapPi, yawTo } from '../shared/math';
import { CH } from '../shared/protocol';
import type { CountRt, GuardRt, KidRt } from './entities';
import { KidRt as KidCls, GuardRt as GuardCls } from './entities';
import type { Game } from './game';
import { RAPIER } from './rapier';

const GUARD_SPAWNS: Array<[number, number]> = [
  [-3, 9.8],
  [3, 9.8],
  [-13.2, 9.4],
  [13.2, 9.4],
  [-13.2, -9.4],
  [13.2, -9.4],
];
const DOOR: [number, number] = [0, 10.3];
const RESTACK_RADIUS = 1.9;
const CATCH_RADIUS = 0.95;

export class BurstSystem {
  constructor(private g: Game) {}

  // ------------------------------------------------------------ patlama

  burst(c: CountRt): void {
    const g = this.g;
    if (c.mode !== 'stacked') return;
    c.bursts++;
    c.pileX = c.x;
    c.pileZ = c.z;
    c.restack = 0;
    for (const h of c.hands) {
      g.countSys.release(h);
      h.body.setEnabled(false);
    }
    c.body.setEnabled(false);
    c.input.mx = 0;
    c.input.mz = 0;
    c.input.mouth = false;
    c.mouth = 0;
    g.emit({ k: 'burst', stack: c.stack, x: c.x, z: c.z, n: c.bursts });
    g.log('burst', c.stack, 12, { n: c.bursts });

    const out = c.bursts >= g.tuning.maxBursts;
    g.wheels[c.stack]!.q = null;
    if (out) {
      c.mode = 'failed';
      g.emit({ k: 'banner', text: `${g.stackName(c.stack)} tamamen rezil oldu!`, stack: c.stack });
      g.log('failedStack', c.stack, 14);
    } else {
      c.mode = 'burst';
      g.emit({ k: 'spawn', def: { id: ID.coatPile(c.stack), type: 'coat', stack: c.stack, x: c.pileX, z: c.pileZ, yaw: c.yaw } });
      // Her oyuncu bir çaylak olur
      const members = Array.from(new Set(c.assign.members));
      members.forEach((pid, i) => {
        const ang = (i / Math.max(1, members.length)) * Math.PI * 2 + g.rng.range(-0.3, 0.3);
        const x = clamp(c.pileX + Math.cos(ang) * 1.25, g.level.bounds.minX + 0.5, g.level.bounds.maxX - 0.5);
        const z = clamp(c.pileZ + Math.sin(ang) * 1.25, g.level.bounds.minZ + 0.5, g.level.bounds.maxZ - 0.5);
        this.spawnKid(c, pid, x, z, yawTo(x, z, c.pileX, c.pileZ));
      });
      this.ensureGuards(c.pileX, c.pileZ);
    }
    // NPC'ler şoka girer, en yakın ikisi bağırır
    const sorted = Array.from(g.npcs.values()).sort((a, b) => dist2(a.x, a.z, c.x, c.z) - dist2(b.x, b.z, c.x, c.z));
    sorted.forEach((n, i) => {
      if (dist2(n.x, n.z, c.x, c.z) < 14) g.npcSys.react(n, 'shock', i < 2 ? 'burst' : undefined, c.stack);
    });
  }

  private spawnKid(c: CountRt, playerId: number, x: number, z: number, yaw: number): KidRt {
    const g = this.g;
    const info = g.players.get(playerId);
    const id = g.newKidId();
    const k = new KidCls(id, playerId, c.stack, info?.name ?? `Oyuncu ${playerId}`, info?.color ?? 0, x, z, yaw);
    k.filterGroups = groups(G.KID, G.STATIC | G.PROP | G.NPC | G.KID | G.GUARD);
    k.body = g.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, KID.height / 2, z));
    const half = (KID.height - 2 * KID.radius) / 2;
    k.collider = g.world.createCollider(RAPIER.ColliderDesc.capsule(half, KID.radius).setCollisionGroups(k.filterGroups).setFriction(0.2), k.body);
    k.cc = g.world.createCharacterController(0.02);
    k.cc.setUp({ x: 0, y: 1, z: 0 });
    k.cc.setSlideEnabled(true);
    k.cc.setApplyImpulsesToDynamicBodies(true);
    k.cc.setCharacterMass(25);
    g.kids.set(id, k);
    g.emit({ k: 'spawn', def: { id, type: 'kid', stack: c.stack, player: playerId, name: k.name, color: k.color, x, z, yaw } });
    return k;
  }

  removeKid(k: KidRt): void {
    this.g.world.removeRigidBody(k.body);
    this.g.kids.delete(k.id);
    this.g.emit({ k: 'despawn', id: k.id });
  }

  /** Oyuncu ayrıldı: çaylağı varsa kaldır. */
  dropPlayer(playerId: number): void {
    for (const k of Array.from(this.g.kids.values())) if (k.playerId === playerId) this.removeKid(k);
  }

  private ensureGuards(px: number, pz: number): void {
    const g = this.g;
    const want = Math.round(g.tuning.guardCount);
    const have = Array.from(g.guards.values()).filter((x) => x.leaving <= 0).length;
    // Patlama noktasından en uzak kapı/köşe girişleri tercih edilir
    const spots = GUARD_SPAWNS.slice().sort((a, b) => dist2(b[0], b[1], px, pz) - dist2(a[0], a[1], px, pz));
    for (let i = have; i < want; i++) {
      const sp = spots[i % spots.length]!;
      this.spawnGuard(sp[0], sp[1]);
    }
    for (const gd of g.guards.values()) gd.leaving = 0;
  }

  private spawnGuard(x: number, z: number): GuardRt {
    const g = this.g;
    const id = g.newGuardId();
    const gd = new GuardCls(id, x, z);
    gd.filterGroups = groups(G.GUARD, G.STATIC | G.PROP | G.NPC | G.KID | G.GUARD | G.COUNT0 | G.COUNT1);
    gd.body = g.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, GUARD_DIM.height / 2, z));
    const half = (GUARD_DIM.height - 2 * GUARD_DIM.radius) / 2;
    gd.collider = g.world.createCollider(RAPIER.ColliderDesc.capsule(half, GUARD_DIM.radius).setCollisionGroups(gd.filterGroups).setFriction(0.2), gd.body);
    gd.cc = g.world.createCharacterController(0.02);
    gd.cc.setUp({ x: 0, y: 1, z: 0 });
    gd.cc.setSlideEnabled(true);
    gd.cc.setApplyImpulsesToDynamicBodies(true);
    gd.cc.setCharacterMass(90);
    g.guards.set(id, gd);
    g.emit({ k: 'spawn', def: { id, type: 'guard', x, z, yaw: 0 } });
    return gd;
  }

  private removeGuard(gd: GuardRt): void {
    this.g.world.removeRigidBody(gd.body);
    this.g.guards.delete(gd.id);
    this.g.emit({ k: 'despawn', id: gd.id });
  }

  // ------------------------------------------------------------ adım

  /** Dünya adımından önce: çaylak hareketi (oyuncu girdisi). */
  preStep(dt: number): void {
    const g = this.g;
    const t = g.tuning;
    for (const k of g.kids.values()) {
      if (k.caughtUntil > g.time) {
        k.st = CH.CAUGHT;
        k.vx = k.vz = 0;
        k.body.setNextKinematicTranslation({ x: k.x, y: KID.height / 2, z: k.z });
        continue;
      }
      if (k.caughtUntil > 0) {
        k.caughtUntil = 0;
        k.rescue = 0;
        g.emit({ k: 'released', id: k.id, stack: k.stack });
      }
      if (k.wantYaw !== null) k.yaw = wrapPi(k.wantYaw);
      let mx = clamp(k.mx, -1, 1);
      let mz = clamp(k.mz, -1, 1);
      const l = Math.hypot(mx, mz);
      if (l > 1) {
        mx /= l;
        mz /= l;
      }
      const sp = k.run ? t.kidRunSpeed : t.kidSpeed;
      const wx = (Math.cos(k.yaw) * mx - Math.sin(k.yaw) * mz) * sp;
      const wz = (-Math.sin(k.yaw) * mx - Math.cos(k.yaw) * mz) * sp;
      k.vx += (wx - k.vx) * Math.min(1, dt * 12);
      k.vz += (wz - k.vz) * Math.min(1, dt * 12);
      k.cc.computeColliderMovement(k.collider, { x: k.vx * dt, y: 0, z: k.vz * dt }, undefined, k.filterGroups);
      const mv = k.cc.computedMovement();
      k.x = clamp(k.x + mv.x, g.level.bounds.minX + 0.4, g.level.bounds.maxX - 0.4);
      k.z = clamp(k.z + mv.z, g.level.bounds.minZ + 0.4, g.level.bounds.maxZ - 0.4);
      k.body.setNextKinematicTranslation({ x: k.x, y: KID.height / 2, z: k.z });
      const speed = Math.hypot(k.vx, k.vz);
      k.st = speed > 3.2 ? CH.RUN : speed > 0.3 ? CH.WALK : CH.IDLE;
    }
  }

  update(dt: number): void {
    const g = this.g;
    this.updateGuards(dt);
    this.updateRestack(dt);
    // Güvenlik ayrılma zamanı: patlamış yığın kalmadıysa
    const anyBurst = g.counts.some((c) => c.mode === 'burst');
    if (!anyBurst && g.guards.size > 0) {
      for (const gd of g.guards.values()) if (gd.leaving <= 0) gd.leaving = 2.5;
    }
  }

  private nearestFreeKid(x: number, z: number): KidRt | null {
    let best: KidRt | null = null;
    let bd = Infinity;
    for (const k of this.g.kids.values()) {
      if (k.caughtUntil > this.g.time) continue;
      const d = dist2(k.x, k.z, x, z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  private updateGuards(dt: number): void {
    const g = this.g;
    const t = g.tuning;
    for (const gd of Array.from(g.guards.values())) {
      let goalX: number | null = null;
      let goalZ: number | null = null;
      let speed = t.guardSpeed;
      if (gd.leaving > 0) {
        gd.leaving -= dt;
        if (gd.leaving <= 0) gd.leaving = -1;
      }
      if (gd.leaving < 0) {
        goalX = DOOR[0];
        goalZ = DOOR[1];
        speed *= 0.8;
        if (dist2(gd.x, gd.z, DOOR[0], DOOR[1]) < 1.4) {
          this.removeGuard(gd);
          continue;
        }
      } else if (gd.leaving === 0) {
        const k = this.nearestFreeKid(gd.x, gd.z);
        if (k) {
          gd.targetKid = k.id;
          goalX = k.x;
          goalZ = k.z;
          if (dist2(gd.x, gd.z, k.x, k.z) < CATCH_RADIUS) this.catchKid(gd, k);
        } else {
          gd.targetKid = -1;
        }
      }
      if (goalX === null || goalZ === null) {
        gd.vx *= 0.8;
        gd.vz *= 0.8;
        continue;
      }
      // Yol (A*), yarım saniyede bir tazele
      gd.repath -= dt;
      if (gd.repath <= 0 || gd.path.length === 0) {
        gd.repath = 0.5;
        const p = g.navGuard.findPath(gd.x, gd.z, goalX, goalZ);
        gd.path = p ?? [{ x: goalX, z: goalZ }];
      }
      while (gd.path.length > 0 && dist2(gd.x, gd.z, gd.path[0]!.x, gd.path[0]!.z) < 0.35) gd.path.shift();
      const wp = gd.path[0] ?? { x: goalX, z: goalZ };
      const dx = wp.x - gd.x;
      const dz = wp.z - gd.z;
      const dl = Math.hypot(dx, dz) || 1;
      const wantYaw = yawTo(gd.x, gd.z, wp.x, wp.z);
      gd.yaw = wrapPi(gd.yaw + clamp(angDiff(wantYaw, gd.yaw), -6 * dt, 6 * dt));
      const wx = (dx / dl) * speed;
      const wz = (dz / dl) * speed;
      gd.vx += (wx - gd.vx) * Math.min(1, dt * 10);
      gd.vz += (wz - gd.vz) * Math.min(1, dt * 10);
      gd.cc.computeColliderMovement(gd.collider, { x: gd.vx * dt, y: 0, z: gd.vz * dt }, undefined, gd.filterGroups);
      const mv = gd.cc.computedMovement();
      const moved = Math.hypot(mv.x, mv.z);
      gd.stuck = moved < speed * dt * 0.2 ? gd.stuck + dt : 0;
      if (gd.stuck > 1.2) {
        gd.path = [];
        gd.repath = 0;
        gd.stuck = 0;
      }
      gd.x += mv.x;
      gd.z += mv.z;
      gd.body.setNextKinematicTranslation({ x: gd.x, y: GUARD_DIM.height / 2, z: gd.z });
    }
  }

  private catchKid(gd: GuardRt, k: KidRt): void {
    const g = this.g;
    k.caughtUntil = g.time + g.tuning.catchSeconds;
    k.rescue = 0;
    k.vx = k.vz = 0;
    const c = g.counts[k.stack]!;
    c.stats.caught++;
    g.emit({ k: 'caught', stack: k.stack, id: k.id, player: k.playerId, until: Math.round(k.caughtUntil * 10) / 10, guard: gd.id });
    g.log('caught', k.stack, 5, { a: k.name });
    gd.path = [];
    gd.repath = 0;
  }

  private updateRestack(dt: number): void {
    const g = this.g;
    const t = g.tuning;
    // Kurtarma: yakalanmış çaylağın yanında takım arkadaşı E'ye basılı tutar
    for (const k of g.kids.values()) {
      if (k.caughtUntil <= g.time) continue;
      let helping = false;
      for (const o of g.kids.values()) {
        if (o === k || o.stack !== k.stack || o.caughtUntil > g.time) continue;
        if (o.use && dist2(o.x, o.z, k.x, k.z) < 1.5) helping = true;
      }
      k.rescue = helping ? k.rescue + dt : Math.max(0, k.rescue - dt * 2);
      if (k.rescue >= 1.4) {
        k.caughtUntil = g.time;
        k.rescue = 0;
        g.emit({ k: 'rescued', id: k.id, stack: k.stack });
        g.log('rescued', k.stack, 4, { a: k.name });
      }
    }
    for (const c of g.counts) {
      if (c.mode !== 'burst') continue;
      const mine = Array.from(g.kids.values()).filter((k) => k.stack === c.stack);
      if (mine.length === 0) {
        // Kimse kalmadı (hepsi ayrıldı) -> yığın pes etti
        c.mode = 'failed';
        continue;
      }
      const ready = mine.every((k) => k.caughtUntil <= g.time && dist2(k.x, k.z, c.pileX, c.pileZ) < RESTACK_RADIUS && k.use);
      c.restack = ready ? c.restack + dt / t.restackSeconds : Math.max(0, c.restack - dt * 1.5 / t.restackSeconds);
      if (c.restack >= 1) this.restack(c);
    }
  }

  restack(c: CountRt): void {
    const g = this.g;
    for (const k of Array.from(g.kids.values())) if (k.stack === c.stack) this.removeKid(k);
    g.emit({ k: 'despawn', id: ID.coatPile(c.stack) });
    c.mode = 'stacked';
    c.restack = 0;
    c.susp = 35;
    c.grace = 7;
    c.calm = 0;
    c.vx = c.vz = 0;
    c.x = clamp(c.pileX, g.level.bounds.minX + 0.7, g.level.bounds.maxX - 0.7);
    c.z = clamp(c.pileZ, g.level.bounds.minZ + 0.7, g.level.bounds.maxZ - 0.7);
    c.body.setEnabled(true);
    c.body.setTranslation({ x: c.x, y: COUNT.height / 2, z: c.z }, true);
    for (const h of c.hands) {
      h.body.setEnabled(true);
      h.input = { ...h.input, grip: false, slap: false };
      h.prevGrip = false;
      h.slapT = 0;
      h.body.setTranslation({ x: c.x + (h.side === 0 ? -COUNT.shoulderX - 0.15 : COUNT.shoulderX + 0.15), y: COUNT.shoulderY - 0.12, z: c.z - 0.6 }, true);
      h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    g.emit({ k: 'restack', stack: c.stack, x: c.x, z: c.z });
    g.log('restack', c.stack, 6);
  }
}
