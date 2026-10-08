// NPC geometrisi: sunucu mantığı ve istemci çizimi aynı noktaları kullanır.

import { COUNT } from './constants';
import { fwdX, fwdZ, rightX, rightZ, type V3 } from './math';

/** Selam veren bir NPC'nin uzattığı sağ elin dünya konumu. */
export function npcHandPoint(x: number, z: number, yaw: number): V3 {
  return { x: x + fwdX(yaw) * 0.62 + rightX(yaw) * 0.14, y: 1.08, z: z + fwdZ(yaw) * 0.62 + rightZ(yaw) * 0.14 };
}

/** Kont'un şapka noktası (şapka selamı için eller buraya uzanır). */
export function hatPoint(x: number, z: number, yaw: number, bow: number): V3 {
  const f = 0.7 * bow;
  return { x: x + fwdX(yaw) * f, y: COUNT.hatY + 0.08 - 0.85 * bow, z: z + fwdZ(yaw) * f };
}
