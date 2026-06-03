import Phaser from 'phaser';
import { SCENE_LIST } from './scenes.js';

export function createGame() {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#07111c',
    transparent: false,
    pixelArt: true,
    antialias: false,
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
    scene: SCENE_LIST
  });
}
