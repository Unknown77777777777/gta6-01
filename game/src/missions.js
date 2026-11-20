// The story of Costa Sol and its six missions. Lena Cruz, getaway driver, owes
// Marco Venn two thousand dollars. Six jobs, in order, pay it off — each one a
// list of objectives the game walks through: go somewhere, pick something up,
// steal a car, lose the heat, hold still while the till opens, and run for the boat.
//
// An objective is { type, x, y, r, text, time?, hold?, needCar? }:
//   goto     reach the marker (on foot or in a car)
//   drive    reach the marker in a car
//   pickup   reach the marker and press E (a passenger or a package)
//   steal    steal the marked car, then reach the marker in it
//   rob      stand in the store and hold E until the hold timer fills
//   escape   get the wanted level to zero (anywhere, or at the hideout)
//   reach    reach the marker while the heat is on (the final run)

import { dist } from './city.js';

export const DEBT_TOTAL = 2000;

export const MISSIONS = [
  {
    id: 'fare',
    title: '1 — First Fare',
    reward: 150,
    briefing: 'Marco Venn wants his money. First job: pick up a fare at the north plaza and drop them at the east docks. Drive like you mean it.',
    objectives: [
      { type: 'drive', x: 1200, y: 800, r: 70, text: 'Drive to the pickup at the north plaza' },
      { type: 'pickup', x: 1200, y: 800, r: 70, text: 'Press E to pick up the fare' },
      { type: 'drive', x: 4200, y: 2600, r: 80, text: 'Drop the fare at the east docks' },
    ],
  },
  {
    id: 'wheels',
    title: '2 — Borrowed Wheels',
    reward: 200,
    briefing: 'A client needs a clean ride. The teal coupe parked by the west park is the one. Take it, and bring it to Sol Garage — quietly, if you can.',
    objectives: [
      { type: 'goto', x: 2600, y: 1000, r: 90, text: 'Find the teal coupe by the west park' },
      { type: 'steal', x: 2600, y: 1000, r: 60, text: 'Press E to take the coupe' },
      { type: 'drive', x: 4000, y: 2920, r: 90, text: 'Deliver the coupe to Sol Garage' },
    ],
  },
  {
    id: 'heat',
    title: '3 — Heat Run',
    reward: 300,
    briefing: 'The cops are sniffing around. Marco says: make some noise, then vanish. Get the heat on you, then lose it — the garage will hide you if you can reach it.',
    objectives: [
      { type: 'heat', x: 0, y: 0, r: 0, text: 'Raise your wanted level to 2 stars (steal a car, hit something, shoot)' },
      { type: 'escape', x: 0, y: 0, r: 0, time: 150, text: 'Lose the heat — stay unseen, or hide at Sol Garage' },
    ],
  },
  {
    id: 'package',
    title: '4 — Hot Package',
    reward: 350,
    briefing: 'A package, a clock, no questions. Pick it up at the south market and get it to the north marina in 90 seconds. The city will not wait.',
    objectives: [
      { type: 'pickup', x: 1000, y: 1800, r: 70, text: 'Pick up the package at the south market' },
      { type: 'drive', x: 4600, y: 600, r: 80, time: 90, text: 'Deliver the package to the north marina — 90 seconds!' },
    ],
  },
  {
    id: 'score',
    title: '5 — Quick Score',
    reward: 500,
    briefing: 'The QuickStop on the east side keeps its till full on Fridays. Walk in, hold the counter, walk out rich. The alarm will bring the whole city down on you.',
    objectives: [
      { type: 'goto', x: 3200, y: 1400, r: 80, text: 'Get to the QuickStop on foot' },
      { type: 'rob', x: 3200, y: 1360, r: 70, hold: 4, text: 'Hold E to empty the till' },
      { type: 'escape', x: 0, y: 0, r: 0, time: 150, text: 'Escape the heat — lose the cops or reach Sol Garage' },
    ],
  },
  {
    id: 'getaway',
    title: '6 — The Last Getaway',
    reward: 800,
    briefing: 'One last run and the debt is gone. Marco\'s boat waits at the harbour pier, and every cop in Costa Sol knows it. Drive like your life depends on it — it does.',
    objectives: [
      { type: 'drive', x: 4400, y: 1400, r: 90, text: 'Get to the harbour road, fast' },
      { type: 'reach', x: 4700, y: 1800, r: 70, text: 'Reach the boat at the end of the pier!' },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0, // which mission of MISSIONS
    objective: 0, // which objective inside it
    timer: 0, // seconds left on a timed objective (0 = untimed)
    holdProgress: 0, // 0..1 while holding E on a rob objective
    done: false, // every mission finished: the debt is paid
    failed: false, // a timed objective ran out
    justCompleted: null, // mission just finished, for the banner
    banner: 0, // seconds the banner stays up
    completedIds: [], // ids of finished missions, in order — the debt ledger
  };
}

export function currentMission(state) {
  return state.done ? null : MISSIONS[state.index];
}

export function currentObjective(state) {
  const mission = currentMission(state);
  return mission ? mission.objectives[state.objective] : null;
}

/** Begin a mission: reset its objective and timer. */
export function startMission(state, index) {
  state.index = index;
  state.objective = 0;
  state.holdProgress = 0;
  state.failed = false;
  state.justCompleted = null;
  const obj = currentObjective(state);
  state.timer = obj && obj.time ? obj.time : 0;
}

/** Advance to the next objective, or finish the mission. Returns 'objective' | 'mission' | null. */
function advance(state) {
  const mission = currentMission(state);
  if (!mission) return null;
  state.objective += 1;
  state.holdProgress = 0;
  if (state.objective >= mission.objectives.length) {
    state.justCompleted = mission;
    state.banner = 4;
    if (!state.completedIds.includes(mission.id)) state.completedIds.push(mission.id);
    state.index += 1;
    if (state.index >= MISSIONS.length) {
      state.done = true;
      state.objective = 0;
    } else {
      state.objective = 0;
    }
    return 'mission';
  }
  const obj = currentObjective(state);
  state.timer = obj && obj.time ? obj.time : 0;
  return 'objective';
}

/**
 * Step the active mission. `game` carries player, wanted, and the interaction
 * flags the main loop sets (interactPressed, interactHeld). Returns an event
 * string the loop can announce: 'objective' | 'mission' | 'failed' | null.
 * Mission 6 arms the full heat the moment it starts (the loop does that).
 */
export function updateMission(state, game, dt) {
  if (state.done) return null;
  const obj = currentObjective(state);
  if (!obj) return null;
  if (state.timer > 0) {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.timer = 0;
      state.failed = true;
      return 'failed';
    }
  }
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  const inCar = !player.onFoot;

  switch (obj.type) {
    case 'goto':
    case 'drive':
    case 'reach': {
      if (obj.type === 'drive' && !inCar) break; // need wheels for this one
      if (dist(px, py, obj.x, obj.y) < obj.r) return advance(state);
      break;
    }
    case 'pickup': {
      if (dist(px, py, obj.x, obj.y) < obj.r && game.interactPressed) {
        game.interactPressed = false;
        return advance(state);
      }
      break;
    }
    case 'steal': {
      if (game.stolenTarget) {
        game.stolenTarget = false;
        return advance(state);
      }
      break;
    }
    case 'heat': {
      if (game.wanted.level >= 2) return advance(state);
      break;
    }
    case 'escape': {
      if (game.wanted.level === 0) return advance(state);
      break;
    }
    case 'rob': {
      if (!player.onFoot || dist(player.x, player.y, obj.x, obj.y) >= obj.r) {
        state.holdProgress = Math.max(0, state.holdProgress - dt * 0.5);
        break;
      }
      if (game.interactHeld) {
        state.holdProgress += dt / obj.hold;
        if (state.holdProgress >= 1) {
          state.holdProgress = 0;
          game.robbed = true;
          return advance(state);
        }
      } else {
        state.holdProgress = Math.max(0, state.holdProgress - dt * 0.5);
      }
      break;
    }
    default:
      break;
  }
  return null;
}

