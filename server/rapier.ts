// Rapier başlatma ve statik seviye kurulumu.

import RAPIER from '@dimforge/rapier3d-compat';
import { G, G_ALL, groups } from '../shared/constants';
import type { Shape } from '../shared/level';

export { RAPIER };
export type RWorld = RAPIER.World;
export type RBody = RAPIER.RigidBody;
export type RCollider = RAPIER.Collider;
export type RController = RAPIER.KinematicCharacterController;

let initPromise: Promise<void> | null = null;
export function initRapier(): Promise<void> {
  if (!initPromise) initPromise = RAPIER.init();
  return initPromise;
}

export function addStaticShapes(world: RWorld, shapes: Shape[]): void {
  for (const s of shapes) {
    if (!s.solid) continue;
    let desc: RAPIER.ColliderDesc;
    if (s.k === 'box') {
      desc = RAPIER.ColliderDesc.cuboid(s.s[0] / 2, s.s[1] / 2, s.s[2] / 2);
      if (s.ry) desc.setRotation({ x: 0, y: Math.sin(s.ry / 2), z: 0, w: Math.cos(s.ry / 2) });
    } else {
      desc = RAPIER.ColliderDesc.cylinder(s.h / 2, s.r);
    }
    desc
      .setTranslation(s.p[0], s.p[1], s.p[2])
      .setFriction(0.8)
      .setRestitution(0.05)
      .setCollisionGroups(groups(G.STATIC, G_ALL));
    world.createCollider(desc);
  }
}
