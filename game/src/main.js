// Boot and the one loop: Costa Sol runs in fixed 1/60 s steps, the renderer paints
// what is there, and the game moves between title, play, paused, game over and
// story complete. ?shot=cover|driving|mission|foot (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.

import { createCity, clamp, dist, isWaterAt, randomRoadPoint, WORLD_H, WORLD_W } from './city.js';
import { createPlayer, updatePlayerOnFoot, playerPunch, playerShoot, hurtPlayer, healPlayer, resetPlayerTimers, knockPlayer, reloadWeapon, MAX_HEALTH, PUNCH_RANGE, PUNCH_DAMAGE } from './player.js';
import { createCar, driveCar, updateTrafficCar, updatePoliceCar, separateCars, spawnTraffic, spawnParkedCars, spawnPoliceCar, createTaxi, CAR_RADIUS } from './vehicles.js';
import { spawnPedestrians, updatePed, knockPedDown, scarePeds } from './pedestrians.js';
import { createMissionState, startMission, updateMission, currentMission, currentObjective, missionTargetFor, resetMissionClean, nextMissionPreview, MISSIONS, DEBT_TOTAL } from './missions.js';
import { createWanted, addWanted, setWanted, clearWanted, policeTargetCount, policeSpawnInterval, updateWanted } from './wanted.js';
import { createHud, updateHud, drawMinimap } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadSave, hasSave, clearSave, saveSummary } from './save.js';
import { createRenderer } from './render.js';
import { createParticlePool, spawnBurst, spawnParticle, spawnSmoke, updateParticles } from './particles.js';
import {
  createSideState, updateSide, tryBoardTaxi, taxiArrived, collectPackageAt,
  checkJump, sideSaveData, applySideSave, sideTotals, PACKAGE_REWARD, JUMP_REWARD,
} from './side.js';
import { createWaitingPed } from './pedestrians.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const TRAFFIC_TARGET = 14;
const PED_COUNT = 42;
const PARKED_COUNT = 22;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud();
const audio = createAudio();
let rngState = seed;

/** The session's random stream (seeded, so shots repeat). */
function rng() {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Build a fresh game: city, Lena, cars, people, missions, wanted, money. */
function createGame() {
  const city = createCity(seed);
  const player = createPlayer(city.spawn.x, city.spawn.y);
  const cars = spawnTraffic(rng, TRAFFIC_TARGET, player.x, player.y);
  const parked = spawnParkedCars(rng, PARKED_COUNT);
  // The teal coupe mission 2 asks Lena to steal, parked by the west park.
  const target = createCar(2600, 1000, Math.PI / 2, 'target', rng);
  target.color = '#2fa8a0';
  parked.push(target);
  // A guaranteed ride near Lena's spawn: mission 1 needs wheels, and a random
  // parked-car roll must never leave her walking the whole map on foot.
  const starter = createCar(3850, 2960, 0, 'parked', rng);
  parked.push(starter);
  // A guaranteed yellow cab one street over: the taxi side work is open
  // from the first minute, not something she has to hunt for.
  parked.push(createTaxi(3700, 2960, 0, rng));
  const game = {
    city, player,
    cars: cars.concat(parked),
    targetCar: target,
    police: [],
    peds: spawnPedestrians(rng, PED_COUNT),
    bullets: [],
    // Particles live in one pre-allocated pool (no per-frame allocation),
    // and the side activities (taxi fares, hidden packages, stunt jumps)
    // keep their own state beside the missions.
    particles: createParticlePool(320),
    side: createSideState(city),
    farePed: null, // the pedestrian waiting for a taxi, when one is out
    tireMarks: [],
    floatTexts: [],
    radioStation: 0,
    radioBanner: 0,
    radioName: '',
    radioBlurb: '',
    missions: createMissionState(),
    wanted: createWanted(),
    money: 40,
    screen: 'title',
    overReason: '',
    camera: null,
    mouseX: 0, mouseY: 0, mouseDown: false,
    interactPressed: false, interactHeld: false,
    stolenTarget: false, robbed: false,
    policeTimer: 0, trafficTimer: 0, crimeCooldown: 0, carCrashCooldown: 0,
    elapsed: 0, savedMoney: 0,
    // Frame-rate readout: frames counted over each half second, smoothed.
    fps: 0, fpsFrames: 0, fpsTime: 0,
  };
  startMission(game.missions, 0);
  return game;
}

const game = createGame();

/** Floating combat/economy popup at a world position (renderer draws it). */
function addFloatText(x, y, text, color, size) {
  game.floatTexts.push({ x, y, text, color, size: size || 18, life: 1.4, maxLife: 1.4 });
  if (game.floatTexts.length > 24) game.floatTexts.shift();
}

/**
 * Anti soft-lock: the teal coupe mission 2 needs must always exist and be
 * stealable. If it was wrecked, driven off in a respawn, or otherwise lost,
 * a fresh coupe appears at its west-park spot.
 */
function ensureTargetCar() {
  const t = game.targetCar;
  const inWorld = t && !t.dead && (game.cars.includes(t) || game.player.car === t);
  if (inWorld) return;
  const fresh = createCar(2600, 1000, Math.PI / 2, 'target', rng);
  fresh.color = '#2fa8a0';
  game.targetCar = fresh;
  game.cars.push(fresh);
}

/** Anti soft-lock: guarantee a drivable parked car within 500 px of (x, y). */
function ensureCarNear(x, y) {
  for (const car of game.cars) {
    if (!car.dead && car.kind !== 'police' && dist(car.x, car.y, x, y) < 500) return;
  }
  if (game.player.car && dist(game.player.car.x, game.player.car.y, x, y) < 500) return;
  const near = createCar(x + 120, y, 0, 'parked', rng);
  game.cars.push(near);
}

// ---------------------------------------------------------------- input

const keys = new Set();
let reloadTimer = 0;

function screenToWorld(sx, sy) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(canvas.width / 1280, canvas.height / 720);
  const ox = (canvas.width - 1280 * scale) / 2;
  const oy = (canvas.height - 720 * scale) / 2;
  const cam = game.camera || { x: 0, y: 0 };
  const canvasX = (sx - rect.left) * (canvas.width / rect.width);
  const canvasY = (sy - rect.top) * (canvas.height / rect.height);
  return {
    x: cam.x + (canvasX - ox) / scale,
    y: cam.y + (canvasY - oy) / scale,
  };
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    return;
  }
  keys.add(event.code);
  if (event.code === 'KeyE') {
    game.interactPressed = true;
    game.interactHeld = true;
  }
  if (event.code === 'KeyF') tryPunch();
  if (event.code === 'KeyM') toggleMute();
  if (event.code === 'KeyR') {
    if (game.screen === 'play' && !game.player.onFoot && game.player.car) {
      // In a car, R switches the radio station (on foot it reloads).
      audio.ensure();
      game.radioName = audio.radioCycle();
      game.radioBlurb = audio.radioBlurb();
      game.radioStation = audio.radioStation();
      game.radioBanner = 2.5;
      audio.click();
    } else {
      reloadTimer = 0.8;
    }
  }
  if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
  if (event.code === 'Space' || event.code === 'Enter') {
    if (game.screen === 'title') startNewGame(false);
    else if (game.screen === 'over') respawn();
    else if (game.screen === 'complete') resumeFreeRoam();
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'KeyE') game.interactHeld = false;
});
window.addEventListener('blur', () => {
  keys.clear();
  game.interactHeld = false;
  game.mouseDown = false;
});
canvas.addEventListener('mousemove', (event) => {
  game.mouseX = event.clientX;
  game.mouseY = event.clientY;
});
canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0) {
    game.mouseDown = true;
    audio.ensure();
  }
});
window.addEventListener('mouseup', () => { game.mouseDown = false; });
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'play') pauseGame();
});