/** The marker the waypoint arrow and the minimap should point at, if any. */
export function missionTarget(state) {
  const obj = currentObjective(state);
  if (!obj || obj.x === 0) return null;
  return { x: obj.x, y: obj.y, label: obj.text };
}

/**
 * The waypoint target for objectives that carry no fixed point: a 'heat'
 * objective points at the nearest stealable car (make noise there), an
 * 'escape' objective points at the Sol Garage hideout. Falls back to the
 * fixed marker when the objective has one. `game` supplies cars/hideout.
 */
export function missionTargetFor(state, game) {
  const fixed = missionTarget(state);
  if (fixed) return fixed;
  const obj = currentObjective(state);
  if (!obj || !game) return null;
  const px = game.player.car ? game.player.car.x : game.player.x;
  const py = game.player.car ? game.player.car.y : game.player.y;
  if (obj.type === 'escape') {
    return { x: game.city.hideout.x, y: game.city.hideout.y, label: 'Hide at Sol Garage' };
  }
  if (obj.type === 'heat') {
    let best = null;
    let bestD = Infinity;
    for (const car of game.cars) {
      if (car.dead || car.kind === 'police') continue;
      const d = dist(px, py, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) return { x: best.x, y: best.y, label: 'Steal a car or make noise' };
  }
  return null;
}

/** Money earned so far, for the debt meter. */
export function moneyEarned(state) {
  let sum = 0;
  for (let i = 0; i < state.index && i < MISSIONS.length; i += 1) sum += MISSIONS[i].reward;
  return sum;
}

/** What is still owed to Marco Venn, from the finished-mission ledger. */
export function debtLeft(state) {
  return Math.max(0, DEBT_TOTAL - moneyEarned(state));
}

/** Debt progress as { paid, total, left, pct }: the HUD's debt bar reads this. */
export function debtProgress(state) {
  const paid = moneyEarned(state);
  return { paid, total: DEBT_TOTAL, left: Math.max(0, DEBT_TOTAL - paid), pct: Math.min(100, Math.round((paid / DEBT_TOTAL) * 100)) };
}

/**
 * One object for the HUD's objective panel: the mission title, the current
 * objective text, its reward, and the seconds left on a timed objective.
 * Keeps the panel's wording in one place instead of spread over the HUD.
 */
export function missionSummary(state) {
  const mission = currentMission(state);
  const obj = currentObjective(state);
  if (!mission || !obj) return null;
  return {
    title: mission.title,
    text: obj.text,
    reward: mission.reward,
    timer: state.timer,
    type: obj.type,
    done: state.done,
  };
}

/**
 * The next job after the current one: title and reward, for the "what is
 * next" line when a mission pays out. Null when the story is finished.
 */
export function nextMissionPreview(state) {
  const next = state.done ? null : MISSIONS[state.index + 1];
  if (!next) return null;
  return { title: next.title, reward: next.reward, briefing: next.briefing };
}

/** The current mission's briefing text (the story so far, in one line). */
export function missionBriefing(state) {
  const mission = currentMission(state);
  return mission ? mission.briefing : '';
}

/** A clean retry of the active mission: objectives, timer and hold reset, no
 * duplicated NPCs, cars or timers — the anti-soft-lock reset after a fail or
 * a wasted/busted respawn. */
export function resetMissionClean(state) {
  const idx = state.done ? MISSIONS.length - 1 : state.index;
  startMission(state, Math.min(idx, MISSIONS.length - 1));
}
