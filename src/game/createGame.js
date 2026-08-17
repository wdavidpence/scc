import Phaser from 'phaser';
import { SCENE_LIST } from './scenes.js';

/**
 * Build the Phaser.Game configuration object.
 * Pure helper — no side effects, returns a config literal identical
 * to the one previously passed inline to `new Phaser.Game()`.
 */
export function buildGameConfig() {
  return {
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
    audio: {
      disableWebAudio: true
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false }
    },
    render: {
      antialiasGL: true,
      powerPreference: 'high-performance'
    },
    physics: {
      default: 'arcade',
      arcade: {
        debug: false
      }
    },
    scene: SCENE_LIST
  };
}

export function createGame() {
  const game = new Phaser.Game(buildGameConfig());
  if (typeof window !== 'undefined') window.__SCC_GAME__ = game;
  return game;
}
