import type { Objective, SceneId } from '../../shared/protocol';
import type { Game } from '../game';

export interface SceneOutcome {
  perStack: boolean[];
  lines: string[];
}

export interface SceneLogic {
  readonly id: SceneId;
  readonly title: string;
  readonly intro: string;
  readonly hint: string;
  /** Saniye; 0 = süresiz. */
  readonly timeLimit: number;
  spawn(stack: number, stackCount: number): { x: number; z: number; yaw: number };
  setup(g: Game): void;
  update(g: Game, dt: number): void;
  objectives(g: Game, stack: number): Objective[];
  banner(g: Game): string | undefined;
  /** null = sürüyor. */
  outcome(g: Game): SceneOutcome | null;
}
