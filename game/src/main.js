// Boot and the one loop: Costa Sol runs in fixed 1/60 s steps, the renderer paints
// what is there, and the game moves between title, play, paused, game over and
// story complete. ?shot=cover|driving|mission|foot (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.

import { createCity, clamp, dist, randomRoadPoint, WORLD_H, WORLD_W } from './city.js';
import { createPlayer, updatePlayerOnFoot, playerPunch, playerShoot, hurtPlayer, healPlayer, MAX_HEALTH, PUNCH_RANGE, PUNCH_DAMAGE } from './player.js';
import { createCar, driveCar, updateTrafficCar, updatePoliceCar, separateCars, spawnTraffic, spawnParkedCars, spawnPoliceCar, CAR_RADIUS } from './vehicles.js';
import { spawnPedestrians, updatePed, knockPedDown, scarePeds } from './pedestrians.js';
import { createMissionState, startMission, updateMission, currentMission, currentObjective, MISSIONS, DEBT_TOTAL } from './missions.js';
import { createWanted, addWanted, setWanted, clearWanted, policeTargetCount, updateWanted } from './wanted.js';
import { createHud, updateHud, drawMinimap } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadSave, hasSave, clearSave } from './save.js';
import { createRenderer } from './render.js';

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
  const game = {
    city, player,
    cars: cars.concat(parked),
    targetCar: target,
    police: [],
    peds: spawnPedestrians(rng, PED_COUNT),
    bullets: [],
    particles: [],
    tireMarks: [],
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
  };
  startMission(game.missions, 0);
  return game;
}

const game = createGame();

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
  if (event.code === 'KeyR') reloadTimer = 0.8;
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
  announce(reason === 'busted' ? 'Busted.' : 'Wasted.');
}

function respawn() {
  const lost = Math.floor(game.money * 0.1);
  game.money -= lost;
  game.player.x = game.city.hospitalSpawn.x;
  game.player.y = game.city.hospitalSpawn.y;
  game.player.health = MAX_HEALTH;
  game.player.onFoot = true;
  game.player.car = null;
  game.player.ammo = 12;
  game.player.bustedTimer = 0;
  for (const cop of game.police) cop.dead = true;
  game.police = [];
  clearWanted(game.wanted);
  const idx = game.missions.done ? MISSIONS.length - 1 : game.missions.index;
  startMission(game.missions, Math.min(idx, MISSIONS.length - 1));
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
  if (game.wanted.level > before) audio.sting();
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
    if (copNearby(600)) commitCrime(1);
    announce(wasTarget ? 'That is the coupe. Get it to Sol Garage.' : 'Car taken. Drive.');
  }
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
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, maxLife: 0.5, size: 2 + Math.random() * 3, color });
  }
}

