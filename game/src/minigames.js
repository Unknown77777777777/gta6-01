// Minigames: three ways to earn cash between story missions, each with its
// own rules, its own timer, and its own place in the city. None of them can
// soft-lock a mission: every one times out, cancels cleanly, and leaves no
// car, pedestrian or timer behind.
//
//   Street Racing  $50 in, five checkpoints down the avenues, three AI
//                  rivals, $300 for first place. Countdown 3-2-1-GO.
//   Vigilante      when the heat is off, press V near a red-marked criminal
//                  car and ram it to a stop in 120 s: $150, with a combo
//                  bonus for three in a row.
//   Paramedic      the ambulance waits at the hospital. Climb in, pick up
//                  the hurt pedestrian, bring them back in 90 s: $120.
//
// All three keep their stats on the player (racesWon, vigilanteKills,
// patientsSaved), so the save file and the story-complete screen read them
// from one place.

import { clamp, dist, ROAD_H, ROAD_V } from './city.js';
import { createCar, driveCar, updateTrafficCar } from './vehicles.js';
import { createPed } from './pedestrians.js';
import { spawnBurst } from './particles.js';

/** Street racing: the start line and the five checkpoints, all on roads. */
export const RACE_START = { x: 2200, y: 2800 };
export const RACE_CHECKPOINTS = [
  { x: 2200, y: 2800 },
  { x: 2200, y: 1400 },
  { x: 3400, y: 1400 },
  { x: 3400, y: 2600 },
  { x: 2200, y: 2600 },
];
export const RACE_ENTRY_FEE = 50;
export const RACE_FIRST_PRIZE = 300;
export const RACE_SECOND_PRIZE = 100;
export const RACE_TIME_LIMIT = 180;
export const RACE_COUNTDOWN = 3;

/** Vigilante: a criminal car, the chase window, and the combo ladder. */
export const VIGILANTE_TIME_LIMIT = 120;
export const VIGILANTE_REWARD = 150;
export const VIGILANTE_COMBO_BONUS = 50;
export const VIGILANTE_MAX_COMBO = 3;
export const VIGILANTE_RAM_DAMAGE = 15;

/** Paramedic: the ambulance, the hospital door, and the patient clock. */
export const AMBULANCE_SPOT = { x: 800, y: 2600 };
export const HOSPITAL_DROP = { x: 800, y: 2650 };
export const PARAMEDIC_REWARD = 120;
export const PARAMEDIC_TIME_LIMIT = 90;

/** Fresh minigame state for a new game. */
export function createMinigameState() {
  return {
    race: {
      phase: 'idle', // idle -> countdown -> running -> idle
      countdown: 0,
      cpIndex: 0,
      elapsed: 0,
      racers: [], // { car, cpIndex, skill }
      startX: 0, startY: 0, // the false-start tripwire
      position: 0, // 1..4 while running
      finished: false,
    },
    vigilante: {
      target: null, // the red-marked criminal car, when one is out
      phase: 'idle', // idle -> hunting -> active -> idle
      timer: 0,
      combo: 0,
      ramCooldown: 0,
      spawnTimer: 12,
    },
    paramedic: {
      ambulance: null, // the hospital ambulance, once spawned
      phase: 'idle', // idle -> to-patient -> to-hospital -> idle
      patient: null, // the hurt pedestrian, when one is waiting
      timer: 0,
      spawnTimer: 0,
    },
    stats: {
      racesRun: 0, racesWon: 0, racesSecond: 0, bestRaceTime: 0,
      vigilanteKills: 0, bestCombo: 0,
      patientsSaved: 0,
    },
  };
}

// ------------------------------------------------------------------ racing

/**
 * Lena pressed E at the start line, in a car, with $50 to spare. The fee is
 * taken, three rivals roll up behind the line, and the countdown starts.
 * Returns 'race-start' for the announcer, or null when the start is not
 * available (not in a car, broke, or a race already running).
 */
