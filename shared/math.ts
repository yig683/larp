// Ortak matematik yardımcıları. Dünya düzeni: Y yukarı, model "ileri" yönü -Z (yaw=0 -> -Z'ye bakar),
// "sağ" +X. Bu, three.js kamera/rotation.y kuralıyla birebir uyumludur.

export interface V2 {
  x: number;
  z: number;
}
export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sign = (v: number): number => (v < 0 ? -1 : v > 0 ? 1 : 0);

export function wrapPi(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
/** `to` açısına `from`'dan en kısa fark (-PI..PI). */
export const angDiff = (to: number, from: number): number => wrapPi(to - from);

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angDiff(b, a) * t;
}

/** Hedefe doğru en fazla `maxStep` kadar yaklaşır. */
export function approach(cur: number, target: number, maxStep: number): number {
  if (cur < target) return Math.min(target, cur + maxStep);
  return Math.max(target, cur - maxStep);
}

export const fwdX = (yaw: number): number => -Math.sin(yaw);
export const fwdZ = (yaw: number): number => -Math.cos(yaw);
export const rightX = (yaw: number): number => Math.cos(yaw);
export const rightZ = (yaw: number): number => -Math.sin(yaw);

/** Yerel (sağ, ileri) -> dünya XZ. */
export function localToWorld(px: number, pz: number, yaw: number, lx: number, lf: number): V2 {
  return {
    x: px + rightX(yaw) * lx + fwdX(yaw) * lf,
    z: pz + rightZ(yaw) * lx + fwdZ(yaw) * lf,
  };
}

/** (fx,fz) noktasından (tx,tz) noktasına bakan yaw. */
export const yawTo = (fx: number, fz: number, tx: number, tz: number): number => Math.atan2(-(tx - fx), -(tz - fz));

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};
export const dist3 = (a: V3, b: V3): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const len3 = (v: V3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

// --- Kuaterniyon yardımcıları ---
export const qIdent = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });
export const qYaw = (yaw: number): Quat => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

export function qAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const l = Math.hypot(ax, ay, az) || 1;
  const s = Math.sin(angle / 2) / l;
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(angle / 2) };
}

export function qMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
export const qConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function qNormalize(q: Quat): Quat {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

export function qRotate(q: Quat, v: V3): V3 {
  // v' = q * v * q^-1 (optimize edilmiş)
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

/** `from` -> `to` dönüşünü eksen*açı vektörü olarak verir (küçük hata düzeltmeleri için). */
export function qErrorVec(from: Quat, to: Quat): V3 {
  let d = qMul(to, qConj(from));
  if (d.w < 0) d = { x: -d.x, y: -d.y, z: -d.z, w: -d.w };
  const s = Math.hypot(d.x, d.y, d.z);
  if (s < 1e-6) return { x: 0, y: 0, z: 0 };
  const angle = 2 * Math.atan2(s, d.w);
  return { x: (d.x / s) * angle, y: (d.y / s) * angle, z: (d.z / s) * angle };
}

export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    return qNormalize({ x: lerp(a.x, bx, t), y: lerp(a.y, by, t), z: lerp(a.z, bz, t), w: lerp(a.w, bw, t) });
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return { x: a.x * wa + bx * wb, y: a.y * wa + by * wb, z: a.z * wa + bz * wb, w: a.w * wa + bw * wb };
}