// Buttons on the screens.
function bindButton(id, fn) {
  const b = document.getElementById(id);
  if (b) b.addEventListener('click', () => { audio.ensure(); audio.click(); fn(); });
}
bindButton('btn-new', () => startNewGame(false));
bindButton('btn-continue', () => startNewGame(true));
bindButton('btn-resume', () => resumeGame());
bindButton('btn-restart', () => startNewGame(false));
bindButton('btn-respawn', () => respawn());
bindButton('btn-roam', () => resumeFreeRoam());
bindButton('btn-mute', () => toggleMute());
bindButton('btn-quit-title', () => showScreen('title'));

function toggleMute() {
  audio.ensure();
  audio.setMuted(!audio.isMuted());
  const b = document.getElementById('btn-mute');
  if (b) b.textContent = audio.isMuted() ? '🔇 Sound: Off' : '🔊 Sound: On';
}

function announce(message) {
  status.textContent = message;
}

function showScreen(name) {
  game.screen = name;
  for (const s of ['title', 'pause', 'over', 'complete']) {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  }
  document.getElementById('hud').classList.toggle('hidden', name === 'title');
}

// ---------------------------------------------------------------- screens

function startNewGame(continueSave) {
  clearSave();
  const fresh = createGame();
  Object.assign(game, fresh);
  if (continueSave) {
    const save = loadSave();
    if (save) {
      game.money = save.money;
      game.player.x = save.x;
      game.player.y = save.y;
      game.player.health = save.health;
      if (Array.isArray(save.completedIds)) game.missions.completedIds = [...save.completedIds];
      if (typeof save.radioStation === 'number') game.radioStation = save.radioStation;
      if (save.side) applySideSave(game.side, save.side);
      if (save.missionDone) {
        game.missions.done = true;
        game.missions.index = MISSIONS.length;
      } else {
        startMission(game.missions, Math.min(save.missionIndex, MISSIONS.length - 1));
      }
      announce('Continuing your story.');
    }
  }
  showScreen('play');
  announce('Costa Sol. Mission 1: pick up the fare. Find a car — press E near one.');
  audio.ensure();
}

function pauseGame() {
  if (game.screen !== 'play') return;
  showScreen('pause');
  saveGame(game);
  announce('Paused. Progress saved.');
}

function resumeGame() {
  showScreen('play');
  announce('Playing.');
}

function togglePause() {
  if (game.screen === 'play') pauseGame();
  else if (game.screen === 'pause') resumeGame();
}

function resumeFreeRoam() {
  showScreen('play');
  announce('Free roam. The city is yours.');
}

/** Lena is busted or wasted: lose some cash, wake up at the hospital, retry the mission. */
function endGame(reason) {
  game.overReason = reason;
  showScreen('over');
  document.getElementById('over-title').textContent = reason === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('over-text').textContent = reason === 'busted'
    ? 'The cops dragged Lena out of the car. Marco Venn is not impressed.'
    : 'Lena went down hard. The hospital patched her up — for a price.';
  audio.fail();
  audio.stopEngine();
  audio.stopSiren();
  audio.radioStop();
  announce(reason === 'busted' ? 'Busted.' : 'Wasted.');
}

