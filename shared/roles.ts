// Oyuncuları yığınlara ve rollere (slot) dağıtma. Saf mantık: sunucu ve test kullanır.

import { MAX_STACKS, SLOT_IDS, type SlotId } from './constants';
import { Rng } from './rng';

export interface StackAssign {
  stack: number;
  /** Bu yığındaki oyuncu kimlikleri, rol sırasına göre. */
  members: number[];
  /** Hangi slotu hangi oyuncu yönetiyor (0 = kimse). */
  slots: Record<SlotId, number>;
}

/** Kişi sayısına göre rol paylaşımı. */
export function slotMap(members: number[]): Record<SlotId, number> {
  const m = members;
  const out: Record<SlotId, number> = { legs: 0, handL: 0, handR: 0, head: 0 };
  if (m.length === 0) return out;
  if (m.length === 1) {
    out.legs = out.handL = out.handR = out.head = m[0]!;
  } else if (m.length === 2) {
    out.legs = out.head = m[0]!;
    out.handL = out.handR = m[1]!;
  } else if (m.length === 3) {
    out.legs = m[0]!;
    out.handL = out.handR = m[1]!;
    out.head = m[2]!;
  } else {
    out.legs = m[0]!;
    out.handL = m[1]!;
    out.handR = m[2]!;
    out.head = m[3]!;
  }
  return out;
}

/** Oyuncu sayısına göre yığın boyutları: 8 -> [4,4], 7 -> [4,3], 6 -> [3,3], 5 -> [3,2], 4 -> [4], 3 -> [3], 2 -> [2], 1 -> [1]. */
export function stackSizes(n: number): number[] {
  if (n <= 0) return [];
  if (n <= 4) return [n];
  const capped = Math.min(n, MAX_STACKS * 4);
  const a = Math.ceil(capped / 2);
  return [a, capped - a];
}

export function assignStacks(playerIds: number[], rng?: Rng): StackAssign[] {
  const ids = rng ? rng.shuffle(playerIds) : playerIds.slice();
  const sizes = stackSizes(ids.length);
  const out: StackAssign[] = [];
  let o = 0;
  sizes.forEach((sz, i) => {
    const members = ids.slice(o, o + sz);
    o += sz;
    out.push({ stack: i, members, slots: slotMap(members) });
  });
  return out;
}

/** Roller bir kayar: herkes bir sonraki sahnede başka bir uzvu yönetir. */
export function rotateAssign(a: StackAssign, by = 1): StackAssign {
  const n = a.members.length;
  if (n <= 1) return a;
  const k = ((by % n) + n) % n;
  const members = a.members.map((_, i) => a.members[(i + k) % n]!);
  return { stack: a.stack, members, slots: slotMap(members) };
}

/** Oyuncunun yığındaki slotları. */
export function slotsOf(a: StackAssign | undefined, playerId: number): SlotId[] {
  if (!a) return [];
  return SLOT_IDS.filter((s) => a.slots[s] === playerId);
}

export const SLOT_HINTS: Record<SlotId, string> = {
  legs: 'WASD yürü · Fare dön · Shift koş · Boşluk reverans',
  handL: 'Fare eli oynatır · W/S veya tekerlek derinlik · Sol tık tut · Sağ tık tokat',
  handR: 'Fare eli oynatır · W/S veya tekerlek derinlik · Sol tık tut · Sağ tık tokat',
  head: 'Fare bak · Sol tık ağız aç · Q basılı tut: söylem çarkı',
};
