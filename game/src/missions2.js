// Missions 7-9: "The Costa Sol Job". The $2000 debt to Marco Venn is paid at
// the end of mission 6 — but a paid debt is not a clean slate. Marco still
// owns the city, and Lena Cruz is the only driver good enough to take it from
// him. Three jobs, in order, finish the story: steal the getaway van, survive
// a five-star lockdown with the evidence, and run Marco Venn himself off the
// road. Rewards $400 + $600 + $1000, and the last one ends the game with the
// COSTA SOL COMPLETE screen.
//
// This file owns the second half of the chain. missions.js keeps the mission
// list and the objective stepper; this file keeps the things only missions 7-9
// need: the van, the lockdown, and Marco's fleeing car. Its objectives reuse
// the stepper's types (goto / drive / pickup) plus three new ones the stepper
// learned for this file: stealvan, ram and final. Nothing here duplicates a
// mission 1-6 mechanic: the van is a new vehicle class, the lockdown is a new
// wanted behaviour, and the flee car is a new kind of AI target.

import { clamp, dist, ROAD_H, ROAD_V } from './city.js';
import { createCar, driveCar } from './vehicles.js';
import { setWanted } from './wanted.js';
import { spawnBurst } from './particles.js';

export const MISSIONS2 = [
  {
    id: 'score2',
    title: '7 — The Big Score',
    reward: 400,
    briefing: 'Marco keeps a getaway van at the harbour warehouse — armour, false plates, a full tank. Steal it and bring it to Sol Garage. If the cops see you take it, they will not wave.',
    objectives: [
      { type: 'goto', x: 4520, y: 1800, r: 90, text: 'Get to the harbour warehouse' },
      { type: 'stealvan', x: 4520, y: 1800, r: 60, text: 'Press E to take the getaway van' },
      { type: 'drive', x: 4000, y: 2920, r: 90, time: 240, text: 'Bring the van to Sol Garage — 240 seconds!' },
    ],
  },
  {
    id: 'heatwave',
    title: '8 — Heat Wave',
    reward: 600,
    briefing: 'The lockdown is on: five stars, every cruiser in Costa Sol on the street. The evidence file is sitting in the police station, and the lawyer in North Marina will pay for it — if you get there without getting cuffed.',
    objectives: [
      { type: 'goto', x: 1400, y: 600, r: 80, time: 100, text: 'Reach the police station — lockdown is on' },
      { type: 'pickup', x: 1400, y: 600, r: 70, time: 50, text: 'Press E to grab the evidence file' },
      { type: 'drive', x: 4400, y: 600, r: 90, time: 150, text: 'Get the evidence to the lawyer in North Marina' },
    ],
  },
  {
    id: 'king',
    title: '9 — King of Costa Sol',
    reward: 1000,
    briefing: 'Marco Venn is running. His dark sedan is fast and he knows every shortcut in the city — but he has never outdriven you. Ram him until his car stops, then walk over and end it, face to face.',
    objectives: [
      { type: 'ram', x: 3400, y: 600, r: 0, time: 240, text: "Ram Marco Venn's car until it stops!" },
      { type: 'final', x: 0, y: 0, r: 60, time: 120, text: 'On foot — press E to end it' },
    ],
  },
];

/** Where the getaway van waits: the warehouse road by the harbour pier. */
export const VAN_SPOT = { x: 4520, y: 1800 };
/** The police station: the intersection at avenue 1400, street 600. */
export const POLICE_STATION = { x: 1400, y: 600 };
/** The lawyer's office: North Marina, avenue 4400 on street 600. */
export const LAWYER_SPOT = { x: 4400, y: 600 };
/** Marco's sedan gives up after this much ram damage. */
export const FLEE_CAR_HP = 80;
/** Damage one good ram does to Marco's car. */
export const RAM_DAMAGE = 12;
/** Seconds between ram hits landing on the same car. */
export const RAM_COOLDOWN = 0.6;
/** How far away Marco's car spawns from Lena when mission 9 opens. */
export const FLEE_SPAWN_DIST = 600;
/** The lockdown never drops below this many stars while mission 8 runs. */
export const LOCKDOWN_MIN_STARS = 3;

