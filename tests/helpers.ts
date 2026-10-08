import { beforeAll } from 'vitest';
import { Game, type PlayerLite } from '../server/game';
import { initRapier } from '../server/rapier';
import { assignStacks } from '../shared/roles';
import { Rng } from '../shared/rng';
import { TUNING_DEFAULTS } from '../shared/tuning';
import type { SceneId } from '../shared/protocol';
import type { CountRt, HandRt } from '../server/entities';
import { fwdX, fwdZ, rightX, rightZ, type V3 } from '../shared/math';

export function useRapier(): void {
  beforeAll(async () => {
    await initRapier();
  });
}

/** n oyunculu bir oyun kurar: oyuncu kimlikleri 1..n. */
export function makeGame(scene: SceneId, n: number, seed = 1, tuning = TUNING_DEFAULTS): Game {
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const players = new Map<number, PlayerLite>();
  for (const id of ids) players.set(id, { id, name: `P${id}`, color: id % 8 });
  const assigns = assignStacks(ids); // sırayı koru: ilk yığın 1..4
  return new Game({ scene, index: 0, total: 3, assigns, players, tuning: { ...tuning }, seed });
}

export function stepN(g: Game, n: number): void {
  for (let i = 0; i < n; i++) g.step();
}

/** Dünya konumunu omuza göre yerel (sağ, yukarı, ileri) koordinata çevirir. */
export function handLocalFor(g: Game, c: CountRt, side: 0 | 1, world: V3): { x: number; y: number; f: number } {
  const sh = g.countSys.shoulder(c, side);
  const dx = world.x - sh.x;
  const dz = world.z - sh.z;
  return {
    x: dx * rightX(c.yaw) + dz * rightZ(c.yaw),
    y: world.y - sh.y,
    f: dx * fwdX(c.yaw) + dz * fwdZ(c.yaw),
  };
}

export function handPos(h: HandRt): V3 {
  const t = h.body.translation();
  return { x: t.x, y: t.y, z: t.z };
}
