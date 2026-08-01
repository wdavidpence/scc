import Phaser from 'phaser';
import { generateAllTextures } from '../game/proceduralTextures.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    generateAllTextures(this);
    this.scene.start('PreloadScene');
  }

  shutdown() {
    // BootScene is transient — nothing to clean up.
  }
}