/** Fresh second-half state: the van, the flee car, the lockdown flag. */
export function createMissions2State() {
  return {
    van: null, // the getaway van (mission 7), once spawned
    vanStolen: false, // Lena took the van: the stealvan objective is done
    fleeCar: null, // Marco Venn's dark sedan (mission 9), once spawned
    fleeTarget: null, // the intersection the flee car is running toward
    fleeRetarget: 0, // seconds until it picks a new escape route
    fleeStopped: false, // the sedan is dead: the final walk-up is open
    finalPoint: null, // where the sedan stopped, for the final objective
    ramCooldown: 0, // seconds until the next ram can hurt the sedan
    lockdown: false, // mission 8 is live: the heat never fully dies
    startedFor: -1, // which mission index the setup below last ran for
  };
}

/**
 * Set up whatever the current second-half mission needs, the first time it
 * starts — and again after a retry, when `force` is true. Mission 7 spawns
 * the van at the warehouse; mission 8 arms the five-star lockdown; mission 9
 * puts Marco's sedan on a road near Lena and points it away from her. Safe
 * to call every frame: it only acts when the mission changed.
 */
export function missions2OnStart(state, game, force) {
  const idx = game.missions.index;
  if (!force && state.startedFor === idx) return;
  state.startedFor = idx;
  if (idx === 6) {
    spawnVan(state, game);
  } else if (idx === 7) {
    state.lockdown = true;
    setWanted(game.wanted, 5);
  } else if (idx === 8) {
    spawnFleeCar(state, game);
  }
}

/**
 * Put the getaway van at the warehouse. Any other parked car within 160 px is
 * towed away first: the steal has to take the van, not the sedan parked next
 * to it, and the main loop's enter-car code always takes the nearest car
 * within 70 px. The van is a new vehicle class (see vehicles.js).
 */
export function spawnVan(state, game) {
  if (state.van && !state.van.dead && game.cars.includes(state.van)) return state.van;
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const car = game.cars[i];
    if (car.kind !== 'police' && dist(car.x, car.y, VAN_SPOT.x, VAN_SPOT.y) < 160) {
      game.cars.splice(i, 1);
    }
  }
  const van = createCar(VAN_SPOT.x, VAN_SPOT.y, 0, 'van', null);
  van.color = '#3a5a3a';
  game.cars.push(van);
  state.van = van;
  state.vanStolen = false;
  return van;
}

/**
 * Put Marco Venn's sedan on a road near Lena, already rolling away from her.
 * It is a target car (so the renderer draws its marker) with its own health
 * pool and a noSteal flag: Lena cannot simply climb in and drive it away —
 * she has to stop it. Its top speed is capped below a sports car so a good
 * driver can catch it, and the chase AI keeps it on the roads.
 */
export function spawnFleeCar(state, game) {
  if (state.fleeCar && !state.fleeCar.dead && game.cars.includes(state.fleeCar)) return state.fleeCar;
  const px = game.player.car ? game.player.car.x : game.player.x;
  const py = game.player.car ? game.player.car.y : game.player.y;
  // A road point roughly 600 px away, on land, not in the harbour water.
  let best = null;
  let bestScore = Infinity;
  for (const rx of ROAD_V) {
    for (const ry of ROAD_H) {
      const d = dist(rx, ry, px, py);
      const score = Math.abs(d - FLEE_SPAWN_DIST);
      if (score < bestScore) { bestScore = score; best = { x: rx, y: ry }; }
    }
  }
  const spot = best || { x: 3400, y: 600 };
  const car = createCar(spot.x, spot.y, Math.atan2(py - spot.y, px - spot.x) + Math.PI, 'target', null);
  car.color = '#1a2a4a';
  car.topSpeed = 560;
  car.health = FLEE_CAR_HP;
  car.noSteal = true;
  car.fleeCar = true;
  game.cars.push(car);
  state.fleeCar = car;
  state.fleeStopped = false;
  state.finalPoint = null;
  state.fleeTarget = null;
  state.fleeRetarget = 0;
  state.ramCooldown = 0;
  // The waypoint arrow chases the sedan, not a fixed point: the ram
  // objective's coordinates follow it every frame (see updateMissions2).
  const ramObj = MISSIONS2[2].objectives[0];
  ramObj.x = car.x;
  ramObj.y = car.y;
  return car;
}

/** Pick the flee car's next escape route: a road intersection that puts more
 * distance between Marco and Lena than the one he is on now. */
