import type { SceneId } from '../../shared/protocol';
import { DinnerScene } from './dinner';
import { ReceptionScene } from './reception';
import type { SceneLogic } from './types';
import { WaltzScene } from './waltz';

export function createScene(id: SceneId): SceneLogic {
  switch (id) {
    case 'reception':
      return new ReceptionScene();
    case 'dinner':
      return new DinnerScene();
    case 'waltz':
      return new WaltzScene();
  }
}

export const NIGHT_ORDER: SceneId[] = ['reception', 'dinner', 'waltz'];
