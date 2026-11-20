// Side work in Costa Sol: the jobs Lena can pick up between story missions.
// Three activities, all optional, all paid in cash, all wired into the same
// world the missions use — no new screens, no new modes, just more city.
//
//   * Taxi fares: a passenger waits at a taxi stand (gold TAXI pin). Pull up
//     in any car, press E, drive them to the green flag, get paid + a tip.
//   * Hidden packages: eight small stashes tucked around the city (park,
//     plaza, beach, pier, garage, hospital, store, marina). Walk over one
//     on foot to pocket $25.
//   * Stunt jumps: three ramps on the long avenues. Cross one faster than
//     420 and the city pays $50 for the show.
//
// Nothing here can soft-lock a mission: fares time out, packages wait
// forever, and jumps only pay when Lena is already driving fast.

import { dist } from './city.js';

export const PACKAGE_REWARD = 25;
export const PACKAGE_TOTAL = 8;
export const TAXI_FARE_BASE = 60;
export const TAXI_TIME_LIMIT = 150;
export const TAXI_WAIT_LIMIT = 90;
export const TAXI_TIP = 20;
export const TAXI_TIP_TIME = 60;
export const JUMP_MIN_SPEED = 420;
export const JUMP_REWARD = 50;
export const JUMP_COOLDOWN = 6;

/** Fresh side-activity state for a new game. Spots come from the city. */
export function createSideState(city) {
  return {
    packages: (city.packageSpots || []).map((s) => ({ x: s.x, y: s.y, taken: false })),
    packagesFound: 0,
    taxi: {
      phase: 'idle', // idle -> waiting -> riding -> idle
      px: 0, py: 0, // where the passenger waits
      dx: 0, dy: 0, // where they want to go
      fare: 0,
      timer: 0, // seconds left on the current phase
      waitTimer: 10, // seconds until the next passenger appears
      standIndex: -1,
      faresDone: 0,
      earned: 0,
    },
    jumps: (city.jumpRamps || []).map((r) => ({ x: r.x, y: r.y, angle: r.angle, cooldown: 0 })),
    jumpsDone: 0,
    bestJumpSpeed: 0,
  };
}

