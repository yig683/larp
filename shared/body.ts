// Kont gövdesinin ortak geometrisi: sunucu (ağız/omuz mantığı) ve istemci (kamera/çizim) aynı formülleri kullanır.
// Reverans: gövde belden (PIVOT) öne eğilir; baş, omuzlar ve şapka bu dönüşle birlikte hareket eder.

import { COUNT } from './constants';
import { fwdX, fwdZ, rightX, rightZ, type V3 } from './math';

export const PIVOT_Y = 0.9;
export const BOW_ANGLE = 0.8;

/** Belden eğilmiş bir noktanın (rest yükseklik `y`) ileri ve yukarı konumu. */
function bent(restY: number, bow: number): { f: number; y: number } {
  const th = BOW_ANGLE * bow;
  const r = restY - PIVOT_Y;
  return { f: r * Math.sin(th), y: PIVOT_Y + r * Math.cos(th) };
}

export function headPosOf(x: number, z: number, yaw: number, bow: number): V3 {
  const b = bent(COUNT.headY, bow);
  return { x: x + fwdX(yaw) * b.f, y: b.y, z: z + fwdZ(yaw) * b.f };
}

/** Şapkanın tepesi (şapka selamı için eller buraya uzanır). */
export function hatPosOf(x: number, z: number, yaw: number, bow: number): V3 {
  const b = bent(COUNT.hatY + 0.12, bow);
  return { x: x + fwdX(yaw) * b.f, y: b.y, z: z + fwdZ(yaw) * b.f };
}

/** Bakış yönü (birim). headPitch > 0 yukarı bakar. */
export function lookDir(yaw: number, headYaw: number, headPitch: number): V3 {
  const yawH = yaw + headYaw;
  const cp = Math.cos(headPitch);
  return { x: fwdX(yawH) * cp, y: Math.sin(headPitch), z: fwdZ(yawH) * cp };
}

export function mouthPosOf(x: number, z: number, yaw: number, bow: number, headYaw: number, headPitch: number): V3 {
  const h = headPosOf(x, z, yaw, bow);
  const d = lookDir(yaw, headYaw, headPitch);
  return {
    x: h.x + d.x * COUNT.mouthForward,
    y: h.y + d.y * COUNT.mouthForward - COUNT.mouthDown,
    z: h.z + d.z * COUNT.mouthForward,
  };
}

export function shoulderOf(x: number, z: number, yaw: number, bow: number, side: 0 | 1): V3 {
  const sx = side === 0 ? -COUNT.shoulderX : COUNT.shoulderX;
  const b = bent(COUNT.shoulderY, bow);
  return {
    x: x + rightX(yaw) * sx + fwdX(yaw) * b.f,
    y: b.y,
    z: z + rightZ(yaw) * sx + fwdZ(yaw) * b.f,
  };
}
