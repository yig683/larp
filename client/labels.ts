// Dünya konumuna bağlı HTML etiketleri: isimler, konuşma balonları, tepki ikonları.

import * as THREE from 'three';
import type { V3 } from '../shared/math';

interface Item {
  el: HTMLElement;
  anchor: () => V3 | null;
  until: number;
  fadeStart: number;
  fadeEnd: number;
  lift: number;
}

const tmp = new THREE.Vector3();

export class Labels {
  private items = new Map<string, Item>();
  private seq = 0;
  constructor(private root: HTMLElement) {}

  /** Kalıcı etiket (örn. isim). */
  set(key: string, html: string, cls: string, anchor: () => V3 | null, fadeStart = 8, fadeEnd = 16): void {
    let it = this.items.get(key);
    if (!it) {
      const el = document.createElement('div');
      el.className = 'wl ' + cls;
      this.root.appendChild(el);
      it = { el, anchor, until: Infinity, fadeStart, fadeEnd, lift: 0 };
      this.items.set(key, it);
    }
    if (it.el.innerHTML !== html) it.el.innerHTML = html;
    it.anchor = anchor;
  }

  remove(key: string): void {
    const it = this.items.get(key);
    if (!it) return;
    it.el.remove();
    this.items.delete(key);
  }

  clear(): void {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
  }

  /** Geçici balon (konuşma / tepki). Aynı key yenisiyle değişir. */
  bubble(key: string, html: string, cls: string, ms: number, anchor: () => V3 | null, lift = 0.55): void {
    const k = 'b:' + key;
    this.remove(k);
    const el = document.createElement('div');
    el.className = 'wl bubble ' + cls;
    el.innerHTML = html;
    this.root.appendChild(el);
    this.items.set(k, { el, anchor, until: performance.now() + ms, fadeStart: 40, fadeEnd: 60, lift });
    this.seq++;
  }

  update(camera: THREE.PerspectiveCamera, w: number, h: number): void {
    const now = performance.now();
    for (const [k, it] of this.items) {
      if (now > it.until) {
        it.el.remove();
        this.items.delete(k);
        continue;
      }
      const a = it.anchor();
      if (!a) {
        it.el.style.display = 'none';
        continue;
      }
      tmp.set(a.x, a.y + it.lift, a.z);
      const dist = tmp.distanceTo(camera.position);
      tmp.project(camera);
      if (tmp.z > 1 || tmp.z < -1 || Math.abs(tmp.x) > 1.3 || Math.abs(tmp.y) > 1.3) {
        it.el.style.display = 'none';
        continue;
      }
      const o = dist < it.fadeStart ? 1 : Math.max(0, 1 - (dist - it.fadeStart) / Math.max(0.1, it.fadeEnd - it.fadeStart));
      if (o <= 0.02) {
        it.el.style.display = 'none';
        continue;
      }
      const left = (tmp.x * 0.5 + 0.5) * w;
      const top = (-tmp.y * 0.5 + 0.5) * h;
      it.el.style.display = '';
      it.el.style.opacity = String(it.until === Infinity ? o : Math.min(o, Math.min(1, (it.until - now) / 400)));
      it.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}
