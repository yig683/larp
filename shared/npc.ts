// NPC geometrisi: sunucu mantığı ve istemci çizimi aynı noktaları kullanır.

import { hatPosOf } from './body';
import { fwdX, fwdZ, rightX, rightZ, type V3 } from './math';

/** Selam veren bir NPC'nin uzattığı sağ elin dünya konumu. */
export function npcHandPoint(x: number, z: number, yaw: number): V3 {
  return { x: x + fwdX(yaw) * 0.62 + rightX(yaw) * 0.14, y: 1.08, z: z + fwdZ(yaw) * 0.62 + rightZ(yaw) * 0.14 };
}

/** Kont'un şapka noktası. */
export function hatPoint(x: number, z: number, yaw: number, bow: number): V3 {
  return hatPosOf(x, z, yaw, bow);
}