export function tryRaceStart(state, game) {
  const race = state.race;
  if (race.phase !== 'idle') return null;
  if (!game.player.car || game.player.onFoot) return null;
  if (dist(game.player.x, game.player.y, RACE_START.x, RACE_START.y) > 110) return null;
  if (game.money < RACE_ENTRY_FEE) return null;
  game.money -= RACE_ENTRY_FEE;
  race.phase = 'countdown';
  race.countdown = RACE_COUNTDOWN;
  race.cpIndex = 0;
  race.elapsed = 0;
  race.position = 4;
  race.finished = false;
  race.startX = game.player.x;
  race.startY = game.player.y;
  // Three rivals behind the line, each a little different: the lead car is
  // genuinely quick, the last one is a rolling chicane.
  const skills = [
    { color: '#e84a4a', topSpeed: 580, name: 'REDLINE' },
    { color: '#4a90d8', topSpeed: 540, name: 'BLUE STREAK' },
    { color: '#e8b13c', topSpeed: 500, name: 'GOLD RUSH' },
  ];
  race.racers = [];
  for (let i = 0; i < skills.length; i += 1) {
    const s = skills[i];
    const car = createCar(RACE_START.x - 60 - i * 55, RACE_START.y + 40, -Math.PI / 2, 'racer', null);
    car.color = s.color;
    car.topSpeed = s.topSpeed;
    car.racerName = s.name;
    game.cars.push(car);
    race.racers.push({ car, cpIndex: 0, skill: s.topSpeed });
  }
  state.stats.racesRun += 1;
  return 'race-start';
}

/** Take the rivals off the road when a race ends or is cancelled. */
function clearRacers(state, game) {
  for (const r of state.race.racers) {
    const i = game.cars.indexOf(r.car);
    if (i >= 0) game.cars.splice(i, 1);
  }
  state.race.racers = [];
}

