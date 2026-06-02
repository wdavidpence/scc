import Phaser from 'phaser';

export function createInputController(scene) {
  const cursorKeys = scene.input.keyboard.createCursorKeys();
  const wasd = scene.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D
  });

  const getKeyboardVector = () => {
    const vx = (cursorKeys.right.isDown || wasd.right.isDown ? 1 : 0) - (cursorKeys.left.isDown || wasd.left.isDown ? 1 : 0);
    const vy = (cursorKeys.down.isDown || wasd.down.isDown ? 1 : 0) - (cursorKeys.up.isDown || wasd.up.isDown ? 1 : 0);

    const vector = new Phaser.Math.Vector2(vx, vy);
    if (vector.lengthSq() > 0) {
      return vector.normalize();
    }

    return vector;
  };

  return {
    getKeyboardVector,
    destroy() {
      // Phaser manages the keyboard objects with the scene lifecycle.
    }
  };
}
