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
import { districtInfo, districtTaxiMultiplier, districtPackageBonus, districtJumpBonus, controlledBonus } from './districts.js';
import { isNight, nightBonusMultiplier } from './daynight.js';

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

/** v4: a VIP fare (north districts) pays double; a night package pays $10 extra. */
export const VIP_FARE_MULTIPLIER = 2;
export const NIGHT_PACKAGE_BONUS = 10;
export const JUMP_COMBO_WINDOW = 8;
export const JUMP_COMBO_BONUS = 25;

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
    // v4: the running total of every side-work dollar actually paid out (fares
    // with their district/night/VIP multipliers, packages with their bonuses,
    // jumps with their combos) — the complete screen reads this, not a formula
    // that guesses the bonuses away.
    earnedTotal: 0,
    // v4: two more ramps on the north avenues, and the jump combo — two jumps
    // inside eight seconds pay $25 extra each, chained.
    extraJumps: [
      { x: 1400, y: 2200, angle: 0, cooldown: 0 },
      { x: 3800, y: 1400, angle: Math.PI / 2, cooldown: 0 },
    ],
    jumpCombo: 0,
    lastJumpAt: -999,
    lastJumpPay: 0,
    vipFares: 0,
    nightPackages: 0,
  };
}

/** All stunt ramps, city ones plus the two v4 extras, in one list. */
export function allJumpRamps(state) {
  return state.jumps.concat(state.extraJumps || []);
}

/** True when the point is in a north district (North Marina, North Plaza):
 * VIP fares start there, and they pay double. */