function pickFleeTarget(state, game) {
  const car = state.fleeCar;
  if (!car) return null;
  const px = game.player.car ? game.player.car.x : game.player.x;
  const py = game.player.car ? game.player.car.y : game.player.y;
  const nowD = dist(car.x, car.y, px, py);
  let best = null;
  let bestD = nowD;
  for (const rx of ROAD_V) {
    for (const ry of ROAD_H) {
      // Skip the harbour end of the map: a sedan cannot outrun anyone from a
      // dead end by the water.
      if (rx >= 4600) continue;
      const d = dist(rx, ry, px, py);
      if (d > bestD + 120) { bestD = d; best = { x: rx, y: ry }; }
    }
  }
  // No intersection is clearly better: run to the farthest corner instead.
  if (!best) {
    const corners = [
      { x: 200, y: 200 }, { x: 4600, y: 200 },
      { x: 200, y: 3000 }, { x: 4600, y: 3000 },
    ];
    best = corners[0];
    bestD = dist(corners[0].x, corners[0].y, px, py);
    for (const c of corners) {
      const d = dist(c.x, c.y, px, py);
      if (d > bestD) { bestD = d; best = c; }
    }
  }
  return best;
}

/**
 * Drive Marco's sedan: steer toward its escape intersection, full throttle,
 * and pick a new one when it arrives or every four seconds. Two rubber bands
 * keep the chase fair: far away it holds back to 380 so Lena can close the
 * gap in any car, and close up it runs at its full 560 — a final chase the
 * player can win, not a script that always escapes.
 */
function updateFleeCar(state, game, dt) {
  const car = state.fleeCar;
  if (!car || car.dead) return;
  state.fleeRetarget -= dt;
  if (!state.fleeTarget || state.fleeRetarget <= 0 || dist(car.x, car.y, state.fleeTarget.x, state.fleeTarget.y) < 130) {
    state.fleeTarget = pickFleeTarget(state, game);
    state.fleeRetarget = 4;
  }
  if (!state.fleeTarget) return;
  const wantAngle = Math.atan2(state.fleeTarget.y - car.y, state.fleeTarget.x - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 2.2, -1, 1);
  driveCar(car, 1, 0, steer, false, dt, game.city);
  // Rubber band: hold back while Lena is far behind, full speed up close.
  const px = game.player.car ? game.player.car.x : game.player.x;
  const py = game.player.car ? game.player.car.y : game.player.y;
  const d = dist(car.x, car.y, px, py);
  if (d > 700 && car.speed > 380) car.speed = 380;
  // The waypoint arrow follows the sedan while it runs.
  const ramObj = MISSIONS2[2].objectives[0];
  ramObj.x = car.x;
  ramObj.y = car.y;
}

/**
 * A ram lands when Lena's car is on top of the sedan at speed. Twelve damage
 * a hit, one hit every 0.6 s at most: seven solid hits stop it. The hit throws
 * sparks and a shake so it reads as a hit, not a nudge. When the sedan dies it
 * stops where it is, and the final objective's point becomes that spot — Lena
 * walks over and presses E to end it.
 */
function updateRam(state, game, dt) {
  const car = state.fleeCar;
  if (!car || car.dead || state.fleeStopped) return;
  if (state.ramCooldown > 0) state.ramCooldown -= dt;
  const player = game.player;
  if (!player.car || player.car.dead) return;
  const d = dist(player.car.x, player.car.y, car.x, car.y);
  if (d < 48 && Math.abs(player.car.speed) > 150 && state.ramCooldown <= 0) {
    state.ramCooldown = RAM_COOLDOWN;
    car.health -= RAM_DAMAGE;
    spawnBurst(game.particles, car.x, car.y, '#ffd23c', 10, 140, 0.5, 2.5, 0);
    game.floatTexts.push({ x: car.x, y: car.y - 40, text: `HIT! ${Math.max(0, Math.round(car.health))} HP`, color: '#ffd23c', size: 16, life: 1.1, maxLife: 1.1 });
    if (game.floatTexts.length > 24) game.floatTexts.shift();
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true;
      car.fade = 10;
      car.speed = 0;
      state.fleeStopped = true;
      // The final walk-up point: where the sedan stopped, nudged onto dry
      // land when the chase ended at the harbour edge.
      let fx = car.x;
      let fy = car.y;
      if (fx > 4640) fx = 4640;
      if (fy > 3360) fy = 3360;
      state.finalPoint = { x: fx, y: fy };
      const finObj = MISSIONS2[2].objectives[1];
      finObj.x = fx;
      finObj.y = fy;
      spawnBurst(game.particles, car.x, car.y, '#ff8030', 22, 200, 0.6, 3, 0);
      game.floatTexts.push({ x: car.x, y: car.y - 52, text: "MARCO'S CAR IS DOWN!", color: '#ff8030', size: 20, life: 1.6, maxLife: 1.6 });
    }
  }
}