/** Drive one rival toward its next checkpoint, full throttle. */
function updateRacer(r, dt, city) {
  const car = r.car;
  if (car.dead) return;
  const cp = RACE_CHECKPOINTS[r.cpIndex + 1];
  if (!cp) return;
  const wantAngle = Math.atan2(cp.y - car.y, cp.x - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  driveCar(car, 1, 0, clamp(diff * 2.2, -1, 1), false, dt, city);
  if (dist(car.x, car.y, cp.x, cp.y) < 90) r.cpIndex += 1;
}

/** Lena's race position, 1st to 4th: most checkpoints first, then closest to
 * the next one. A rival a checkpoint ahead is ahead, whatever the raw
 * distance says. */
export function racePosition(state, game) {
  const race = state.race;
  if (race.phase !== 'running') return race.position;
  const px = game.player.car ? game.player.car.x : game.player.x;
  const py = game.player.car ? game.player.car.y : game.player.y;
  const nextCp = RACE_CHECKPOINTS[Math.min(race.cpIndex + 1, RACE_CHECKPOINTS.length - 1)];
  const mine = { cp: race.cpIndex, d: dist(px, py, nextCp.x, nextCp.y) };
  let ahead = 0;
  for (const r of race.racers) {
    if (r.car.dead) continue;
    const rCp = RACE_CHECKPOINTS[Math.min(r.cpIndex + 1, RACE_CHECKPOINTS.length - 1)];
    const theirs = { cp: r.cpIndex, d: dist(r.car.x, r.car.y, rCp.x, rCp.y) };
    if (theirs.cp > mine.cp || (theirs.cp === mine.cp && theirs.d < mine.d)) ahead += 1;
  }
  race.position = ahead + 1;
  return race.position;
}

/** The race clock as the HUD shows it: "1:23 · 2nd". */
export function raceHudText(state, game) {
  const race = state.race;
  if (race.phase === 'idle') return '';
  if (race.phase === 'countdown') return `RACE ${Math.ceil(race.countdown)}…`;
  const total = Math.floor(race.elapsed);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const pos = racePosition(state, game);
  const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
  return `RACE ${mm}:${ss < 10 ? '0' : ''}${ss} · ${pos}${suffix} · CP ${race.cpIndex}/${RACE_CHECKPOINTS.length - 1}`;
}

/**
 * Step the race. Returns an event for the main loop: 'race-go' when the lights
 * go out, 'race-win' / 'race-second' / 'race-lose' at the finish, 'race-timeout'
 * when the clock runs out, 'race-false-start' when Lena jumps the lights,
 * 'race-cancelled' when she leaves her car.
 */
function updateRace(state, game, dt) {
  const race = state.race;
  if (race.phase === 'idle') return null;
  if (!game.player.car) {
    clearRacers(state, game);
    race.phase = 'idle';
    return 'race-cancelled';
  }
  if (race.phase === 'countdown') {
    race.countdown -= dt;
    // A false start — rolling off the line before GO — voids the race and
    // keeps the entry fee. The line is the line.
    if (dist(game.player.x, game.player.y, race.startX, race.startY) > 120) {
      clearRacers(state, game);
      race.phase = 'idle';
      return 'race-false-start';
    }
    if (race.countdown <= 0) {
      race.phase = 'running';
      return 'race-go';
    }
    return null;
  }
  // Running: the clock, the checkpoints, the rivals, the finish.
  race.elapsed += dt;
  const cp = RACE_CHECKPOINTS[race.cpIndex + 1];
  if (cp && dist(game.player.x, game.player.y, cp.x, cp.y) < 90) {
    race.cpIndex += 1;
    if (race.cpIndex >= RACE_CHECKPOINTS.length - 1) {
      const pos = racePosition(state, game);
      clearRacers(state, game);
      race.phase = 'idle';
      race.finished = true;
      if (pos === 1) {
        state.stats.racesWon += 1;
        state.stats.bestRaceTime = state.stats.bestRaceTime === 0
          ? race.elapsed : Math.min(state.stats.bestRaceTime, race.elapsed);
        game.player.racesWon = (game.player.racesWon || 0) + 1;
        game.money += RACE_FIRST_PRIZE;
        return 'race-win';
      }
      if (pos === 2) {
        state.stats.racesSecond += 1;
        game.money += RACE_SECOND_PRIZE;
        return 'race-second';
      }
      return 'race-lose';
    }
  }
  for (const r of race.racers) updateRacer(r, dt, game.city);
  racePosition(state, game);
  if (race.elapsed > RACE_TIME_LIMIT) {
    clearRacers(state, game);
    race.phase = 'idle';
    return 'race-timeout';
  }
  return null;
}

// --------------------------------------------------------------- vigilante

/** Spawn a criminal car on a road near Lena: red, fast, and worth $150. */
function spawnCriminalCar(state, game) {
  let spot = null;
  for (let tries = 0; tries < 30; tries += 1) {
    const rx = ROAD_V[Math.floor(Math.random() * ROAD_V.length)];
    const ry = ROAD_H[Math.floor(Math.random() * ROAD_H.length)];
    const x = Math.random() < 0.5 ? rx : 200 + Math.random() * 4400;
    const y = Math.random() < 0.5 ? ry : 200 + Math.random() * 2800;
    const d = dist(x, y, game.player.x, game.player.y);
    if (d > 400 && d < 1100) { spot = { x, y }; break; }
  }
  if (!spot) spot = { x: 1800, y: 1400 };
  const car = createCar(spot.x, spot.y, 0, 'criminal', null);
  car.color = '#c03030';
  car.topSpeed = 540;
  car.health = 100;
  game.cars.push(car);
  state.vigilante.target = car;
  state.vigilante.phase = 'hunting';
  return car;
}

/**
 * Lena pressed V. Near a red-marked criminal car, with the heat off, the chase
 * starts: 120 seconds to ram it to a stop. Anywhere else, nothing happens — V
 * is not a crime, and pressing it on an empty street does not summon a target.
 * Returns 'vigilante-start' or null.
 */
export function tryVigilanteStart(state, game) {
  const vig = state.vigilante;
  if (vig.phase !== 'hunting' || !vig.target) return null;
  if (game.wanted.level > 0) return null;
  if (!game.player.car) return null;
  if (dist(game.player.x, game.player.y, vig.target.x, vig.target.y) > 160) return null;
  vig.phase = 'active';
  vig.timer = VIGILANTE_TIME_LIMIT;
  vig.ramCooldown = 0;
  return 'vigilante-start';
}

/** Step the vigilante chase: the criminal cruises, rams land, the clock runs. */
function updateVigilante(state, game, dt) {
  const vig = state.vigilante;
  if (vig.phase === 'idle') {
    // No target out: one may appear, but only while the heat is off.
    vig.spawnTimer -= dt;
    if (vig.spawnTimer <= 0) {
      vig.spawnTimer = 25;
      if (game.wanted.level === 0 && !vig.target) spawnCriminalCar(state, game);
    }
    return null;
  }
  const target = vig.target;
  if (!target || target.dead) {
    vig.target = null;
    vig.phase = 'idle';
    vig.spawnTimer = 18;
    return null;
  }
  // The criminal drives like traffic: it cruises its road and does not know
  // Lena is coming until the first hit.
  updateTrafficCar(target, dt, game.cars, Math.random, game.peds);
  if (vig.phase === 'hunting') {
    // Too far away for too long and the trail goes cold.
    if (dist(target.x, target.y, game.player.x, game.player.y) > 1500) {
      const i = game.cars.indexOf(target);
      if (i >= 0) game.cars.splice(i, 1);
      vig.target = null;
      vig.phase = 'idle';
      vig.spawnTimer = 18;
    }
    return null;
  }
  // Active: ram it until it stops, before the clock does.
  vig.timer -= dt;
  if (vig.ramCooldown > 0) vig.ramCooldown -= dt;
  const player = game.player;
  if (player.car && !player.car.dead && Math.abs(player.car.speed) > 150
    && dist(player.car.x, player.car.y, target.x, target.y) < 48 && vig.ramCooldown <= 0) {
    vig.ramCooldown = 0.5;
    target.health -= VIGILANTE_RAM_DAMAGE;
    spawnBurst(game.particles, target.x, target.y, '#ffd23c', 8, 120, 0.5, 2.5, 0);
  }
  if (target.health <= 0) {
    target.health = 0;
    target.dead = true;
    target.fade = 10;
    target.speed = 0;
    vig.combo = Math.min(VIGILANTE_MAX_COMBO, vig.combo + 1);
    const pay = VIGILANTE_REWARD + (vig.combo - 1) * VIGILANTE_COMBO_BONUS;
    game.money += pay;
    state.stats.vigilanteKills += 1;
    state.stats.bestCombo = Math.max(state.stats.bestCombo, vig.combo);
    game.player.vigilanteKills = (game.player.vigilanteKills || 0) + 1;
    spawnBurst(game.particles, target.x, target.y, '#ff8030', 18, 180, 0.6, 3, 0);
    game.floatTexts.push({ x: target.x, y: target.y - 44, text: `VIGILANTE +$${pay}`, color: '#7de89a', size: 18, life: 1.4, maxLife: 1.4 });
    vig.target = null;
    vig.phase = 'idle';
    vig.spawnTimer = 14;
    return 'vigilante-kill';
  }
  if (vig.timer <= 0 || !player.car) {
    vig.combo = 0;
    vig.phase = 'hunting';
    return 'vigilante-failed';
  }
  return null;
}

// --------------------------------------------------------------- paramedic

/** Park the ambulance by the hospital door, once, for the whole game. */
export function ensureAmbulance(state, game) {
  const pm = state.paramedic;
  if (pm.ambulance && game.cars.includes(pm.ambulance)) return pm.ambulance;
  const amb = createCar(AMBULANCE_SPOT.x, AMBULANCE_SPOT.y, Math.PI / 2, 'ambulance', null);
  amb.color = '#f0f0f0';
  amb.topSpeed = 600;
  game.cars.push(amb);
  pm.ambulance = amb;
  return amb;
}

/** A hurt pedestrian waits somewhere on the roads: the next patient. */
function spawnPatient(state, game) {
  const pm = state.paramedic;
  let spot = null;
  for (let tries = 0; tries < 30; tries += 1) {
    const rx = ROAD_V[Math.floor(Math.random() * ROAD_V.length)];
    const ry = 200 + Math.random() * 2800;
    const x = Math.random() < 0.5 ? rx : 200 + Math.random() * 4400;
    const y = Math.random() < 0.5 ? ry : ROAD_H[Math.floor(Math.random() * ROAD_H.length)];
    const d = dist(x, y, HOSPITAL_DROP.x, HOSPITAL_DROP.y);
    if (d > 500 && d < 1600) { spot = { x, y }; break; }
  }
  if (!spot) spot = { x: 2200, y: 1400 };
  const ped = createPed(Math.random, spot.x, spot.y);
  ped.waiting = true;
  ped.patient = true;
  ped.shirt = '#f0f0f0';
  game.peds.push(ped);
  pm.patient = ped;
  pm.timer = PARAMEDIC_TIME_LIMIT;
  return ped;
}

/** Take the patient off the street: the ambulance stops, the doors open. */
function removePatient(state, game) {
  const pm = state.paramedic;
  if (!pm.patient) return;
  const i = game.peds.indexOf(pm.patient);
  if (i >= 0) game.peds.splice(i, 1);
  pm.patient = null;
}

/**
 * Step the paramedic job. Climbing into the ambulance starts it (a patient
 * appears); climbing out ends it. The timer only runs while a patient is
 * aboard or waiting.
 */
function updateParamedic(state, game, dt) {
  const pm = state.paramedic;
  ensureAmbulance(state, game);
  const inAmbulance = !!game.player.car && game.player.car === pm.ambulance;
  if (pm.phase === 'idle') {
    if (inAmbulance) {
      pm.phase = 'to-patient';
      spawnPatient(state, game);
      return 'paramedic-start';
    }
    return null;
  }
  if (!inAmbulance) {
    removePatient(state, game);
    pm.phase = 'idle';
    return 'paramedic-cancelled';
  }
  pm.timer -= dt;
  if (pm.phase === 'to-hospital') {
    if (dist(game.player.x, game.player.y, HOSPITAL_DROP.x, HOSPITAL_DROP.y) < 90) {
      game.money += PARAMEDIC_REWARD;
      state.stats.patientsSaved += 1;
      game.player.patientsSaved = (game.player.patientsSaved || 0) + 1;
      game.floatTexts.push({ x: game.player.x, y: game.player.y - 44, text: `PATIENT SAVED +$${PARAMEDIC_REWARD}`, color: '#7de89a', size: 18, life: 1.4, maxLife: 1.4 });
      pm.phase = 'idle';
      return 'paramedic-saved';
    }
  }
  if (pm.timer <= 0) {
    removePatient(state, game);
    pm.phase = 'idle';
    return 'paramedic-timeout';
  }
  return null;
}

/**
 * Lena pressed E: the minigames' contextual action, checked before the main
 * loop's car entry. Picking up a patient in the ambulance is the only E action
 * here (the race start is checked by the caller first, because it needs the
 * fee). Returns 'patient-pickup' or null.
 */
export function tryMinigameInteract(state, game) {
  const pm = state.paramedic;
  if (pm.phase === 'to-patient' && pm.patient && game.player.car === pm.ambulance) {
    if (dist(game.player.x, game.player.y, pm.patient.x, pm.patient.y) < 70) {
      removePatient(state, game);
      pm.phase = 'to-hospital';
      pm.timer = PARAMEDIC_TIME_LIMIT;
      return 'patient-pickup';
    }
  }
  return null;
}

// ------------------------------------------------------------------- wiring

/**
 * Step all three minigames, once per frame. Returns the first event that needs
 * announcing (the main loop announces it and the money is already paid where
 * the event says so). Most frames return null.
 */
export function updateMinigames(state, game, dt) {
  const raceEvent = updateRace(state, game, dt);
  if (raceEvent) return raceEvent;
  const vigEvent = updateVigilante(state, game, dt);
  if (vigEvent) return vigEvent;
  const pmEvent = updateParamedic(state, game, dt);
  if (pmEvent) return pmEvent;
  return null;
}

/** Markers for the renderer and the minimap: race line, checkpoints, criminal
 * cars, patients, the ambulance. */
export function minigameMarkers(state) {
  const out = [];
  const race = state.race;
  if (race.phase === 'idle') {
    out.push({ x: RACE_START.x, y: RACE_START.y, kind: 'race-start', label: 'Street race — E in a car, $50 entry' });
  } else {
    for (let i = race.cpIndex + 1; i < RACE_CHECKPOINTS.length; i += 1) {
      out.push({ x: RACE_CHECKPOINTS[i].x, y: RACE_CHECKPOINTS[i].y, kind: 'race-cp', cp: i, label: `Race checkpoint ${i}` });
    }
  }
  const vig = state.vigilante;
  if (vig.target && !vig.target.dead) {
    out.push({ x: vig.target.x, y: vig.target.y, kind: 'criminal', label: 'Criminal car — press V near it' });
  }
  const pm = state.paramedic;
  if (pm.ambulance) {
    out.push({ x: pm.ambulance.x, y: pm.ambulance.y, kind: 'ambulance', label: 'Ambulance — paramedic work' });
  }
  if (pm.patient) {
    out.push({ x: pm.patient.x, y: pm.patient.y, kind: 'patient', label: 'Hurt pedestrian — bring the ambulance' });
  }
  return out;
}

/** One line for the HUD: whichever minigame is live, and its clock. */
export function minigameHudText(state, game) {
  const race = state.race;
  if (race.phase !== 'idle') return raceHudText(state, game);
  const vig = state.vigilante;
  if (vig.phase === 'active') {
    return `VIGILANTE ${Math.ceil(vig.timer)}s · combo x${vig.combo} · ram the red car!`;
  }
  if (vig.phase === 'hunting' && vig.target) {
    return 'VIGILANTE: red criminal car spotted — press V near it (wanted 0)';
  }
  const pm = state.paramedic;
  if (pm.phase === 'to-patient' && pm.patient) {
    return `PARAMEDIC: pick up the patient · ${Math.ceil(pm.timer)}s`;
  }
  if (pm.phase === 'to-hospital') {
    return `PARAMEDIC: to the hospital! · ${Math.ceil(pm.timer)}s`;
  }
  return '';
}

/** Totals for the story-complete screen: the minigame ledger. */
export function minigameTotals(state) {
  const s = state.stats;
  return {
    racesRun: s.racesRun, racesWon: s.racesWon, racesSecond: s.racesSecond,
    bestRaceTime: s.bestRaceTime, vigilanteKills: s.vigilanteKills,
    bestCombo: s.bestCombo, patientsSaved: s.patientsSaved,
  };
}

/** The minigame progress a save keeps: stats only — live races, chases and
 * patients never survive a reload (a fresh game starts them clean). */
export function minigamesSaveData(state) {
  return { stats: { ...state.stats } };
}

/** Restore minigame stats from a save (v3 saves carry none). */
export function applyMinigamesSave(state, data) {
  if (!data || !data.stats) return;
  for (const key of Object.keys(state.stats)) {
    if (typeof data.stats[key] === 'number') state.stats[key] = data.stats[key];
  }
}
