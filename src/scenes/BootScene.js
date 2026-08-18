import Phaser from 'phaser';
import { generateAllTextures } from '../game/proceduralTextures.js';
import { applyHdArt } from '../game/visuals/hdArt.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    generateAllTextures(this);
    applyHdArt(this);
    this.scene.start('PreloadScene');
  }

  shutdown() {
    // BootScene is transient — nothing to clean up.
  }
}