/** Pick the taxi stand nearest to (x, y) that is not `exclude`. */
function pickStand(city, x, y, exclude) {
  const stands = city.taxiStands || [];
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < stands.length; i += 1) {
    if (i === exclude) continue;
    const d = dist(x, y, stands[i].x, stands[i].y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Pick a stand 500..1400 px from the player for the next passenger. */
function pickPassengerStand(city, x, y) {
  const stands = city.taxiStands || [];
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < stands.length; i += 1) {
    const d = dist(x, y, stands[i].x, stands[i].y);
    if (d > 450 && d < 1600 && d < bestD) { bestD = d; best = i; }
  }
  if (best < 0) best = pickStand(city, x, y, -1);
  return best;
}

/**
 * Step the side activities. `game` carries the player and the city. Returns
 * an event string for the main loop to announce: 'fare-waiting' when a new
 * passenger appears, 'fare-expired' when one gives up waiting, 'fare-late'
 * when a riding fare runs out of time, else null.
 */
export function updateSide(state, game, dt) {
  const taxi = state.taxi;
  for (const jump of state.jumps) {
    if (jump.cooldown > 0) jump.cooldown -= dt;
  }
  if (taxi.phase === 'idle') {
    taxi.waitTimer -= dt;
    if (taxi.waitTimer <= 0) {
      const stand = pickPassengerStand(game.city, game.player.x, game.player.y);
      if (stand >= 0) {
        const s = game.city.taxiStands[stand];
        taxi.phase = 'waiting';
        taxi.px = s.x;
        taxi.py = s.y;
        taxi.standIndex = stand;
        taxi.timer = TAXI_WAIT_LIMIT;
        return 'fare-waiting';
      }
      taxi.waitTimer = 8;
    }
    return null;
  }
  if (taxi.phase === 'waiting') {
    taxi.timer -= dt;
    if (taxi.timer <= 0) {
      taxi.phase = 'idle';
      taxi.waitTimer = 14;
      return 'fare-expired';
    }
    return null;
  }
  // Riding: the clock runs until the drop-off.
  taxi.timer -= dt;
  if (taxi.timer <= 0) {
    taxi.phase = 'idle';
    taxi.waitTimer = 14;
    return 'fare-late';
  }
  return null;
}

/**
 * Lena pulled up in a car and pressed E by the waiting passenger. The fare
 * starts: destination is another stand, the price grows with the distance.
 * Returns the fare in dollars, or 0 when there is no passenger to take.
 */
export function tryBoardTaxi(state, game, x, y) {
  const taxi = state.taxi;
  if (taxi.phase !== 'waiting') return 0;
  if (dist(x, y, taxi.px, taxi.py) > 90) return 0;
  const dest = pickStand(game.city, taxi.px, taxi.py, taxi.standIndex);
  const d = game.city.taxiStands[dest];
  taxi.dx = d.x;
  taxi.dy = d.y;
  const trip = Math.round(dist(taxi.px, taxi.py, d.x, d.y));
  taxi.fare = TAXI_FARE_BASE + Math.min(60, Math.round(trip / 20));
  taxi.phase = 'riding';
  taxi.timer = TAXI_TIME_LIMIT;
  return taxi.fare;
}

/**
 * Lena reached the green flag with a passenger aboard. Pays the fare, plus a
 * tip for a fast trip. Returns the dollars earned, or 0 when not a drop-off.
 */
export function taxiArrived(state, x, y) {
  const taxi = state.taxi;
  if (taxi.phase !== 'riding') return 0;
  if (dist(x, y, taxi.dx, taxi.dy) > 90) return 0;
  let pay = taxi.fare;
  if (taxi.timer > TAXI_TIME_LIMIT - TAXI_TIP_TIME) pay += TAXI_TIP;
  taxi.faresDone += 1;
  taxi.earned += pay;
  taxi.phase = 'idle';
  taxi.waitTimer = 16;
  return pay;
}

/** Walk over a hidden package on foot: pocket it. Returns $25 or 0. */
export function collectPackageAt(state, x, y) {
  for (const p of state.packages) {
    if (!p.taken && dist(x, y, p.x, p.y) < 38) {
      p.taken = true;
      state.packagesFound += 1;
      return PACKAGE_REWARD;
    }
  }
  return 0;
}

/**
 * A car crossed a stunt ramp at speed. Returns the speed in km/h-ish units
 * when it counts as a jump (and pays), else 0. The ramp then rests a few
 * seconds so one pass cannot pay twice.
 */
export function checkJump(state, car) {
  if (Math.abs(car.speed) < JUMP_MIN_SPEED) return 0;
  for (const jump of state.jumps) {
    if (jump.cooldown > 0) continue;
    if (dist(car.x, car.y, jump.x, jump.y) < 48) {
      jump.cooldown = JUMP_COOLDOWN;
      state.jumpsDone += 1;
      state.bestJumpSpeed = Math.max(state.bestJumpSpeed, Math.abs(car.speed));
      return Math.abs(car.speed);
    }
  }
  return 0;
}

/** Markers for the renderer and the minimap: packages, fares, ramps. */
export function sideMarkers(state) {
  const out = [];
  for (const p of state.packages) {
    if (!p.taken) out.push({ x: p.x, y: p.y, kind: 'package', label: 'Hidden package · $25' });
  }
  const taxi = state.taxi;
  if (taxi.phase === 'waiting') {
    out.push({ x: taxi.px, y: taxi.py, kind: 'taxi-wait', label: 'Taxi fare — pull up and press E' });
  } else if (taxi.phase === 'riding') {
    out.push({ x: taxi.dx, y: taxi.dy, kind: 'taxi-drop', label: `Drop the fare · $${taxi.fare}` });
  }
  for (const jump of state.jumps) {
    out.push({ x: jump.x, y: jump.y, kind: 'jump', label: 'Stunt jump · 420+ speed pays $50' });
  }
  return out;
}

/** One line for the HUD: what side work is open right now. */
export function sideStatusText(state) {
  const taxi = state.taxi;
  const parts = [`Packages ${state.packagesFound}/${PACKAGE_TOTAL}`];
  if (taxi.phase === 'waiting') parts.push(`TAXI fare waiting (${Math.ceil(taxi.timer)}s)`);
  else if (taxi.phase === 'riding') parts.push(`TAXI drop-off · $${taxi.fare} (${Math.ceil(taxi.timer)}s)`);
  if (state.jumpsDone > 0) parts.push(`Jumps ${state.jumpsDone}`);
  return parts.join(' · ');
}

/** Totals for the story-complete screen: side cash earned and jobs done. */
export function sideTotals(state) {
  return {
    earned: state.taxi.earned + state.packagesFound * PACKAGE_REWARD + state.jumpsDone * JUMP_REWARD,
    fares: state.taxi.faresDone,
    packages: state.packagesFound,
    jumps: state.jumpsDone,
  };
}

/** The side progress a save file keeps (save v3). */
export function sideSaveData(state) {
  return {
    packagesTaken: state.packages.map((p) => (p.taken ? 1 : 0)),
    taxiFares: state.taxi.faresDone,
    taxiEarned: state.taxi.earned,
    jumpsDone: state.jumpsDone,
    bestJumpSpeed: Math.round(state.bestJumpSpeed),
  };
}

/** Restore side progress from a save (v2 saves carry none: all defaults). */
export function applySideSave(state, data) {
  if (!data) return;
  if (Array.isArray(data.packagesTaken)) {
    state.packagesFound = 0;
    for (let i = 0; i < data.packagesTaken.length && i < state.packages.length; i += 1) {
      state.packages[i].taken = data.packagesTaken[i] === 1;
      if (state.packages[i].taken) state.packagesFound += 1;
    }
  }
  if (typeof data.taxiFares === 'number') state.taxi.faresDone = data.taxiFares;
  if (typeof data.taxiEarned === 'number') state.taxi.earned = data.taxiEarned;
  if (typeof data.jumpsDone === 'number') state.jumpsDone = data.jumpsDone;
  if (typeof data.bestJumpSpeed === 'number') state.bestJumpSpeed = data.bestJumpSpeed;
}
