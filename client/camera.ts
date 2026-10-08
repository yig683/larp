// Rol kameraları: Kafa (göz hizası), Eller (göğüs kamerası, dar), Bacaklar (yer seviyesi), Çaylak (arkadan),
// seyirci (başka yığının kafasından) ve lobi/menü için yavaş yörünge.

import { headPosOf, lookDir, shoulderOf } from '../shared/body';
import { fwdX, fwdZ } from '../shared/math';
import type { Entities } from './entities';
import type { Fx } from './fx';
import type { Input } from './input';
import { S } from './state';
import type { World } from './world';

export type ViewMode = 'orbit' | 'head' | 'hands' | 'legs' | 'kid';

export interface CamCtx {
  world: World;
  ents: Entities;
  input: Input;
  fx: Fx;
  nowMs: number;
  t: number;
  dt: number;
}

export function updateCamera(c: CamCtx): { view: ViewMode; stack: number } {
  const { world, ents, input, fx, nowMs, t } = c;
  const cam = world.camera;
  cam.rotation.order = 'YXZ';
  let view: ViewMode = 'orbit';
  let stack = S.myStack >= 0 ? S.myStack : S.spectateStack;
  const inGame = S.phase === 'briefing' || S.phase === 'playing' || S.phase === 'sceneEnd';
  const kid = inGame && S.inKidMode ? ents.kidOf(S.me.id) : null;
  if (kid) view = 'kid';
  else if (inGame && ents.counts.size > 0) {
    if (!ents.counts.has(stack)) stack = ents.counts.keys().next().value as number;
    if (S.myStack >= 0) view = input.group === 'legs' ? 'legs' : input.group === 'hands' ? 'hands' : 'head';
    else view = 'head';
  }
  const own = S.myStack === stack;
  const cs = view !== 'orbit' && view !== 'kid' ? ents.countState(stack, nowMs, own) : null;
  let fov = 76;
  if (view !== 'orbit' && view !== 'kid' && !cs) view = 'orbit';
  ents.setFirstPerson(view === 'head' || view === 'hands' ? stack : null, view === 'head' || view === 'hands' ? view : null);

  if (view === 'orbit') {
    const a = t * 0.06;
    const r = 13 + Math.sin(t * 0.11) * 2;
    cam.position.set(Math.sin(a) * r, 4.2 + Math.sin(t * 0.13) * 0.8, Math.cos(a) * r * 0.75 + 0.5);
    cam.lookAt(0, 1.8, -1.5);
    fov = 62;
  } else if (view === 'kid' && kid) {
    const ty = 0.9;
    const cp = Math.cos(input.kidPitch);
    const yaw = input.kidYaw;
    const dist = 3.3;
    cam.position.set(kid.x + Math.sin(yaw) * cp * dist, Math.max(0.5, ty + Math.sin(input.kidPitch) * dist), kid.z + Math.cos(yaw) * cp * dist);
    cam.lookAt(kid.x, ty + 0.25, kid.z);
    fov = 72;
  } else if (cs) {
    const owns = (s: string): boolean => own && S.mySlots.includes(s as never);
    const yaw = owns('legs') ? input.yaw : cs.yaw;
    if (view === 'head') {
      const hy = owns('head') ? input.headYaw : cs.headYaw;
      const hpitch = owns('head') ? input.headPitch : cs.headPitch;
      const hp = headPosOf(cs.x, cs.z, yaw, cs.bow);
      const d = lookDir(yaw, hy, hpitch);
      cam.position.set(hp.x + d.x * 0.1, hp.y + 0.05 + d.y * 0.1, hp.z + d.z * 0.1);
      cam.rotation.set(hpitch, yaw + hy, Math.sin(t * 9) * 0.02 * cs.sway);
      fov = 80;
    } else if (view === 'hands') {
      const a = shoulderOf(cs.x, cs.z, yaw, cs.bow, 0);
      const b = shoulderOf(cs.x, cs.z, yaw, cs.bow, 1);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const mz = (a.z + b.z) / 2;
      cam.position.set(mx - fwdX(yaw) * 0.45, my + 0.42, mz - fwdZ(yaw) * 0.45);
      cam.rotation.set(-0.46, yaw, Math.sin(t * 9) * 0.015 * cs.sway);
      fov = 66;
    } else {
      cam.position.set(cs.x + fwdX(yaw) * 0.6, 0.36 + Math.abs(Math.sin(t * 5)) * 0.015 * cs.sway, cs.z + fwdZ(yaw) * 0.6);
      cam.rotation.set(-0.07, yaw, 0);
      fov = 92;
    }
  }
  // ekran sarsıntısı
  if (fx.shake > 0.001) {
    const s = fx.shake;
    cam.position.x += (Math.random() - 0.5) * s * 0.3;
    cam.position.y += (Math.random() - 0.5) * s * 0.3;
    cam.position.z += (Math.random() - 0.5) * s * 0.3;
  }
  if (Math.abs(cam.fov - fov) > 0.05) {
    cam.fov += (fov - cam.fov) * Math.min(1, c.dt * 8);
    cam.updateProjectionMatrix();
  }
  return { view, stack };
}
