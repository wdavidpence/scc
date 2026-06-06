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

  // Track whether the user is currently interacting via touch
  let lastPointerId = -1;
  let lastPointerTime = 0;

  const onTouchStart = (pointer) => {
    lastPointerId = pointer.id;
    lastPointerTime = scene.time.now;
  };

  const isTouchActive = () => {
    if (lastPointerId < 0) return false;
    // Touch is considered "active" for 200ms after last pointer down
    return (scene.time.now - lastPointerTime) < 200;
  };

  // Vertical bounds for the touch-active zone (between HUD top and action bar bottom)
  const TOUCH_ACTIVE_TOP = 70;
  const TOUCH_ACTIVE_BOTTOM_OFFSET = 190;

  const getTouchState = () => {
    const activePointers = scene.input.activePointers.filter(
      (p) => p.y > TOUCH_ACTIVE_TOP && p.y < scene.scale.height - TOUCH_ACTIVE_BOTTOM_OFFSET,
    );
    return {
      active: isTouchActive(),
      pointerCount: activePointers.length,
      lastPointerId
    };
  };

  // Register touch listeners
  scene.input.on('pointerdown', onTouchStart);

  return {
    getKeyboardVector,
    getTouchState,
    destroy() {
      // Phaser manages the keyboard objects with the scene lifecycle.
      scene.input.off('pointerdown', onTouchStart);
    }
  };
}
