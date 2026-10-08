// Prosedürel dokular (canvas) ve malzeme fabrikası. Hiçbir harici görsel kullanılmaz.

import * as THREE from 'three';

export const PAL = {
  skin: 0xf0c49a,
  skinDark: 0xc98a5c,
  gold: 0xd6a93a,
  cream: 0xf2e6cc,
  red: 0x7a1f2b,
  wood: 0x5b3a22,
  dark: 0x1b1520,
  glove: 0xfaf7f0,
  soup: 0xe0852c,
  wine: 0x6d0f1d,
  coat: [0x9c8452, 0x73407a] as const,
  coatDark: [0x6e5b36, 0x4d2a53] as const,
  player: [0xe6554d, 0x4aa3df, 0x58b86a, 0xf0b53a, 0xa66cd9, 0x35c0b2, 0xe8789f, 0xa9b0b8] as const,
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeatX = 1, repeatY = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function checkerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#efe4cc';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#2b2430';
  g.fillRect(0, 0, 128, 128);
  g.fillRect(128, 128, 128, 128);
  // damar dokusu
  g.globalAlpha = 0.12;
  g.strokeStyle = '#6a5a70';
  for (let i = 0; i < 22; i++) {
    g.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    g.moveTo(x, y);
    g.bezierCurveTo(x + 30, y + 10, x - 20, y + 50, x + 40, y + 80);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  g.strokeRect(128, 0, 128, 128);
  g.strokeRect(0, 128, 128, 128);
  g.strokeRect(128, 128, 128, 128);
  return tex(c);
}

export function wallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#6e1d2c';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#7d2434';
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 32, 256);
  g.strokeStyle = 'rgba(214,169,58,0.55)';
  g.lineWidth = 3;
  for (let y = 0; y < 256; y += 64) {
    for (let x = 16; x < 256; x += 64) {
      g.beginPath();
      g.moveTo(x, y + 8);
      g.lineTo(x + 12, y + 32);
      g.lineTo(x, y + 56);
      g.lineTo(x - 12, y + 32);
      g.closePath();
      g.stroke();
    }
  }
  return tex(c);
}

export function woodTexture(dark = false): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = dark ? '#3d2415' : '#6b4527';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = dark ? 'rgba(0,0,0,0.3)' : 'rgba(30,15,5,0.28)';
  for (let i = 0; i < 40; i++) {
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const y = Math.random() * 256;
    g.moveTo(0, y);
    g.bezierCurveTo(80, y + 6 - Math.random() * 12, 170, y + 6 - Math.random() * 12, 256, y);
    g.stroke();
  }
  return tex(c);
}

export function carpetTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#8f1d2c';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(214,169,58,0.35)';
  for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
    g.beginPath();
    g.arc(x + 16, y + 16, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 128; i += 4) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  return tex(c);
}

export function danceTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const grd = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  grd.addColorStop(0, '#f3e3b8');
  grd.addColorStop(1, '#c9a24d');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(80,50,10,0.5)';
  g.lineWidth = 4;
  for (let r = 40; r < 256; r += 54) {
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let a = 0; a < 16; a++) {
    g.beginPath();
    g.moveTo(256, 256);
    g.lineTo(256 + Math.cos((a / 16) * Math.PI * 2) * 256, 256 + Math.sin((a / 16) * Math.PI * 2) * 256);
    g.stroke();
  }
  return tex(c);
}

export function ceilingTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#d9c9a8';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,90,50,0.5)';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 236, 236);
  g.lineWidth = 2;
  g.strokeRect(36, 36, 184, 184);
  return tex(c);
}

export function clothTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#f4efe4';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < 64; i += 4) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  return tex(c);
}

