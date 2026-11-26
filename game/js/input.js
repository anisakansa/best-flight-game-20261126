// Input for Skyline Cargo: keyboard for flying, mouse for menus.
// Arrow keys / WASD pitch and bank, W/S (or Shift/Ctrl) work the throttle,
// C drops the supply crate, M mutes, P pauses, R restarts a sortie.
// The game also reads a held mouse drag as a gentle bank, for pilots who
// prefer the mouse. Every key is read from the event, never from the clock.

export function makeInput() {
  return {
    keys: new Set(),
    pitch: 0,
    roll: 0,
    throttleDelta: 0,
    brake: false,
    dropCrate: false,
    mouseDown: false,
    mouseX: 0,
  };
}

const KEYMAP = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ShiftLeft: 'throttleUp',
  ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown',
  ControlRight: 'throttleDown',
  KeyC: 'crate',
  KeyM: 'mute',
  KeyP: 'pause',
  KeyR: 'restart',
  Space: 'brake',
  Enter: 'confirm',
  Escape: 'escape',
};

export function attachInput(input, canvas, handlers) {
  window.addEventListener('keydown', (event) => {
    const action = KEYMAP[event.code];
    if (!action) return;
    if (['up', 'down', 'left', 'right', 'brake'].includes(action)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    input.keys.add(action);
    if (action === 'crate') input.dropCrate = true;
    if (action === 'mute' && handlers.onMute) handlers.onMute();
    if (action === 'pause' && handlers.onPause) handlers.onPause();
    if (action === 'restart' && handlers.onRestart) handlers.onRestart();
    if (action === 'confirm' && handlers.onConfirm) handlers.onConfirm();
    if (action === 'escape' && handlers.onEscape) handlers.onEscape();
  });
  window.addEventListener('keyup', (event) => {
    const action = KEYMAP[event.code];
    if (action) input.keys.delete(action);
  });
  canvas.addEventListener('mousedown', (event) => {
    input.mouseDown = true;
    input.mouseX = event.clientX;
  });
  window.addEventListener('mouseup', () => {
    input.mouseDown = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (input.mouseDown) input.mouseX = event.clientX;
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouseDown = false;
  });
}

// Read the held keys into a flight control frame. Called once per step.
export function readFlightControls(input, canvasWidth) {
  const keys = input.keys;
  let pitch = 0;
  let roll = 0;
  if (keys.has('up')) pitch += 1;
  if (keys.has('down')) pitch -= 1;
  if (keys.has('left')) roll -= 1;
  if (keys.has('right')) roll += 1;
  if (input.mouseDown && canvasWidth > 0) {
    // Dragging left or right of centre banks gently that way.
    const offset = (input.mouseX - canvasWidth / 2) / (canvasWidth / 2);
    roll += Math.max(-1, Math.min(1, offset * 1.4));
  }
  let throttleDelta = 0;
  if (keys.has('throttleUp')) throttleDelta += 1;
  if (keys.has('throttleDown')) throttleDelta -= 1;
  const controls = {
    pitch,
    roll: Math.max(-1, Math.min(1, roll)),
    throttleDelta,
    brake: keys.has('brake'),
  };
  return controls;
}

export function consumeDropCrate(input) {
  const dropped = input.dropCrate;
  input.dropCrate = false;
  return dropped;
}
