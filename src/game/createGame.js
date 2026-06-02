import Phaser from 'phaser';
import BootScene from '../scenes/BootScene.js';
import PreloadScene from '../scenes/PreloadScene.js';
import MenuScene from '../scenes/TitleScene.js';
import BattleScene from '../scenes/GameScene.js';
import HudScene from '../scenes/HudScene.js';

export function createGame() {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#07111c',
    transparent: false,
    pixelArt: false,
    antialias: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%'
    },
    input: {
      activePointers: 5,
      gamepad: false
    },
    render: {
      antialiasGL: true,
      powerPreference: 'high-performance'
    },
    scene: [BootScene, PreloadScene, MenuScene, BattleScene, HudScene]
  });
}
