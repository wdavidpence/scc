import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene.js';
import { HudScene } from './scenes/HudScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { ReplayScene } from './scenes/ReplayScene.js';
import { CutScene } from './scenes/CutScene.js';

export function createGame2(parent = 'game') {
  const g = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    backgroundColor: '#0c141f',
    pixelArt: true,
    antialias: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: '100%',
      height: '100%'
    },
    input: { activePointers: 3, mouse: { preventDefaultMixedHandling: true } },
    audio: { disableWebAudio: true },
    scene: [TitleScene, BattleScene, HudScene, ReplayScene, CutScene]
  });
  window.__SCC2 = g;
  return g;
}
