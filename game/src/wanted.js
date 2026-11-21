// The wanted level: five stars, earned by crime, lost by patience or by hiding.
// The higher it climbs, the more police cars the city throws at Lena — and the
// longer it takes to cool down. Sol Garage is the one place the heat cannot follow.

import { dist } from './city.js';

export const MAX_WANTED = 5;
export const DECAY_QUIET_SECONDS = 28;
export const DECAY_STEP_SECONDS = 9;
export const HIDEOUT_CLEAR_SECONDS = 3;

/**
 * Heat tuning (v3): hotter chases are harder to shake. The quiet time before
 * the first star drops grows with the level (28 s at one star, +6 s a star),
 * each star then takes longer to cool (+2 s a star past the second), and
 * cruisers arrive faster the hotter it gets. At five stars the city fields
 * five cars instead of four.
 */
export function quietSecondsFor(level) {
  return DECAY_QUIET_SECONDS + Math.max(0, level - 1) * 6;
}

export function decayStepFor(level) {
  return DECAY_STEP_SECONDS + Math.max(0, level - 2) * 2;
}

/** Seconds between police spawns: 1.2 s at one star, down to 0.6 s at five. */
export function policeSpawnInterval(level) {
  return Math.max(0.6, 1.2 - Math.max(0, level - 1) * 0.15);
}

/** Progress 0..1 toward clearing the heat inside the hideout (HUD hint). */
export function hideoutProgress(wanted) {
  return Math.min(1, wanted.hideoutTimer / HIDEOUT_CLEAR_SECONDS);
}

export function createWanted() {
  return {
    level: 0,
    sinceCrime: 999, // seconds since the last crime
    decayTimer: 0, // counts down to the next star lost
    hideoutTimer: 0, // seconds spent inside the garage zone
    seenByPolice: false,
  };
}

/** Add stars for a crime, up to the five-star cap. Resets the quiet clock. */
export function addWanted(wanted, stars) {
  wanted.level = Math.min(MAX_WANTED, wanted.level + stars);
  wanted.sinceCrime = 0;
  wanted.decayTimer = decayStepFor(wanted.level);
}

/** Set the wanted level outright (mission 6 opens at four stars). */
export function setWanted(wanted, stars) {
  wanted.level = Math.max(0, Math.min(MAX_WANTED, stars));
  wanted.sinceCrime = 0;
  wanted.decayTimer = decayStepFor(wanted.level);
}

/** Clear the heat entirely (busted, wasted, or a clean hideout escape). */
export function clearWanted(wanted) {
  wanted.level = 0;
  wanted.sinceCrime = 999;
  wanted.decayTimer = 0;
  wanted.hideoutTimer = 0;
}

/** How many police cars the city fields at this heat. */
export function policeTargetCount(level) {
  if (level <= 0) return 0;
  if (level === 1) return 1;
  if (level === 2) return 2;
  if (level === 3) return 3;
  if (level === 4) return 4;
  return 5; // five stars: the whole city is on her tail
}

/** Plain-language name for a wanted level, for announcements and the HUD. */
export function heatLevelName(level) {
  if (level <= 0) return 'Clean';
  if (level === 1) return 'Heat';
  if (level === 2) return 'Hot';
  if (level === 3) return 'Blazing';
  if (level === 4) return 'Inferno';
  return 'Lockdown';
}

/**
 * Step the wanted level. `police` are the active police cars, `hideout` is the
 * garage zone, `pos` is Lena's position. `slowDecay` (v4) is true while a
 * district raid runs where she is: the heat then cools a third slower.
 * Returns 'cooled' when a star drops, 'hidden' when the garage clears the
 * heat, else null.
 */