function respawn() {
  const lost = Math.floor(game.money * 0.1);
  game.money -= lost;
  // Return Lena's car to the world before clearing the pointer: otherwise a
  // mission car she was driving vanishes and its objective can never finish.
  if (game.player.car) {
    game.cars.push(game.player.car);
    game.player.car.speed = 0;
  }
  game.player.x = game.city.hospitalSpawn.x;
  game.player.y = game.city.hospitalSpawn.y;
  game.player.health = MAX_HEALTH;
  game.player.onFoot = true;
  game.player.car = null;
  game.player.ammo = 12;
  resetPlayerTimers(game.player);
  audio.radioStop();
  game.radioBanner = 0;
  // A fare does not survive a bust or a hospital trip: the passenger walks
  // off and the next one shows up later.
  if (game.side.taxi.phase !== 'idle') {
    game.side.taxi.phase = 'idle';
    game.side.taxi.waitTimer = 14;
  }
  removeFarePed();
  for (const cop of game.police) cop.dead = true;
  game.police = [];
  clearWanted(game.wanted);
  // Clean mission retry: no duplicated NPCs, cars or timers, and the mission
  // car is back on the map if it was lost.
  resetMissionClean(game.missions);
  ensureTargetCar();
  // The coupe must be stealable again after a bust: its takenByPlayer flag
  // survives the respawn, so re-entering it never sets stolenTarget and the
  // steal objective can never complete — a soft-lock for any player who gets
  // busted mid-mission-2. Clear the flag and the stale stolen marker.
  if (game.targetCar) game.targetCar.takenByPlayer = false;
  game.stolenTarget = false;
  ensureCarNear(game.player.x, game.player.y);
  showScreen('play');
  announce(`Back on your feet. Lost $${lost} to the hospital.`);
}