/** Tablo içeriği: mizahi "eski usta" resimleri. */
export function paintingTexture(kind: string, w = 360, h = 440): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  const bg = g.createLinearGradient(0, 0, 0, h);
  switch (kind) {
    case 'aldo': {
      bg.addColorStop(0, '#2c2118');
      bg.addColorStop(1, '#4a3322');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // palto + yaka
      g.fillStyle = '#6e5b36';
      g.beginPath();
      g.moveTo(w * 0.15, h);
      g.lineTo(w * 0.28, h * 0.62);
      g.lineTo(w * 0.72, h * 0.62);
      g.lineTo(w * 0.85, h);
      g.fill();
      // yüz
      g.fillStyle = '#e9c19b';
      g.beginPath();
      g.ellipse(w / 2, h * 0.42, w * 0.16, h * 0.17, 0, 0, Math.PI * 2);
      g.fill();
      // şapka
      g.fillStyle = '#17121c';
      g.fillRect(w * 0.36, h * 0.12, w * 0.28, h * 0.17);
      g.fillRect(w * 0.28, h * 0.27, w * 0.44, h * 0.03);
      // bıyık
      g.fillStyle = '#2b1c10';
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.5);
      g.bezierCurveTo(w * 0.28, h * 0.46, w * 0.2, h * 0.58, w * 0.3, h * 0.56);
      g.bezierCurveTo(w * 0.4, h * 0.55, w * 0.46, h * 0.53, w * 0.5, h * 0.53);
      g.bezierCurveTo(w * 0.54, h * 0.53, w * 0.6, h * 0.55, w * 0.7, h * 0.56);
      g.bezierCurveTo(w * 0.8, h * 0.58, w * 0.72, h * 0.46, w * 0.5, h * 0.5);
      g.fill();
      // gözler + monokl
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(w * 0.44, h * 0.4, 9, 0, 7);
      g.arc(w * 0.56, h * 0.4, 9, 0, 7);
      g.fill();
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(w * 0.44, h * 0.4, 4, 0, 7);
      g.arc(w * 0.56, h * 0.4, 4, 0, 7);
      g.fill();
      g.strokeStyle = '#d6a93a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(w * 0.56, h * 0.4, 14, 0, 7);
      g.stroke();
      break;
    }
    case 'storm': {
      bg.addColorStop(0, '#1b2a3f');
      bg.addColorStop(1, '#3d4f66');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#10202e';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(0, h * (0.55 + i * 0.08));
        for (let x = 0; x <= w; x += 20) g.lineTo(x, h * (0.55 + i * 0.08) + Math.sin(x * 0.05 + i) * 10);
        g.lineTo(w, h);
        g.lineTo(0, h);
        g.fill();
      }
      g.fillStyle = '#e8d9a8';
      g.fillRect(w * 0.42, h * 0.35, 8, h * 0.3);
      g.beginPath();
      g.moveTo(w * 0.42, h * 0.4);
      g.lineTo(w * 0.72, h * 0.5);
      g.lineTo(w * 0.42, h * 0.58);
      g.fill();
      break;
    }
    case 'cat': {
      bg.addColorStop(0, '#2a3b2e');
      bg.addColorStop(1, '#46603f');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d98b3a';
      g.beginPath();
      g.ellipse(w / 2, h * 0.55, w * 0.26, h * 0.3, 0, 0, 7);
      g.fill();
      g.beginPath();
      g.moveTo(w * 0.28, h * 0.3);
      g.lineTo(w * 0.34, h * 0.14);
      g.lineTo(w * 0.44, h * 0.28);
      g.moveTo(w * 0.72, h * 0.3);
      g.lineTo(w * 0.66, h * 0.14);
      g.lineTo(w * 0.56, h * 0.28);
      g.fill();
      g.fillStyle = '#111';
      g.beginPath();
      g.ellipse(w * 0.42, h * 0.5, 9, 14, 0, 0, 7);
      g.ellipse(w * 0.58, h * 0.5, 9, 14, 0, 0, 7);
      g.fill();
      g.strokeStyle = '#d6a93a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(w * 0.58, h * 0.5, 17, 0, 7);
      g.stroke();
      break;
    }
    case 'fruit': {
      g.fillStyle = '#3a2a1f';
      g.fillRect(0, 0, w, h);
      const cols = ['#c63a32', '#e0a52c', '#7c9a3a', '#7a2a5a'];
      for (let i = 0; i < 9; i++) {
        g.fillStyle = cols[i % cols.length]!;
        g.beginPath();
        g.arc(w * (0.2 + (i % 3) * 0.3), h * (0.35 + Math.floor(i / 3) * 0.2), 30, 0, 7);
        g.fill();
      }
      break;
    }
    default: {
      bg.addColorStop(0, '#5a7a9a');
      bg.addColorStop(1, '#d9c9a8');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#7a2f2a';
      g.beginPath();
      g.moveTo(w * 0.2, h * 0.7);
      g.lineTo(w * 0.8, h * 0.7);
      g.lineTo(w * 0.7, h * 0.82);
      g.lineTo(w * 0.3, h * 0.82);
      g.fill();
      g.fillStyle = '#eee';
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.2);
      g.lineTo(w * 0.66, h * 0.68);
      g.lineTo(w * 0.34, h * 0.68);
      g.fill();
    }
  }
  // eski boya çatlakları
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  g.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.moveTo(Math.random() * w, Math.random() * h);
    g.lineTo(Math.random() * w, Math.random() * h);
    g.stroke();
  }
  return tex(c, 1, 1);
}

export function nightSkyTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#0d1230');
  grd.addColorStop(1, '#2c2a5a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#fff';
  for (let i = 0; i < 24; i++) g.fillRect(Math.random() * 128, Math.random() * 200, 2, 2);
  g.fillStyle = '#f4e9b8';
  g.beginPath();
  g.arc(90, 50, 14, 0, 7);
  g.fill();
  g.strokeStyle = '#d6a93a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 256);
  g.moveTo(0, 128);
  g.lineTo(128, 128);
  g.stroke();
  return tex(c);
}

/** Konuşma/ad etiketi için küçük bir yazı dokusu. */
export function labelTexture(text: string, color = '#fff', bg = 'rgba(20,10,20,0.65)'): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.font = 'bold 30px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = Math.min(246, g.measureText(text).width + 24);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(128 - w / 2, 8, w, 48, 14);
  g.fill();
  g.fillStyle = color;
  g.fillText(text, 128, 33);
  return tex(c);
}

// ---------------------------------------------------------------- malzemeler

const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, opts: { rough?: number; metal?: number; emissive?: number; emissiveI?: number; flat?: boolean; map?: THREE.Texture; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.rough}|${opts.metal}|${opts.emissive}|${opts.emissiveI}|${opts.flat}|${opts.map?.uuid}|${opts.opacity}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.75,
    metalness: opts.metal ?? 0,
    flatShading: opts.flat ?? true,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveI ?? 1,
    map: opts.map ?? null,
    transparent: opts.transparent ?? opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
  });
  cache.set(key, m);
  return m;
}
