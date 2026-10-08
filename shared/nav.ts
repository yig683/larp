// Basit ızgara tabanlı yol bulma (A*). Güvenlik görevlileri ve NPC'ler için.

import type { Bounds, Shape } from './level';
import { shapeBlocksAt } from './level';
import type { V2 } from './math';

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
  constructor(
    readonly bounds: Bounds,
    readonly cell: number,
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  static build(bounds: Bounds, shapes: Shape[], agentRadius: number, agentHeight: number, cell = 0.5): NavGrid {
    const g = new NavGrid(bounds, cell);
    const obst = shapes.filter((s) => shapeBlocksAt(s, 0.05, agentHeight));
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const { x, z } = g.cellCenter(c, r);
        let b = false;
        for (const s of obst) {
          if (s.k === 'cyl') {
            const dx = x - s.p[0];
            const dz = z - s.p[2];
            if (Math.hypot(dx, dz) < s.r + agentRadius) {
              b = true;
              break;
            }
          } else {
            const dx = x - s.p[0];
            const dz = z - s.p[2];
            const a = -(s.ry ?? 0);
            const lx = dx * Math.cos(a) - dz * Math.sin(a);
            const lz = dx * Math.sin(a) + dz * Math.cos(a);
            if (Math.abs(lx) < s.s[0] / 2 + agentRadius && Math.abs(lz) < s.s[2] / 2 + agentRadius) {
              b = true;
              break;
            }
          }
        }
        g.blocked[r * g.cols + c] = b ? 1 : 0;
      }
    }
    return g;
  }

  cellOf(x: number, z: number): { c: number; r: number } {
    const c = Math.floor((x - this.bounds.minX) / this.cell);
    const r = Math.floor((z - this.bounds.minZ) / this.cell);
    return { c: Math.max(0, Math.min(this.cols - 1, c)), r: Math.max(0, Math.min(this.rows - 1, r)) };
  }
  cellCenter(c: number, r: number): V2 {
    return { x: this.bounds.minX + (c + 0.5) * this.cell, z: this.bounds.minZ + (r + 0.5) * this.cell };
  }
  isBlockedCell(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }
  isBlocked(x: number, z: number): boolean {
    const { c, r } = this.cellOf(x, z);
    return this.isBlockedCell(c, r);
  }

  /** Engelsiz en yakın hücre merkezi (başlangıç/hedef bir engelin içindeyse). */
  nearestFree(x: number, z: number): V2 | null {
    const { c, r } = this.cellOf(x, z);
    if (!this.isBlockedCell(c, r)) return { x, z };
    for (let rad = 1; rad < 12; rad++) {
      let best: V2 | null = null;
      let bd = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          if (this.isBlockedCell(c + dc, r + dr)) continue;
          const p = this.cellCenter(c + dc, r + dr);
          const d = Math.hypot(p.x - x, p.z - z);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** İki nokta arasında düz çizgi engelsiz mi. */
  lineClear(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      if (this.isBlocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** A* ile yol; boşluklar düzleştirilmiş ara noktalar döner (başlangıç hariç). */
  findPath(sx: number, sz: number, tx: number, tz: number): V2[] | null {
    const s = this.nearestFree(sx, sz);
    const t = this.nearestFree(tx, tz);
    if (!s || !t) return null;
    if (this.lineClear(s.x, s.z, t.x, t.z)) return [{ x: t.x, z: t.z }];
    const a = this.cellOf(s.x, s.z);
    const b = this.cellOf(t.x, t.z);
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: Array<{ i: number; f: number }> = [];
    const idx = (c: number, r: number): number => r * this.cols + c;
    const h = (c: number, r: number): number => {
      const dx = Math.abs(c - b.c);
      const dz = Math.abs(r - b.r);
      return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    };
    const push = (i: number, f: number): void => {
      open.push({ i, f });
      let k = open.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (open[p]!.f <= open[k]!.f) break;
        [open[p], open[k]] = [open[k]!, open[p]!];
        k = p;
      }
    };
    const pop = (): { i: number; f: number } => {
      const top = open[0]!;
      const last = open.pop()!;
      if (open.length > 0) {
        open[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < open.length && open[l]!.f < open[m]!.f) m = l;
          if (r < open.length && open[r]!.f < open[m]!.f) m = r;
          if (m === k) break;
          [open[m], open[k]] = [open[k]!, open[m]!];
          k = m;
        }
      }
      return top;
    };
    const start = idx(a.c, a.r);
    const goal = idx(b.c, b.r);
    g[start] = 0;
    push(start, h(a.c, a.r));
    const dirs: Array<[number, number, number]> = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.4142],
      [1, -1, 1.4142],
      [-1, 1, 1.4142],
      [-1, -1, 1.4142],
    ];
    let found = false;
    while (open.length > 0) {
      const cur = pop();
      if (closed[cur.i]) continue;
      closed[cur.i] = 1;
      if (cur.i === goal) {
        found = true;
        break;
      }
      const cc = cur.i % this.cols;
      const cr = (cur.i - cc) / this.cols;
      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (this.isBlockedCell(nc, nr)) continue;
        if (dc !== 0 && dr !== 0 && (this.isBlockedCell(cc + dc, cr) || this.isBlockedCell(cc, cr + dr))) continue; // köşe kesme yok
        const ni = idx(nc, nr);
        if (closed[ni]) continue;
        const ng = g[cur.i]! + cost;
        if (ng < g[ni]!) {
          g[ni] = ng;
          came[ni] = cur.i;
          push(ni, ng + h(nc, nr));
        }
      }
    }
    if (!found) return null;
    const cells: V2[] = [];
    let i = goal;
    while (i !== -1 && i !== start) {
      const c = i % this.cols;
      const r = (i - c) / this.cols;
      cells.push(this.cellCenter(c, r));
      i = came[i]!;
    }
    cells.reverse();
    // Yol düzleştirme
    const out: V2[] = [];
    let ax = s.x;
    let az = s.z;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let j = cells.length - 1; j > k; j--) {
        if (this.lineClear(ax, az, cells[j]!.x, cells[j]!.z)) {
          far = j;
          break;
        }
      }
      out.push(cells[far]!);
      ax = cells[far]!.x;
      az = cells[far]!.z;
      k = far + 1;
    }
    return out;
  }
}