function addTireMark(x1, y1, x2, y2) {
  game.tireMarks.push({ x1, y1, x2, y2, life: 1 });
  if (game.tireMarks.length > 140) game.tireMarks.shift();
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
      player.ammo = 12;
      audio.click();
    }
  }
  if (game.missions.banner > 0) game.missions.banner -= dt;

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
      if (player.onFoot) tryEnterCar();
      else exitCar();
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
    if (car.smoke > 0.3 && Math.random() < 0.3) {
      game.particles.push({ x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20, vx: -Math.cos(car.angle) * 20, vy: -30, life: 0.8, maxLife: 0.8, size: 5, color: '#888888' });
    }
    if (car.dead) {
      // The car gave up: Lena climbs out of the wreck.
      spawnParticles(car.x, car.y, '#ff8030', 14, 160);
      audio.crash();
      renderer.addShake(0.7);
      player.car = null;
      player.onFoot = true;
      player.x = car.x + 40;
      player.y = car.y;
      game.cars.push(car);
    }
  }

  // --- bullets
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
      for (const car of game.cars.concat(game.police)) {
        if (car.dead) continue;
        const dx = b.x - car.x;
        const dy = b.y - car.y;
        const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const side = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
        if (Math.abs(along) < 24 && Math.abs(side) < 14) {
          car.health -= b.damage;
          if (car.kind === 'police') commitCrime(1);
          else if (copNearby(700)) commitCrime(1);
          spawnParticles(b.x, b.y, '#ffd23c', 5, 80);
          dead = true;
          break;
        }
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }

  // --- pedestrians
  const danger = game.mouseDown && player.onFoot ? { x: player.x, y: player.y, r: 420 } : null;
  for (const ped of game.peds) updatePed(ped, dt, game.city, rng, danger);

  // --- traffic
  for (const car of game.cars) {
    if (car.kind === 'traffic') updateTrafficCar(car, dt, game.cars, rng);
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
        if (speed > 320 && copNearby(600)) commitCrime(1);
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
    game.policeTimer = 1.2;
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
  for (const cop of game.police) updatePoliceCar(cop, dt, player, game.city);
  for (let i = game.police.length - 1; i >= 0; i -= 1) {
    if (game.police[i].dead && game.police[i].fade <= 0) game.police.splice(i, 1);
  }

  // --- police ramming Lena
  for (const cop of game.police) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, player.x, player.y);
    if (player.onFoot) {
      if (d < 34) {
        if (hurtPlayer(player, 10)) {
          endGame('wasted');
          return;
        }
        renderer.addShake(0.5);
        audio.crash();
        if (game.wanted.level >= 2) {
          player.bustedTimer += dt;
          if (player.bustedTimer > 2) {
            endGame('busted');
            return;
          }
        }
      } else {
        player.bustedTimer = Math.max(0, player.bustedTimer - dt);
      }
    } else if (player.car && d < 46 && Math.abs(cop.speed) > 120 && cop.ramCooldown <= 0) {
      cop.ramCooldown = 1.2;
      if (hurtPlayer(player, 8)) {
        endGame('wasted');
        return;
      }
      player.car.health -= 6;
      renderer.addShake(0.55);
      audio.crash();
      spawnParticles(cop.x, cop.y, '#ffd23c', 8, 120);
    }
  }

  // --- missions
  const missionEvent = updateMission(game.missions, game, dt);
  if (missionEvent === 'mission') {
    const done = game.missions.justCompleted;
    if (done) {
      game.money += done.reward;
      audio.jingle();
      saveGame(game);
      announce(`${done.title} complete — +$${done.reward}.`);
      if (game.missions.done) {
        showScreen('complete');
        document.getElementById('complete-text').textContent = `The debt is paid. Lena is free — and Costa Sol is hers. Final take: $${game.money}.`;
        audio.jingle();
      }
    }
  } else if (missionEvent === 'failed') {
    announce('Out of time. The job is blown — try again.');
    startMission(game.missions, game.missions.index);
  }
  // Mission 6 opens with the whole city on her tail; the robbery arms three stars.
  if (game.missions.index === 5 && game.missions.objective === 0 && game.wanted.level < 4) setWanted(game.wanted, 4);
  if (game.robbed) {
    game.robbed = false;
    addWanted(game.wanted, 3);
    announce('Alarm! Three stars — run!');
  }

  // --- particles and tire marks fade
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) game.particles.splice(i, 1);
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
      if (car.kind === 'traffic') updateTrafficCar(car, STEP, game.cars, rng);
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
    // On foot by the park, pedestrians strolling, mission 1 still open.
    game.player.x = 2350;
    game.player.y = 1560;
    game.player.onFoot = true;
    game.player.angle = -Math.PI / 2;
    startMission(game.missions, 0);
    // Pull a few pedestrians onto the sidewalks around her, so the frame
    // shows the city's people, not just its streets.
    const nearSpots = [[2280, 1480], [2420, 1500], [2260, 1620], [2440, 1640], [2350, 1440], [2200, 1560]];
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

// The Continue button only shows when a save exists.
if (!hasSave()) {
  const b = document.getElementById('btn-continue');
  if (b) b.style.display = 'none';
}
showScreen('title');
announce('Costa Sol. Press Enter or click New Game to start.');
window.__game = game;

if (shot) stageShot(shot === 'foot' ? 'foot' : shot);
else requestAnimationFrame(frame);