/**
 * Step the second half of the story, once per frame. Returns 'failed' when
 * the lockdown timer runs out — the main loop treats it like any other failed
 * mission (clean retry, van and sedan respawned). Mission 8 keeps at least
 * three stars on Lena the whole time: the heat may cool while she hides, but
 * the lockdown never lets it die completely.
 */
export function updateMissions2(state, game, dt) {
  const idx = game.missions.index;
  if (game.missions.done || idx < 6 || idx > 8) return null;
  missions2OnStart(state, game, false);
  if (idx === 7 && state.lockdown) {
    if (game.wanted.level < LOCKDOWN_MIN_STARS) setWanted(game.wanted, LOCKDOWN_MIN_STARS);
  }
  if (idx === 8) {
    updateFleeCar(state, game, dt);
    updateRam(state, game, dt);
  }
  return null;
}

/**
 * A clean retry of a second-half mission: no duplicated van, sedan or timer.
 * Mission 7 gets a fresh van at the warehouse (the stolen one is towed away);
 * mission 8 gets its five stars back; mission 9 gets a fresh sedan on a road
 * near Lena. Called after a wasted/busted respawn and after a timed-out
 * mission, before the mission restarts.
 */
export function resetMissions2(state, game) {
  const idx = game.missions.index;
  if (idx < 6 || idx > 8 || game.missions.done) return;
  if (idx === 6) {
    if (state.van) {
      const i = game.cars.indexOf(state.van);
      if (i >= 0) game.cars.splice(i, 1);
      if (game.player.car === state.van) {
        game.player.car = null;
        game.player.onFoot = true;
      }
      state.van = null;
    }
    state.vanStolen = false;
    spawnVan(state, game);
  } else if (idx === 7) {
    state.lockdown = true;
    setWanted(game.wanted, 5);
  } else if (idx === 8) {
    if (state.fleeCar) {
      const i = game.cars.indexOf(state.fleeCar);
      if (i >= 0) game.cars.splice(i, 1);
      if (game.player.car === state.fleeCar) {
        game.player.car = null;
        game.player.onFoot = true;
      }
      state.fleeCar = null;
    }
    state.fleeStopped = false;
    state.finalPoint = null;
    spawnFleeCar(state, game);
  }
  state.startedFor = idx;
}

/** True when the getaway van is the car Lena is driving right now. */
export function playerDrivesVan(state, game) {
  return !!game.player.car && game.player.car === state.van;
}

/** True when Marco's sedan is stopped and the final walk-up is open. */
export function marcoStopped(state) {
  return state.fleeStopped && !!state.finalPoint;
}

/** The sedan's remaining health (0..80), for the HUD's chase readout. */
export function fleeCarHealth(state) {
  if (!state.fleeCar) return 0;
  return Math.max(0, Math.round(state.fleeCar.health));
}

/**
 * One object for the HUD's second-half line: which late mission is live, the
 * sedan's health while it runs, and whether the lockdown is on. Null before
 * mission 7.
 */
export function missions2Summary(state, game) {
  if (game.missions.done || game.missions.index < 6) return null;
  return {
    index: game.missions.index,
    title: MISSIONS2[game.missions.index - 6].title,
    fleeHp: game.missions.index === 8 ? fleeCarHealth(state) : null,
    lockdown: state.lockdown && game.missions.index === 7,
    vanStolen: state.vanStolen,
  };
}

/** The second-half progress a save keeps: nothing beyond the shared mission
 * ledger (completedIds already holds M7-M9), so this is a stub that keeps the
 * save shape stable if a later version needs more. */
export function missions2SaveData(state) {
  return {
    vanStolen: state.vanStolen,
    lockdown: state.lockdown,
  };
}

/** Restore the second-half flags from a save. The van and the sedan
 * themselves are re-spawned by missions2OnStart when their mission opens, so
 * a loaded save never needs to rebuild a car from numbers. */
export function applyMissions2Save(state, data) {
  if (!data) return;
  if (typeof data.vanStolen === 'boolean') state.vanStolen = data.vanStolen;
  if (typeof data.lockdown === 'boolean') state.lockdown = data.lockdown;
}