export function updateWanted(wanted, dt, pos, police, hideout, slowDecay) {
  wanted.sinceCrime += dt;
  // Is any cop close enough to see her right now?
  wanted.seenByPolice = false;
  for (const cop of police) {
    if (dist(cop.x, cop.y, pos.x, pos.y) < 520) {
      wanted.seenByPolice = true;
      break;
    }
  }
  if (wanted.level === 0) {
    wanted.hideoutTimer = 0;
    return null;
  }
  // Hiding in the garage burns the whole heat off: the garage is the one place
  // the heat cannot follow, so the timer runs even while a cruiser is still
  // circling outside — otherwise an 'escape' objective could never complete
  // while police stay within sight range. Takes 3 seconds inside the zone.
  const inHideout = dist(pos.x, pos.y, hideout.x, hideout.y) < hideout.r;
  if (inHideout) {
    wanted.hideoutTimer += dt;
    if (wanted.hideoutTimer >= HIDEOUT_CLEAR_SECONDS) {
      clearWanted(wanted);
      return 'hidden';
    }
    return null;
  }
  wanted.hideoutTimer = 0;
  // Quiet and unseen: the heat cools off one star at a time. Hotter chases
  // need longer quiet (quietSecondsFor) and cool slower (decayStepFor).
  if (wanted.sinceCrime > quietSecondsFor(wanted.level) && !wanted.seenByPolice) {
    wanted.decayTimer -= dt * (slowDecay ? 0.66 : 1);
    if (wanted.decayTimer <= 0) {
      wanted.level -= 1;
      wanted.decayTimer = decayStepFor(wanted.level);
      if (wanted.level === 0) {
        wanted.sinceCrime = 999;
        return 'cooled';
      }
      return 'cooled';
    }
  }
  return null;
}

// ------------------------------------------------- v4 police tactics

/** Fresh police-tactics state: roadblocks, spike strips, and their clocks. */
export function createPoliceTactics() {
  return {
    roadblockCars: [], // the two cruisers of the live roadblock, if any
    roadblockTimer: 40, // seconds until the next roadblock may form
    roadblockLife: 0, // seconds the live roadblock has left
    spikeStrips: [], // { x, y, angle, life } on the road ahead
    spikeTimer: 18, // seconds until the next spike strip may drop
  };
}

/**
 * Extra cruisers a district's police presence adds while the heat is on: a
 * presence-4 district fields one more car, presence-5 fields two. The main
 * loop adds this to policeTargetCount, so a hot district is visibly hotter
 * than a quiet one.
 */
export function districtPatrolCount(level, policePresence) {
  if (level <= 0) return 0;
  if (policePresence >= 5) return 2;
  if (policePresence >= 4) return 1;
  return 0;
}

/** Faster cruiser arrivals while a district raid is live. */
export function raidSpawnInterval(level) {
  return Math.max(0.4, policeSpawnInterval(level) * 0.6);
}

/** The heat cools slower during a raid: each star takes half as long again. */
export function decayStepDuringRaid(level) {
  return decayStepFor(level) * 1.5;
}

/**
 * Form a roadblock: two cruisers parked across the road ahead of Lena, nose
 * to tail, blocking the lane. They sit in game.cars (not game.police), so the
 * police AI never drives them away — they are an obstacle, and the car-vs-car
 * collision code does the rest. Returns true when one formed.
 */
export function formRoadblock(tactics, game) {
  if (tactics.roadblockCars.length > 0) return false;
  if (game.wanted.level < 3) return false;
  const px = game.player.car ? game.player.car.x : game.player.x;
  const py = game.player.car ? game.player.car.y : game.player.y;
  const angle = game.player.car ? game.player.car.angle : game.player.angle;
  // 420 px ahead, across the road: two cruisers side by side.
  const cx = px + Math.cos(angle) * 420;
  const cy = py + Math.sin(angle) * 420;
  const perp = angle + Math.PI / 2;
  for (const side of [-1, 1]) {
    const car = createPoliceCarAt(cx + Math.cos(perp) * 26 * side, cy + Math.sin(perp) * 26 * side, perp);
    car.roadblock = true;
    game.cars.push(car);
    tactics.roadblockCars.push(car);
  }
  tactics.roadblockLife = 30;
  return true;
}

/** One parked cruiser for a roadblock: stationary, lights on, in the way. */
function createPoliceCarAt(x, y, angle) {
  return {
    x, y, angle, speed: 0,
    kind: 'police', color: '#20242c', vclass: 'police',
    topSpeed: 700, accel: 540, turnRate: 3.0, mass: 1.5, w: 48, h: 24,
    health: 100, lane: 0, turnAt: 0, stopped: 0,
    ramCooldown: 0, siren: true, skid: 0, smoke: 0, wallCooldown: 0,
    dead: false, fade: 0, roadblock: true,
  };
}