export function isVipDistrict(x, y) {
  const d = districtInfo(x, y);
  return d.id === 'marina' || d.id === 'plaza';
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
  for (const jump of allJumpRamps(state)) {
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
 * starts: destination is another stand, the price grows with the distance. A
 * fare picked up in a north district is a VIP fare: it pays double, and the
 * HUD says so. Returns the fare in dollars, or 0 when there is no passenger
 * to take.
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
  taxi.vip = isVipDistrict(taxi.px, taxi.py);
  if (taxi.vip) taxi.fare *= VIP_FARE_MULTIPLIER;
  taxi.phase = 'riding';
  taxi.timer = TAXI_TIME_LIMIT;
  return taxi.fare;
}

/**
 * Lena reached the green flag with a passenger aboard. Pays the fare, plus a
 * tip for a fast trip. The drop-off district multiplies it (the docks pay 20%
 * more, downtown 15%), a controlled district adds $5, and a night fare pays
 * 25% more. Returns the dollars earned, or 0 when not a drop-off.
 */
export function taxiArrived(state, x, y, clock, districts) {
  const taxi = state.taxi;
  if (taxi.phase !== 'riding') return 0;
  if (dist(x, y, taxi.dx, taxi.dy) > 90) return 0;
  let pay = taxi.fare;
  if (taxi.timer > TAXI_TIME_LIMIT - TAXI_TIP_TIME) pay += TAXI_TIP;
  pay = Math.round(pay * districtTaxiMultiplier(x, y));
  if (clock) pay = Math.round(pay * nightBonusMultiplier(clock));
  if (districts) pay += controlledBonus(districts, x, y);
  if (taxi.vip) state.vipFares += 1;
  taxi.faresDone += 1;
  taxi.earned += pay;
  state.earnedTotal += pay;
  taxi.phase = 'idle';
  taxi.waitTimer = 16;
  return pay;
}

/** Walk over a hidden package on foot: pocket it. Pays $25, plus the
 * district's package bonus, plus $10 at night, plus $5 in a controlled
 * district. `clock` and `districts` are optional (the old call shape still
 * pays the plain $25). Returns the dollars, or 0. */
export function collectPackageAt(state, x, y, clock, districts) {
  for (const p of state.packages) {
    if (!p.taken && dist(x, y, p.x, p.y) < 38) {
      p.taken = true;
      state.packagesFound += 1;
      let pay = PACKAGE_REWARD;
      pay += districtPackageBonus(x, y);
      if (clock && isNight(clock)) {
        pay += NIGHT_PACKAGE_BONUS;
        state.nightPackages += 1;
      }
      if (districts) pay += controlledBonus(districts, x, y);
      state.earnedTotal += pay;
      return pay;
    }
  }
  return 0;
}

/**
 * A car crossed a stunt ramp at speed. Returns the speed in km/h-ish units
 * when it counts as a jump (and pays), else 0. The ramp then rests a few
 * seconds so one pass cannot pay twice. Two jumps inside eight seconds chain
 * a combo: each chained jump pays $25 extra. The payout of the last jump is
 * kept in state.lastJumpPay (see jumpReward): the main loop adds that, not
 * the flat JUMP_REWARD, so the combo and the district bonus actually reach
 * Lena's wallet.
 */
export function checkJump(state, car) {
  if (Math.abs(car.speed) < JUMP_MIN_SPEED) return 0;
  for (const jump of allJumpRamps(state)) {
    if (jump.cooldown > 0) continue;
    if (dist(car.x, car.y, jump.x, jump.y) < 48) {
      jump.cooldown = JUMP_COOLDOWN;
      state.jumpsDone += 1;
      state.bestJumpSpeed = Math.max(state.bestJumpSpeed, Math.abs(car.speed));
      const now = state.jumpClock || 0;
      if (now - state.lastJumpAt < JUMP_COMBO_WINDOW) state.jumpCombo += 1;
      else state.jumpCombo = 0;
      state.lastJumpAt = now;
      state.lastJumpPay = JUMP_REWARD + state.jumpCombo * JUMP_COMBO_BONUS
        + districtJumpBonus(car.x, car.y);
      state.earnedTotal += state.lastJumpPay;
      return Math.abs(car.speed);
    }
  }
  return 0;
}

/** The payout of the last stunt jump: base $50, combo and district bonus. */
export function lastJumpPay(state) {
  return state.lastJumpPay || JUMP_REWARD;
}

/** Advance the jump combo clock (the main loop calls this with game time). */
export function tickJumpClock(state, elapsed) {
  state.jumpClock = elapsed;
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
  for (const jump of allJumpRamps(state)) {
    out.push({ x: jump.x, y: jump.y, kind: 'jump', label: 'Stunt jump · 420+ speed pays $50' });
  }
  return out;
}

/** One line for the HUD: what side work is open right now. */
export function sideStatusText(state) {
  const taxi = state.taxi;
  const parts = [`Packages ${state.packagesFound}/${PACKAGE_TOTAL}`];
  if (taxi.phase === 'waiting') parts.push(`TAXI fare waiting (${Math.ceil(taxi.timer)}s)`);
  else if (taxi.phase === 'riding') parts.push(`TAXI drop-off · $${taxi.fare}${taxi.vip ? ' VIP x2' : ''} (${Math.ceil(taxi.timer)}s)`);
  if (state.jumpsDone > 0) parts.push(`Jumps ${state.jumpsDone}${state.jumpCombo > 0 ? ` · combo x${state.jumpCombo + 1}` : ''}`);
  if (state.vipFares > 0) parts.push(`VIP fares ${state.vipFares}`);
  return parts.join(' · ');
}

/** Totals for the story-complete screen: side cash earned and jobs done. */
export function sideTotals(state) {
  return {
    earned: state.earnedTotal || 0,
    fares: state.taxi.faresDone,
    packages: state.packagesFound,
    jumps: state.jumpsDone,
    vipFares: state.vipFares || 0,
    nightPackages: state.nightPackages || 0,
    bestCombo: state.jumpCombo || 0,
  };
}

/** The side progress a save file keeps (save v3). v4 adds VIP fares, night
 * packages and the best jump combo. */
export function sideSaveData(state) {
  return {
    packagesTaken: state.packages.map((p) => (p.taken ? 1 : 0)),
    taxiFares: state.taxi.faresDone,
    taxiEarned: state.taxi.earned,
    jumpsDone: state.jumpsDone,
    bestJumpSpeed: Math.round(state.bestJumpSpeed),
    vipFares: state.vipFares || 0,
    nightPackages: state.nightPackages || 0,
    jumpCombo: state.jumpCombo || 0,
    earnedTotal: state.earnedTotal || 0,
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
  if (typeof data.vipFares === 'number') state.vipFares = data.vipFares;
  if (typeof data.nightPackages === 'number') state.nightPackages = data.nightPackages;
  if (typeof data.jumpCombo === 'number') state.jumpCombo = data.jumpCombo;
  if (typeof data.earnedTotal === 'number') state.earnedTotal = data.earnedTotal;
}
