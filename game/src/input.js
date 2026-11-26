// Keyboard input for Tradewind Courier: a held-key set plus edge-triggered
// actions (drop a crate, change camera, pause). The game reads the held
// keys every fixed step, so controls answer at every speed.

export function makeInput() {
  return {
    keys: new Set(),
    pressed: new Set(), // edge-triggered, consumed by the game each step
    anyKey: false,
  };
}

/** Key codes the game listens to. */
export const KEYMAP = {
  pitchUp: ['ArrowUp', 'KeyW'],
  pitchDown: ['ArrowDown', 'KeyS'],
  rollLeft: ['ArrowLeft', 'KeyA'],
  rollRight: ['ArrowRight', 'KeyD'],
  throttleUp: ['ShiftLeft', 'ShiftRight'],
  throttleDown: ['ControlLeft', 'ControlRight'],
  brake: ['Space'],
  drop: ['KeyB'],
  camera: ['KeyC'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  confirm: ['Enter'],
};

export function attachInput(input, element) {
  const down = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
    input.anyKey = true;
  };
  const up = (e) => {
    input.keys.delete(e.code);
  };
  element.addEventListener('keydown', down);
  element.addEventListener('keyup', up);
  element.addEventListener('blur', () => input.keys.clear());
}

export function isHeld(input, action) {
  return KEYMAP[action].some((code) => input.keys.has(code));
}

export function wasPressed(input, action) {
  return KEYMAP[action].some((code) => input.pressed.has(code));
}

export function clearPressed(input) {
  input.pressed.clear();
}

/** Control vector for one physics step, from the held keys. */
export function controlVector(input) {
  // ArrowUp climbs, ArrowDown descends: arcade mapping, not stick-back.
  const pitch = (isHeld(input, 'pitchUp') ? 1 : 0) + (isHeld(input, 'pitchDown') ? -1 : 0);
  const roll = (isHeld(input, 'rollLeft') ? -1 : 0) + (isHeld(input, 'rollRight') ? 1 : 0);
  const yaw = (isHeld(input, 'rollLeft') ? 0.4 : 0) + (isHeld(input, 'rollRight') ? -0.4 : 0);
  const throttleDelta = (isHeld(input, 'throttleUp') ? 0.55 : 0) + (isHeld(input, 'throttleDown') ? -0.55 : 0);
  return {
    pitch,
    roll,
    yaw,
    throttleDelta: throttleDelta / 60,
    brake: isHeld(input, 'brake'),
  };
}