/** Clear the live roadblock (heat gone, or its 30 seconds are up). */
export function clearRoadblock(tactics, game) {
  for (const car of tactics.roadblockCars) {
    const i = game.cars.indexOf(car);
    if (i >= 0) game.cars.splice(i, 1);
  }
  tactics.roadblockCars = [];
  tactics.roadblockLife = 0;
}

/**
 * Drop a spike strip on the road ahead of Lena: a dark strip across the lane
 * that shreds her tyres. One strip at a time, only at four stars and up, and
 * only while she is moving — a parked car cannot be spiked.
 */
export function dropSpikeStrip(tactics, game) {
  if (game.wanted.level < 4) return false;
  if (tactics.spikeStrips.length > 0) return false;
  const car = game.player.car;
  if (!car || Math.abs(car.speed) < 120) return false;
  const x = car.x + Math.cos(car.angle) * 300;
  const y = car.y + Math.sin(car.angle) * 300;
  tactics.spikeStrips.push({ x, y, angle: car.angle + Math.PI / 2, life: 25 });
  return true;
}

/**
 * Lena's car crossed a spike strip: the tyres go, the car slows hard, and the
 * strip is spent. Returns true when a strip was hit (the caller floats the
 * warning and plays the crash).
 */
export function checkSpikeStrips(tactics, game) {
  const car = game.player.car;
  if (!car) return false;
  for (let i = tactics.spikeStrips.length - 1; i >= 0; i -= 1) {
    const s = tactics.spikeStrips[i];
    // Across the strip (the strip lies perpendicular to the road).
    const dx = car.x - s.x;
    const dy = car.y - s.y;
    const along = dx * Math.cos(s.angle) + dy * Math.sin(s.angle);
    const across = -dx * Math.sin(s.angle) + dy * Math.cos(s.angle);
    if (Math.abs(along) < 30 && Math.abs(across) < 14 && Math.abs(car.speed) > 80) {
      car.speed *= 0.35;
      car.health -= 8;
      car.smoke = Math.min(1, car.smoke + 0.5);
      tactics.spikeStrips.splice(i, 1);
      return true;
    }
  }
  return false;
}

/**
 * Step the police tactics, once per frame. Roadblocks form at three stars and
 * up, about every 40 seconds, and live for 30; spike strips drop at four stars
 * and up, about every 18 seconds, and fade after 25. Returns an event for the
 * announcer ('roadblock' / 'spikes') or null.
 */
export function updatePoliceTactics(tactics, game, dt) {
  for (let i = tactics.spikeStrips.length - 1; i >= 0; i -= 1) {
    tactics.spikeStrips[i].life -= dt;
    if (tactics.spikeStrips[i].life <= 0) tactics.spikeStrips.splice(i, 1);
  }
  if (game.wanted.level === 0) {
    if (tactics.roadblockCars.length > 0) clearRoadblock(tactics, game);
    tactics.spikeStrips = [];
    return null;
  }
  if (tactics.roadblockCars.length > 0) {
    tactics.roadblockLife -= dt;
    if (tactics.roadblockLife <= 0) {
      clearRoadblock(tactics, game);
      tactics.roadblockTimer = 40;
    }
  } else {
    tactics.roadblockTimer -= dt;
    if (tactics.roadblockTimer <= 0) {
      tactics.roadblockTimer = 40;
      if (formRoadblock(tactics, game)) return 'roadblock';
    }
  }
  tactics.spikeTimer -= dt;
  if (tactics.spikeTimer <= 0) {
    tactics.spikeTimer = 18;
    if (dropSpikeStrip(tactics, game)) return 'spikes';
  }
  return null;
}

/** Markers for the renderer: the live roadblock cars and spike strips. */
export function policeTacticMarkers(tactics) {
  const out = [];
  for (const s of tactics.spikeStrips) {
    out.push({ x: s.x, y: s.y, angle: s.angle, kind: 'spikes', label: 'Spike strip — slow down!' });
  }
  return out;
}