// ---------------------------------------------------------------- combat and crime

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of game.cars) {
    if (car.dead || car.kind === 'police') continue;
    const d = dist(game.player.x, game.player.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function copNearby(radius) {
  const px = game.player.car ? game.player.car.x : game.player.x;
  const py = game.player.car ? game.player.car.y : game.player.y;
  for (const cop of game.police) {
    if (!cop.dead && dist(cop.x, cop.y, px, py) < radius) return true;
  }
  return false;
}

function commitCrime(stars) {
  if (game.crimeCooldown > 0) return;
  game.crimeCooldown = 1.5;
  const before = game.wanted.level;
  addWanted(game.wanted, stars);
  if (game.wanted.level > before) {
    audio.sting();
    addFloatText(game.player.x, game.player.y - 34, `WANTED ${'★'.repeat(game.wanted.level)}`, '#ff7070', 17);
  }
}

function tryEnterCar() {
  const car = nearestCar(70);
  if (!car) return false;
  const wasTarget = car === game.targetCar;
  const firstTheft = !car.takenByPlayer;
  game.player.car = car;
  game.player.onFoot = false;
  game.player.x = car.x;
  game.player.y = car.y;
  game.cars.splice(game.cars.indexOf(car), 1);
  if (firstTheft) {
    car.takenByPlayer = true;
    if (wasTarget) game.stolenTarget = true;
    // A theft earns a star only when a cop is close enough to witness it —
    // an unwitnessed joyride is not a crime spree (v1 rule, kept).
    const before = game.wanted.level;
    if (copNearby(600)) commitCrime(1);
    if (game.wanted.level > before) addFloatText(car.x, car.y - 30, 'WANTED ★', '#ffd23c', 16);
    announce(wasTarget ? 'That is the coupe. Get it to Sol Garage.' : 'Car taken. Drive.');
  }
  if (car.kind === 'taxi') announce('Taxi — fares pay cash. Look for the green TAXI pin.');
  audio.ensure();
  audio.radioStart(game.radioStation);
  game.radioName = audio.radioStations()[game.radioStation] || 'COSTA SYNTHWAVE';
  game.radioBlurb = audio.radioBlurb();
  game.radioBanner = 2.5;
  audio.pickup();
  return true;
}

function exitCar() {
  const car = game.player.car;
  if (!car) return;
  const a = car.angle + Math.PI / 2;
  game.player.x = car.x + Math.cos(a) * 36;
  game.player.y = car.y + Math.sin(a) * 36;
  game.player.onFoot = true;
  game.player.car = null;
  game.player.angle = car.angle;
  game.cars.push(car);
  car.speed = 0;
  audio.radioStop();
  game.radioBanner = 0;
}

function tryPunch() {
  if (game.screen !== 'play' || !game.player.onFoot) return;
  if (!playerPunch(game.player)) return;
  audio.punch();
  for (const ped of game.peds) {
    if (ped.down > 0) continue;
    const d = dist(game.player.x, game.player.y, ped.x, ped.y);
    if (d < PUNCH_RANGE + 12) {
      const facing = Math.cos(game.player.angle) * (ped.x - game.player.x) + Math.sin(game.player.angle) * (ped.y - game.player.y);
      if (facing > 0 && knockPedDown(ped)) {
        if (copNearby(600)) commitCrime(1);
        scarePeds(game.peds, ped.x, ped.y, 260);
        renderer.addShake(0.25);
        return;
      }
    }
  }
}

function tryShoot() {
  if (!game.player.onFoot || game.mouseDown === false) return;
  const world = screenToWorld(game.mouseX, game.mouseY);
  const bullet = playerShoot(game.player, world.x, world.y);
  if (!bullet) return;
  game.bullets.push(bullet);
  audio.shoot();
  renderer.addShake(0.12);
  scarePeds(game.peds, game.player.x, game.player.y, 420);
  if (copNearby(800)) commitCrime(1);
}

function spawnParticles(x, y, color, count, speed) {
  // One pooled burst: no object is allocated per particle any more.
  spawnBurst(game.particles, x, y, color, count, speed, 0.5, 2.5, 0);
}

/**
 * Step the bullets: each one flies, and dies when its life runs out, when it
 * leaves the map, when it drops a pedestrian, or when it punches a car.
 * Shooting a cop — or shooting where one can see — is a crime, and a hit
 * throws a few sparks so the shot reads. Returns nothing; bullets that die
 * are spliced out of the game's list.
 */
function updateBullets(dt) {
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H)) dead = true;
    if (!dead) {
      for (const ped of game.peds) {
        if (ped.down > 0) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 14) {
          knockPedDown(ped);
          commitCrime(1);
          scarePeds(game.peds, ped.x, ped.y, 300);
          spawnParticles(b.x, b.y, '#c03030', 6, 90);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      // A bullet checks cars in the car's own frame: along the body and
      // across it, so a shot down the side of a long car still counts.
      for (const car of game.cars) {
        if (car.dead) continue;
        if (bulletHitsCar(b, car)) {
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const cop of game.police) {
          if (cop.dead) continue;
          if (bulletHitsCar(b, cop)) {
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }
}

/**
 * One bullet against one car: true when it lands, and the hit itself is
 * applied here (damage, the crime when it counts, the spark). The two car
 * lists are walked separately so no throwaway array is allocated per shot.
 */
function bulletHitsCar(b, car) {
  const dx = b.x - car.x;
  const dy = b.y - car.y;
  const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
  const side = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
  if (Math.abs(along) >= 24 || Math.abs(side) >= 14) return false;
  car.health -= b.damage;
  if (car.kind === 'police') commitCrime(1);
  else if (copNearby(700)) commitCrime(1);
  spawnParticles(b.x, b.y, '#ffd23c', 5, 80);
  return true;
}

/**
 * Police contact, only while wanted: a stood-down cop is just traffic, and
 * must not waste Lena on foot after the heat already cleared. On foot a
 * cruiser nudges her (light damage, a shove on a fresh hit, and the arrest
 * timer at two stars and up); in a car it rams her ride. Returns true when
 * the contact ended the game (wasted or busted), so the step stops there.
 */
function updatePoliceContact(dt) {
  const player = game.player;
  for (const cop of game.police) {
    if (game.wanted.level === 0) break;
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, player.x, player.y);
    if (player.onFoot) {
      if (d < 34) {
        // A cruiser nudging Lena hurts, but lightly: repeated rams should end
        // in an arrest (the 1.5 s busted timer), not in her dying on the spot.
        // The shove lands only on a fresh hit (hurtTimer just set): shoving
        // her every frame while a cruiser sits on her used to push her out
        // of the QuickStop till zone faster than she could hold E.
        if (hurtPlayer(player, 4)) {
          endGame('wasted');
          return true;
        }
        if (player.hurtTimer > 0.5) knockPlayer(player, player.x - cop.x, player.y - cop.y, 150);
        renderer.addShake(0.5);
        audio.crash();
        if (game.wanted.level >= 2) {
          player.bustedTimer += dt;
          // Swarmed on foot, the arrest comes before the beating: a shorter
          // fuse and a slow decay, so repeated contact ends in BUSTED (a
          // clean mission retry) instead of death by bumper cars.
          if (player.bustedTimer > 1.5) {
            endGame('busted');
            return true;
          }
        }
      } else {
        player.bustedTimer = Math.max(0, player.bustedTimer - dt * 0.5);
      }
    } else if (player.car && d < 46 && Math.abs(cop.speed) > 120 && cop.ramCooldown <= 0) {
      cop.ramCooldown = 1.8;
      if (hurtPlayer(player, 6)) {
        endGame('wasted');
        return true;
      }
      player.car.health -= 4;
      renderer.addShake(0.55);
      audio.crash();
      spawnParticles(cop.x, cop.y, '#ffd23c', 8, 120);
    }
  }
  return false;
}

function addTireMark(x1, y1, x2, y2) {
  game.tireMarks.push({ x1, y1, x2, y2, life: 1 });
  if (game.tireMarks.length > 140) game.tireMarks.shift();
}

/** Take the waiting fare pedestrian out of the crowd (boarded, or gave up). */
function removeFarePed() {
  if (!game.farePed) return;
  const i = game.peds.indexOf(game.farePed);
  if (i >= 0) game.peds.splice(i, 1);
  game.farePed = null;
}

// ---------------------------------------------------------------- the step

function stepWorld(dt) {
  const player = game.player;
  game.elapsed += dt;
  if (game.crimeCooldown > 0) game.crimeCooldown -= dt;
  if (game.carCrashCooldown > 0) game.carCrashCooldown -= dt;
  if (reloadTimer > 0) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) {
      reloadWeapon(player);
      audio.click();
    }
  }
  if (game.missions.banner > 0) game.missions.banner -= dt;
  if (game.radioBanner > 0) game.radioBanner -= dt;
  if (!player.onFoot && player.car) audio.radioTick();

  // --- input direction
  const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const handbrake = keys.has('Space');

  // --- interact: enter or leave a car — unless the press belongs to a mission
  // action (picking up a fare or a package, or emptying a till). Without this,
  // E near a car always enters it and the mission press never reaches the job.
  if (game.interactPressed) {
    const obj = currentObjective(game.missions);
    let missionAction = false;
    if (obj && obj.type === 'pickup') {
      const px = player.car ? player.car.x : player.x;
      const py = player.car ? player.car.y : player.y;
      missionAction = dist(px, py, obj.x, obj.y) < obj.r;
    } else if (obj && obj.type === 'rob' && player.onFoot) {
      missionAction = dist(player.x, player.y, obj.x, obj.y) < obj.r;
    }
    if (!missionAction) {
      game.interactPressed = false;
      if (!player.onFoot) {
        // A fare waiting by the road boards before E means "get out": pull
        // up next to the green TAXI pin and the passenger climbs in.
        const fare = tryBoardTaxi(game.side, game, player.x, player.y);
        if (fare > 0) {
          removeFarePed();
          audio.taxiBlip();
          announce(`Fare aboard — drop them off for $${fare}.`);
        } else {
          exitCar();
        }
      } else {
        tryEnterCar();
      }
    }
    // When it is a mission action, interactPressed stays set: updateMission
    // consumes it for the pickup.
  }

  if (player.onFoot) {
    updatePlayerOnFoot(player, { x: mx, y: my }, run, dt, game.city);
    if (game.mouseDown) tryShoot();
  } else if (player.car) {
    const car = player.car;
    // Scripted input (screenshot autopilot) overrides the keyboard when set.
    // A negative autoGas brakes (the autopilot's way to slow for a corner).
    const gas = game.autoGas !== undefined ? Math.max(0, game.autoGas) : (my < 0 ? 1 : 0);
    const brake = game.autoGas !== undefined ? (game.autoGas < 0 ? 1 : 0) : (my > 0 ? 1 : 0);
    const steer = game.autoSteer !== undefined ? game.autoSteer : mx;
    const px = car.x;
    const py = car.y;
    driveCar(car, gas, brake, steer, handbrake, dt, game.city);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (handbrake && Math.abs(car.speed) > 200) {
      addTireMark(px - Math.cos(car.angle) * 18, py - Math.sin(car.angle) * 18, car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18);
    }
    // Sharp turn at speed leaves skid marks too, not just the handbrake.
    if (Math.abs(steer) > 0.7 && Math.abs(car.speed) > 350) {
      addTireMark(px - Math.cos(car.angle) * 18, py - Math.sin(car.angle) * 18, car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18);
    }
    // Damage smoke: white under 60% HP, black under 30% (pooled puffs).
    if (car.health < 60 && Math.random() < 0.5) {
      spawnSmoke(game.particles, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 1, car.health < 30);
    }
    if (car.smoke > 0.3 && Math.random() < 0.3) {
      spawnSmoke(game.particles, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 1, false);
    }
    if (car.dead) {
      // The car gave up: a fireball, a shake, and Lena climbs out of the
      // wreck hurt. If it was the mission coupe, a fresh one is parked back
      // at the west park so the job can still be finished.
      const wasTarget = car === game.targetCar;
      spawnParticles(car.x, car.y, '#ff8030', 26, 220);
      spawnParticles(car.x, car.y, '#ffd23c', 14, 160);
      addFloatText(car.x, car.y - 40, 'CAR WRECKED!', '#ff8030', 20);
      audio.crash();
      renderer.addShake(0.9);
      audio.radioStop();
      game.radioBanner = 0;
      player.health = Math.max(1, player.health - 20);
      player.car = null;
      player.onFoot = true;
      // Eject onto dry land: a wreck at the harbour edge must not drop Lena
      // into the water, where the no-swimming rule would freeze her in place
      // while the police close in.
      let ex = car.x + 40;
      let ey = car.y;
      if (isWaterAt(game.city, ex, ey)) {
        const options = [[car.x - 40, car.y], [car.x, car.y - 40], [car.x, car.y + 40], [car.x, car.y]];
        for (const [ox, oy] of options) {
          if (!isWaterAt(game.city, ox, oy)) { ex = ox; ey = oy; break; }
        }
      }
      player.x = ex;
      player.y = ey;
      game.cars.push(car);
      if (wasTarget) ensureTargetCar();
      // A wreck must never strand Lena on foot in a chase: a ride nearby.
      ensureCarNear(player.x, player.y);
    }
  }

  // --- bullets: fly, hit a ped or a car, or fizzle out on their own
  updateBullets(dt);

  // --- pedestrians
  const danger = game.mouseDown && player.onFoot ? { x: player.x, y: player.y, r: 420 } : null;
  for (const ped of game.peds) updatePed(ped, dt, game.city, rng, danger);

  // --- traffic
  for (const car of game.cars) {
    if (car.kind === 'traffic') updateTrafficCar(car, dt, game.cars, rng, game.peds);
  }
  game.trafficTimer -= dt;
  if (game.trafficTimer <= 0) {
    game.trafficTimer = 2;
    const traffic = game.cars.filter((c) => c.kind === 'traffic' && !c.dead);
    if (traffic.length < TRAFFIC_TARGET) {
      const p = randomRoadPoint(rng, player.x, player.y, 600);
      const car = createCar(p.x, p.y, 0, 'traffic', rng);
      game.cars.push(car);
    }
    // Recycle traffic that wandered far away.
    for (let i = game.cars.length - 1; i >= 0; i -= 1) {
      const car = game.cars[i];
      if (car.kind === 'traffic' && dist(car.x, car.y, player.x, player.y) > 1600) game.cars.splice(i, 1);
    }
    // Fade out wrecks.
    for (let i = game.cars.length - 1; i >= 0; i -= 1) {
      const car = game.cars[i];
      if (car.dead && car.fade <= 0) game.cars.splice(i, 1);
    }
  }

  // --- the player car vs the world: hitting people and traffic
  if (player.car && !player.car.dead) {
    const car = player.car;
    const speed = Math.abs(car.speed);
    for (const ped of game.peds) {
      if (ped.down > 0) continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 26 && speed > 60) {
        knockPedDown(ped);
        commitCrime(1);
        scarePeds(game.peds, ped.x, ped.y, 300);
        spawnParticles(ped.x, ped.y, '#c03030', 8, 120);
        renderer.addShake(0.4);
        audio.crash();
      }
    }
    for (const other of game.cars) {
      if (other.dead || other === car) continue;
      // One smash per cooldown window: without it a single shunt drains the
      // whole health bar in a few frames while the cars overlap.
      if (dist(car.x, car.y, other.x, other.y) < 42 && speed > 240 && game.carCrashCooldown <= 0) {
        game.carCrashCooldown = 0.8;
        other.health -= (speed - 200) / 14;
        car.health -= (speed - 200) / 30;
        // Only a hard smash in plain sight of a cop earns a star: a parking
        // nudge at city speed is not a crime spree.
        if (speed > 420 && copNearby(450)) commitCrime(1);
        spawnParticles(other.x, other.y, '#ffd23c', 8, 120);
        renderer.addShake(0.45);
        audio.crash();
      }
    }
  }
  separateCars(game.cars.concat(game.police, player.car ? [player.car] : []));

  // --- wanted and police
  const pos = { x: player.x, y: player.y };
  const wantedEvent = updateWanted(game.wanted, dt, pos, game.police, game.city.hideout);
  if (wantedEvent === 'hidden') announce('Lost them in the garage. The heat is off.');
  else if (wantedEvent === 'cooled' && game.wanted.level === 0) announce('The heat died down.');

  game.policeTimer -= dt;
  const targetCops = policeTargetCount(game.wanted.level);
  if (game.policeTimer <= 0) {
    // Hotter heat brings cruisers faster (v3 wanted tuning).
    game.policeTimer = policeSpawnInterval(game.wanted.level);
    const alive = game.police.filter((c) => !c.dead);
    if (alive.length < targetCops) {
      game.police.push(spawnPoliceCar(rng, player.x, player.y));
    }
    // Cops give up when the heat is gone and they are far away.
    if (game.wanted.level === 0) {
      for (let i = game.police.length - 1; i >= 0; i -= 1) {
        if (dist(game.police[i].x, game.police[i].y, player.x, player.y) > 900) game.police.splice(i, 1);
      }
    }
  }
  for (const cop of game.police) updatePoliceCar(cop, dt, player, game.city, game.wanted.level > 0);
  for (let i = game.police.length - 1; i >= 0; i -= 1) {
    if (game.police[i].dead && game.police[i].fade <= 0) game.police.splice(i, 1);
  }

  // --- police contact: a cruiser on top of Lena hurts her, or rams her car
  if (updatePoliceContact(dt)) return;

  // --- missions
  const missionEvent = updateMission(game.missions, game, dt);
  if (missionEvent === 'mission') {
    const done = game.missions.justCompleted;
    if (done) {
      game.money += done.reward;
      audio.jingle();
      addFloatText(player.x, player.y - 44, `+$${done.reward}`, '#7de89a', 22);
      addFloatText(player.x, player.y - 70, 'MISSION COMPLETE', '#ffd23c', 18);
      saveGame(game);
      const next = nextMissionPreview(game.missions);
      announce(next
        ? `${done.title} complete — +$${done.reward}. Next: ${next.title} ($${next.reward}).`
        : `${done.title} complete — +$${done.reward}.`);
      // The next job may need wheels: never start it stranded on foot with
      // no car in reach.
      if (!game.missions.done) ensureCarNear(player.x, player.y);
      if (game.missions.index === 1) ensureTargetCar(); // mission 2 needs its coupe
      if (game.missions.done) {
        showScreen('complete');
        const side = sideTotals(game.side);
        document.getElementById('complete-text').textContent = `The debt is paid. Lena is free — and Costa Sol is hers. Final take: $${game.money} (side work: $${side.earned} from ${side.fares} fares, ${side.packages} packages, ${side.jumps} jumps).`;
        audio.jingle();
      }
    }
  } else if (missionEvent === 'failed') {
    announce('Out of time. The job is blown — try again.');
    // Retry clean: fresh timer, the mission car back on the map, a ride
    // nearby, and no leftover state from the failed attempt.
    resetMissionClean(game.missions);
    ensureTargetCar();
    ensureCarNear(player.x, player.y);
  }
  // Mission 6 opens with the whole city on her tail; the robbery arms three stars.
  if (game.missions.index === 5 && game.missions.objective === 0 && game.wanted.level < 4) setWanted(game.wanted, 4);
  if (game.robbed) {
    game.robbed = false;
    addWanted(game.wanted, 3);
    announce('Alarm! Three stars — run!');
  }

  // --- particles (one pooled sweep), tire marks and floating texts fade
  updateParticles(game.particles, dt);

  // --- side work: taxi fares, hidden packages, stunt jumps
  const sideEvent = updateSide(game.side, game, dt);
  if (sideEvent === 'fare-waiting') {
    const t = game.side.taxi;
    const ped = createWaitingPed(t.px, t.py);
    game.peds.push(ped);
    game.farePed = ped;
    announce('A fare is waiting — pull up in a car and press E.');
  } else if (sideEvent === 'fare-expired') {
    removeFarePed();
    announce('The fare gave up waiting.');
  } else if (sideEvent === 'fare-late') {
    removeFarePed();
    announce('Too slow — the fare walked off.');
  }
  if (player.onFoot) {
    const found = collectPackageAt(game.side, player.x, player.y);
    if (found > 0) {
      game.money += found;
      audio.cash();
      addFloatText(player.x, player.y - 34, `+$${found} HIDDEN PACKAGE`, '#ffd23c', 16);
      announce(`Hidden package found — +$${found}.`);
    }
  } else if (player.car) {
    const jumpSpeed = checkJump(game.side, player.car);
    if (jumpSpeed > 0) {
      game.money += JUMP_REWARD;
      audio.jumpWhoosh();
      renderer.addShake(0.5);
      addFloatText(player.x, player.y - 44, `STUNT JUMP! +$${JUMP_REWARD}`, '#ff8c28', 20);
      announce(`Stunt jump at ${Math.round(jumpSpeed * 0.24)} km/h — +$${JUMP_REWARD}.`);
    }
    const farePay = taxiArrived(game.side, player.x, player.y);
    if (farePay > 0) {
      game.money += farePay;
      audio.cash();
      removeFarePed();
      addFloatText(player.x, player.y - 44, `FARE +$${farePay}`, '#7de89a', 20);
      announce(`Fare delivered — +$${farePay}.`);
    }
  }
  for (let i = game.floatTexts.length - 1; i >= 0; i -= 1) {
    const f = game.floatTexts[i];
    f.y -= 34 * dt;
    f.life -= dt;
    if (f.life <= 0) game.floatTexts.splice(i, 1);
  }
  for (let i = game.tireMarks.length - 1; i >= 0; i -= 1) {
    game.tireMarks[i].life -= dt * 0.25;
    if (game.tireMarks[i].life <= 0) game.tireMarks.splice(i, 1);
  }

  // --- audio follows the car and the sirens
  if (player.car) audio.engine(Math.abs(player.car.speed) / 620, keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  else audio.engine(0, 0);
  audio.siren(dt, game.police.length > 0 && game.wanted.level > 0);
}

// ---------------------------------------------------------------- the loop

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - (frame.last || now)) / 1000, MAX_FRAME);
  frame.last = now;
  // Frame-rate readout: count frames over each half second, smoothed by the
  // HUD's own update. Reported honestly — headless software rendering is
  // slower than a real GPU, and the number says what it says.
  game.fpsFrames += 1;
  game.fpsTime += dt;
  if (game.fpsTime >= 0.5) {
    game.fps = Math.round(game.fpsFrames / game.fpsTime);
    game.fpsFrames = 0;
    game.fpsTime = 0;
  }
  if (game.screen === 'play') {
    frame.acc = (frame.acc || 0) + dt;
    let guard = 0;
    while (frame.acc >= STEP && guard < 8) {
      stepWorld(STEP);
      frame.acc -= STEP;
      guard += 1;
      if (game.screen !== 'play') break;
    }
  } else if (game.screen === 'title') {
    // The city lives behind the title: traffic cruises, people stroll.
    for (const car of game.cars) {
      if (car.kind === 'traffic') updateTrafficCar(car, STEP, game.cars, rng, game.peds);
    }
    for (const ped of game.peds) updatePed(ped, STEP, game.city, rng, null);
  }
  if (game.screen !== 'title') {
    renderer.draw(game);
    updateHud(hud, game);
    drawMinimap(hud, game);
  } else {
    renderer.draw(game);
  }
}

