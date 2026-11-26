// Flight model for Skyline Cargo: throttle, pitch, roll, speed, fuel and
// damage. The model is deliberately simple and readable: speed follows
// throttle with drag, the nose follows pitch, the wings bank into turns,
// and the aircraft stalls when it flies too slow. Fuel burns with throttle,
// damage comes from hard contact, and both turn a sortie into decisions.

export const FLIGHT = {
  maxSpeed: 96, // m/s, about 186 kt at full throttle
  cruiseSpeed: 62,
  stallSpeed: 26, // below this the nose drops and the wings stop answering
  minSpeed: 12,
  maxThrottle: 1,
  climbRate: 9.5, // m/s at full pitch up and cruise speed
  sinkRate: 6.5, // m/s gliding with the throttle closed
  turnRate: 0.55, // rad/s at full bank
  maxRoll: 0.9, // rad, about 52 degrees
  fuelCapacity: 100,
  fuelBurnFull: 0.55, // fuel units per second at full throttle
  fuelBurnIdle: 0.08,
  damageCapacity: 100,
};

export function makeAircraft() {
  return {
    x: 0,
    y: 24,
    z: 40,
    heading: 0, // radians, 0 = north (+z)
    pitch: 0, // radians, positive = nose up
    roll: 0, // radians, positive = bank right
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    fuel: FLIGHT.fuelCapacity,
    damage: 0,
    engineOut: false,
    landed: false,
    crashed: false,
    onGround: true,
  };
}

// One fixed step of the flight model (dt is always 1/60: deterministic).
// input: { pitch: -1..1, roll: -1..1, throttleDelta: -1..1, brake: bool }
// wind: { x: lateral m/s } — the storm mission's crosswind, a pure function
// of position, never of the clock.
export function stepFlight(plane, input, wind, dt) {
  if (plane.crashed || plane.landed) return plane;

  // Throttle: W/S nudge it, and it stays where the pilot leaves it.
  plane.throttle = clamp(
    plane.throttle + input.throttleDelta * dt * 0.9,
    0,
    FLIGHT.maxThrottle,
  );
  if (plane.fuel <= 0) {
    plane.throttle = 0;
    plane.engineOut = true;
  }

  // Speed chases the throttle setting; drag grows with speed squared.
  const targetSpeed = FLIGHT.minSpeed + plane.throttle * (FLIGHT.maxSpeed - FLIGHT.minSpeed);
  const drag = 0.55 + (plane.speed / FLIGHT.maxSpeed) * 0.9;
  plane.speed += (targetSpeed - plane.speed) * Math.min(1, drag * dt);
  if (input.brake) plane.speed = Math.max(FLIGHT.minSpeed, plane.speed - 26 * dt);

  // Roll: the wings bank toward the stick and level out when released.
  const targetRoll = input.roll * FLIGHT.maxRoll;
  plane.roll += (targetRoll - plane.roll) * Math.min(1, 3.2 * dt);

  // Pitch: the nose follows the stick, eased so it never snaps.
  const targetPitch = input.pitch * 0.22;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, 2.6 * dt);

  // Turning: heading follows bank, faster when the wings are level enough
  // to hold the turn and slower near the stall.
  const turnAuthority = clamp(plane.speed / FLIGHT.cruiseSpeed, 0.25, 1);
  plane.heading += plane.roll * FLIGHT.turnRate * turnAuthority * dt;

  // Stall: below stall speed the nose drops on its own and the controls go
  // soft, so the pilot must trade altitude for speed to recover.
  const stalled = plane.speed < FLIGHT.stallSpeed;
  let climb = Math.sin(plane.pitch) * plane.speed * 0.9;
  if (stalled) climb -= (FLIGHT.stallSpeed - plane.speed) * 0.35;
  if (plane.throttle < 0.05) climb -= FLIGHT.sinkRate * 0.4;
  plane.verticalSpeed = climb;
  plane.y += climb * dt;

  // Wind pushes the aircraft sideways; the pilot corrects with bank.
  plane.x += wind.x * dt * 0.6;

  // Move forward along the heading.
  const forward = plane.speed * dt;
  plane.x += Math.sin(plane.heading) * forward;
  plane.z += Math.cos(plane.heading) * forward;

  // Fuel: full throttle drinks, idle sips, and the gauge is the mission.
  const burn = FLIGHT.fuelBurnIdle + plane.throttle * (FLIGHT.fuelBurnFull - FLIGHT.fuelBurnIdle);
  plane.fuel = Math.max(0, plane.fuel - burn * dt);

  return plane;
}

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

// Landing quality: a touchdown only counts when the pilot is over a strip,
// lined up with it, slow enough, and sinking gently. Anything else is a
// crash or a bounce. Returns 'perfect' | 'firm' | 'hard' | 'crash' | null.
export function evaluateTouchdown(plane, strip, groundHeight) {
  const overStrip =
    Math.abs(plane.x - strip.x) < strip.halfWidth &&
    plane.z > strip.zStart &&
    plane.z < strip.zEnd;
  if (!overStrip) return null;
  if (plane.y > groundHeight + 3) return null;
  const headingError = Math.abs(normalizeAngle(plane.heading - strip.heading));
  const sink = -plane.verticalSpeed;
  if (headingError > 0.28 || plane.speed > 62 || sink > 9) return 'crash';
  if (sink > 5.5 || plane.speed > 48 || headingError > 0.16) return 'hard';
  if (sink > 3.2 || plane.speed > 38 || headingError > 0.08) return 'firm';
  return 'perfect';
}

export function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// Damage from a hard touchdown or a terrain strike. Returns the new damage.
export function applyDamage(plane, amount) {
  plane.damage = Math.min(FLIGHT.damageCapacity, plane.damage + amount);
  if (plane.damage >= FLIGHT.damageCapacity) plane.crashed = true;
  return plane.damage;
}

// Knots for the HUD: the pilot reads speed in knots, altitude in feet.
export function toKnots(mps) {
  return Math.round(mps * 1.94384);
}

export function toFeet(metres) {
  return Math.round(metres * 3.28084);
}
