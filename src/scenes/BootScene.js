import Phaser from 'phaser';
import { generateAllTextures } from '../game/proceduralTextures.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    // Generate all unit/building/resource textures procedurally.
    // This replaces the missing spritesheet assets so the game runs with zero external files.
    generateAllTextures(this);

    this.scene.start('PreloadScene');
  }

  shutdown() {
    // BootScene is transient — nothing to clean up.
  }
}