// ---------------------------------------------------------------- shots

/** Steer Lena's car toward a point: the autopilot the screenshots use. It only
 * sets the scripted input — stepWorld does the actual driving, so the car never
 * moves twice in one step. */
function autopilotDrive(tx, ty) {
  const car = game.player.car;
  if (!car) return;
  const wantAngle = Math.atan2(ty - car.y, tx - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  game.autoSteer = clamp(diff * 2.4, -1, 1);
  game.autoGas = 1;
}

/**
 * Run the world forward for `seconds`, the autopilot driving toward (tx, ty) —
 * or, with `follow`, along one road: it aims 400 px ahead on that road's line,
 * so the car stays on the asphalt instead of cutting across blocks and wedging
 * itself on a building corner when it overshoots the target.
 */
function simulateDrive(seconds, tx, ty, follow) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    let gx = tx;
    let gy = ty;
    if (follow && game.player.car) {
      const car = game.player.car;
      if (follow.axis === 'h') {
        gx = car.x + 400 * follow.dir;
        gy = follow.line;
      } else {
        gx = follow.line;
        gy = car.y + 400 * follow.dir;
      }
    }
    autopilotDrive(gx, gy);
    stepWorld(STEP);
    if (game.screen !== 'play') break;
  }
}

/** Put Lena in a car at (x, y) facing `angle`, moving at `speed`. */
function stageInCar(x, y, angle, speed) {
  const car = createCar(x, y, angle, 'player', rng);
  car.speed = speed;
  game.player.car = car;
  game.player.onFoot = false;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = angle;
}

