// Kaşık/kadeh içindeki sıvının yüzey eğimi: sönümlü yay modeli.
//   θ'' = -ω²(θ + G·a) - 2ζω·θ'
// θ_denge = -G·a (a: yatay ivme m/s²). Ani el hareketi büyük ivme -> büyük eğim -> dökülme.

export interface Slosh {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export const newSlosh = (): Slosh => ({ x: 0, z: 0, vx: 0, vz: 0 });

export interface SloshParams {
  omega: number;
  zeta: number;
  gain: number;
}

export function stepSlosh(s: Slosh, ax: number, az: number, dt: number, p: SloshParams): void {
  const { omega, zeta, gain } = p;
  const w2 = omega * omega;
  const accX = -w2 * (s.x + gain * ax) - 2 * zeta * omega * s.vx;
  const accZ = -w2 * (s.z + gain * az) - 2 * zeta * omega * s.vz;
  s.vx += accX * dt;
  s.vz += accZ * dt;
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  // Güvenlik sınırı
  const m = Math.hypot(s.x, s.z);
  if (m > 1.6) {
    s.x *= 1.6 / m;
    s.z *= 1.6 / m;
  }
}

export const sloshMag = (s: Slosh): number => Math.hypot(s.x, s.z);

/** Eşik üstü eğimde saniyede dökülen miktar. */
export function spillAmount(mag: number, threshold: number, rate: number, dt: number): number {
  if (mag <= threshold) return 0;
  return (mag - threshold) * rate * dt;
}