function stageShot(name) {
  showScreen('play');
  game.screen = 'play';
  if (name === 'cover') {
    // The chase: wanted 3, two cruisers on her tail, traffic ahead, mission 3.
    stageInCar(1400, 1400, 0, 480);
    game.missions.index = 2;
    startMission(game.missions, 2);
    game.missions.objective = 1;
    game.missions.timer = 132;
    setWanted(game.wanted, 3);
    const cop1 = spawnPoliceCar(rng, 1400, 1400);
    cop1.x = 1180; cop1.y = 1330; cop1.angle = 0; cop1.speed = 520;
    const cop2 = spawnPoliceCar(rng, 1400, 1400);
    cop2.x = 1120; cop2.y = 1480; cop2.angle = 0; cop2.speed = 500;
    game.police.push(cop1, cop2);
    // Traffic on the parallel streets, in frame but out of her lane.
    const ahead1 = createCar(1900, 1780, 0, 'traffic', rng);
    const ahead2 = createCar(2600, 1820, 0, 'traffic', rng);
    const ahead3 = createCar(1500, 1000, 0, 'traffic', rng);
    game.cars.push(ahead1, ahead2, ahead3);
    simulateDrive(3, 4200, 1400, { axis: 'h', line: 1400, dir: 1 });
  } else if (name === 'driving') {
    // Cruising the avenue with traffic, mission 1 waiting for its pickup.
    stageInCar(2200, 900, Math.PI / 2, 340);
    startMission(game.missions, 0);
    // Traffic on the parallel avenues, in frame beside her.
    const t1 = createCar(1800, 1300, Math.PI / 2, 'traffic', rng);
    const t2 = createCar(2600, 1700, Math.PI / 2, 'traffic', rng);
    const t3 = createCar(1800, 2100, Math.PI / 2, 'traffic', rng);
    game.cars.push(t1, t2, t3);
    simulateDrive(2, 2200, 2600, { axis: 'v', line: 2200, dir: 1 });
  } else if (name === 'mission') {
    // The hot package: 62 seconds left, foot down toward the north marina.
    stageInCar(1800, 1800, 0, 460);
    startMission(game.missions, 3);
    game.missions.objective = 1;
    game.missions.timer = 62;
    game.money = 540;
    // Traffic on the parallel streets, in frame but out of her lane.
    const t1 = createCar(2400, 2200, 0, 'traffic', rng);
    const t2 = createCar(3000, 1400, 0, 'traffic', rng);
    game.cars.push(t1, t2);
    simulateDrive(2.5, 4400, 1800, { axis: 'h', line: 1800, dir: 1 });
  } else {
    // On foot by the north plaza, pedestrians strolling, mission 1 still open
    // — and a hidden package glinting by the fountain, so the frame shows
    // the side work too.
    game.player.x = 1240;
    game.player.y = 900;
    game.player.onFoot = true;
    game.player.angle = -Math.PI / 2;
    startMission(game.missions, 0);
    // Pull a few pedestrians onto the sidewalks around her, so the frame
    // shows the city's people, not just its streets.
    const nearSpots = [[1170, 820], [1310, 840], [1150, 960], [1330, 980], [1240, 780], [1100, 900]];
    for (let i = 0; i < nearSpots.length && i < game.peds.length; i += 1) {
      game.peds[i].x = nearSpots[i][0];
      game.peds[i].y = nearSpots[i][1];
      game.peds[i].tx = nearSpots[i][0] + 120;
      game.peds[i].ty = nearSpots[i][1];
    }
    for (let i = 0; i < 300; i += 1) stepWorld(STEP);
  }
  // The autopilot's job is done; clear its input so nothing leaks past the shot.
  game.autoSteer = undefined;
  game.autoGas = undefined;
  updateHud(hud, game);
  drawMinimap(hud, game);
  // Snap the camera onto Lena: the renderer only lerps toward her a little per
  // frame, and a staged shot paints twice — without this she would be off-frame.
  const fx = game.player.car ? game.player.car.x : game.player.x;
  const fy = game.player.car ? game.player.car.y : game.player.y;
  renderer.camera.x = clamp(fx - 640, -80, WORLD_W - 1280 + 80);
  renderer.camera.y = clamp(fy - 360, -80, WORLD_H - 720 + 80);
  let painted = 0;
  function paint() {
    renderer.draw(game);
    updateHud(hud, game);
    drawMinimap(hud, game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// ---------------------------------------------------------------- boot

// The Continue button only shows when a save exists, and says what is in it.
if (!hasSave()) {
  const b = document.getElementById('btn-continue');
  if (b) b.style.display = 'none';
} else {
  const b = document.getElementById('btn-continue');
  const summary = saveSummary();
  if (b && summary) b.textContent = summary;
}
showScreen('title');
announce('Costa Sol. Press Enter or click New Game to start.');
window.__game = game;

if (shot) stageShot(shot === 'foot' ? 'foot' : shot);
else requestAnimationFrame(frame);
