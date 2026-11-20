// Cars: Lena's driving, the traffic that fills the avenues, and the police who
// chase her. One arcade physics model drives them all — a heading, a forward
// speed, steering that bites harder the faster you go, and a handbrake that
// breaks the rear loose. Traffic follows the road grid; police hunt the player.

import { clamp, createRng, dist, isBlockedAt, isOnRoad, isWaterAt, nearestRoadPoint, randomRoadPoint, resolveCircle, ROAD_H, ROAD_V } from './city.js';

export const CAR_W = 46;
export const CAR_H = 24;
export const CAR_RADIUS = 20;
export const MAX_SPEED = 620;
export const POLICE_MAX_SPEED = 700;
export const ENGINE_ACCEL = 420;
export const BRAKE_ACCEL = 700;

/** Four vehicle classes: each has its own top speed, acceleration, steering,
 * mass and footprint, so traffic feels varied and the police interceptor is
 * genuinely faster and heavier than a compact. */
export const VEHICLE_CLASSES = {
  compact: { topSpeed: 470, accel: 380, turnRate: 3.0, mass: 0.9, w: 40, h: 22 },
  sedan: { topSpeed: 560, accel: 420, turnRate: 2.6, mass: 1.2, w: 46, h: 24 },
  sports: { topSpeed: 700, accel: 560, turnRate: 3.2, mass: 1.0, w: 46, h: 22 },
  police: { topSpeed: 700, accel: 540, turnRate: 3.0, mass: 1.5, w: 48, h: 24 },
};

const CLASS_KEYS = ['compact', 'sedan', 'sports'];

/** Plain-language names for the four classes, for the HUD and the legend. */
export function vehicleClassLabel(vclass) {
  if (vclass === 'compact') return 'Compact';
  if (vclass === 'sports') return 'Sports';
  if (vclass === 'police') return 'Police Interceptor';
  return 'Sedan';
}

/** True when the car is a yellow cab (fares pay cash — see side.js). */
export function isTaxi(car) {
  return car.kind === 'taxi';
}

function pickClass(rng) {
  const r = rng ? rng() : Math.random();
  if (r < 0.35) return 'compact';
  if (r < 0.8) return 'sedan';
  return 'sports';
}

const CAR_COLORS = ['#e8b13c', '#4a90d8', '#d84a4a', '#4ad88a', '#e8e8e8', '#8a6ad8', '#d88a3c', '#3cc8c8', '#c8c8c8', '#7a8a9a'];
const TAXI_COLOR = '#f2c230';

/**
 * Make a car. `kind` is 'player' | 'traffic' | 'police' | 'parked' | 'target'
 * (the car a mission asks Lena to steal). A parked car has no driver until stolen.
 */
export function createCar(x, y, angle, kind, rng) {
  const color = kind === 'police' ? '#20242c' : kind === 'taxi' ? TAXI_COLOR : CAR_COLORS[Math.floor((rng ? rng() : Math.random()) * CAR_COLORS.length)];
  const vclass = kind === 'police' ? 'police' : kind === 'target' ? 'sports' : kind === 'player' ? 'sedan' : pickClass(rng);
  const spec = VEHICLE_CLASSES[vclass];
  return {
    x, y, angle, speed: 0,
    kind, color, vclass,
    topSpeed: spec.topSpeed, accel: spec.accel, turnRate: spec.turnRate,
    mass: spec.mass, w: spec.w, h: spec.h,
    health: 100,
    // Traffic AI state: which road it follows and which way along it.
    lane: 0, turnAt: 0, stopped: 0,
    // Police AI state.
    ramCooldown: 0, siren: kind === 'police',
    // Effects.
    skid: 0, smoke: 0,
    wallCooldown: 0, // seconds until the next wall hit can hurt the car
    dead: false, // wrecked beyond driving (traffic wrecks fade out)
    fade: 0,
  };
}

/** The arcade drive model: gas, brake/reverse, steering, handbrake drift.
 * Top speed, acceleration and steering come from the car's class, so a sports
 * coupe outruns a compact and the police interceptor keeps up with both. */
export function driveCar(car, gas, brake, steer, handbrake, dt, city) {
  const top = car.topSpeed || (car.kind === 'police' ? POLICE_MAX_SPEED : MAX_SPEED);
  const accel = car.accel || ENGINE_ACCEL;
  const classTurn = car.turnRate || 2.6;
  if (gas > 0) car.speed += accel * gas * dt;
  if (brake > 0) {
    if (car.speed > 20) car.speed -= BRAKE_ACCEL * brake * dt;
    else car.speed -= accel * 0.55 * brake * dt; // reverse
  }
  // Drag and rolling resistance; the handbrake scrubs speed hard.
  car.speed -= car.speed * (handbrake ? 1.9 : 0.35) * dt;
  car.speed = clamp(car.speed, -180, top);
  const grip = handbrake ? 0.45 : 1;
  // A parked car's wheels still turn: keep some steering authority at low
  // speed, or a car stopped against a wall can never turn away from it.
  const turnRate = classTurn * clamp(Math.abs(car.speed) / 220, 0.15, 1) * grip;
  car.angle += steer * turnRate * Math.sign(car.speed) * dt;
  let nx = car.x + Math.cos(car.angle) * car.speed * dt;
  let ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const ox = car.x;
  const oy = car.y;
  if (car.wallCooldown > 0) car.wallCooldown -= dt;
  // The sea stops cars cold (the pier is the one way over the harbour water).
  // Except a car already in the water — shoved in by a ram or an overshoot
  // past a road's end: it must be able to crawl back to land, or it is
  // wedged there forever with every step blocked.
  if (isWaterAt(city, nx, ny)) {
    if (!isWaterAt(city, car.x, car.y)) {
      car.speed *= 0.3;
      return;
    }
    car.speed = Math.max(-150, Math.min(150, car.speed * 0.8));
    nx = car.x + Math.cos(car.angle) * car.speed * dt;
    ny = car.y + Math.sin(car.angle) * car.speed * dt;
  }
  car.x = nx;
  car.y = ny;
  if (resolveCircle(city, car, CAR_RADIUS)) {
    // The push-out slid the car along the wall: let that stand, so a car that
    // clips a building corner scrapes along it instead of wedging forever.
    // Only a near-standstill after the push means a head-on stop.
    const moved = Math.hypot(car.x - ox, car.y - oy);
    const expected = Math.abs(car.speed) * dt;
    if (moved < expected * 0.4) {
      const hitSpeed = Math.abs(car.speed);
      car.speed *= 0.35;
      if (hitSpeed > 260 && car.wallCooldown <= 0) {
        car.wallCooldown = 0.7;
        car.health -= (hitSpeed - 260) / 12;
        car.smoke = Math.min(1, car.smoke + 0.4);
      }
    }
  }
  if (handbrake && Math.abs(car.speed) > 200) car.skid = 0.12;
  else if (car.skid > 0) car.skid -= dt;
  if (car.smoke > 0) car.smoke -= dt * 0.25;
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    car.fade = 1;
    car.speed = 0;
  }
}

/** Pick a lane offset and a direction for a traffic car on its current road. */
function retargetTraffic(car, rng) {
  const near = nearestRoadPoint(car.x, car.y);
  if (!near) return;
  car.lane = (rng() < 0.5 ? -1 : 1) * 26;
  if (near.axis === 'v') {
    car.angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    car.x = near.x + car.lane;
  } else {
    car.angle = rng() < 0.5 ? 0 : Math.PI;
    car.y = near.y + car.lane;
  }
  car.turnAt = 1 + rng() * 5;
}

/**
 * One traffic car: cruise along its road, slow for the car ahead, and at an
 * intersection sometimes turn onto the crossing road. It never leaves the asphalt.
 * It also yields to pedestrians crossing ahead of it — a car that mows down
 * every jaywalker is not traffic, it is a weapon.
 */
export function updateTrafficCar(car, dt, cars, rng, peds) {
  if (car.dead) {
    car.fade -= dt * 0.4;
    return;
  }
  car.turnAt -= dt;
  // Slow for the car ahead.
  let ahead = Infinity;
  for (let i = 0; i < cars.length; i += 1) {
    const other = cars[i];
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (forward > 0 && forward < 90 && side < 30) ahead = Math.min(ahead, forward);
  }
  // Yield to a pedestrian crossing the road ahead: brake to a stop behind
  // them instead of driving through. Only the nearest crossing ped counts.
  // A fare waiting at a taxi stand is not crossing — traffic flows past them.
  if (peds) {
    for (const ped of peds) {
      if (ped.down > 0 || ped.waiting) continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (forward > 0 && forward < 80 && side < 26) ahead = Math.min(ahead, forward - 30);
    }
  }
  const cruise = (car.topSpeed || 560) * 0.32 + ((car.x * 7 + car.y * 13) % 40);
  const want = ahead < 70 ? Math.max(0, (ahead - 40) * 2) : cruise;
  car.speed += clamp(want - car.speed, -BRAKE_ACCEL * dt, ENGINE_ACCEL * 0.5 * dt);

  // Steer back onto the centre of its lane.
  const near = nearestRoadPoint(car.x, car.y);
  if (near) {
    const targetAngle = near.axis === 'v'
      ? (Math.abs(car.angle - Math.PI / 2) < Math.abs(car.angle + Math.PI / 2) ? Math.PI / 2 : -Math.PI / 2)
      : (Math.abs(car.angle) < Math.abs(car.angle - Math.PI) ? 0 : Math.PI);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clamp(diff, -1.6 * dt, 1.6 * dt);
    // Drift toward the lane line.
    if (near.axis === 'v') car.x += clamp(near.x + car.lane - car.x, -40 * dt, 40 * dt);
    else car.y += clamp(near.y + car.lane - car.y, -40 * dt, 40 * dt);
    // At an intersection, sometimes turn.
    const onCrossing = Math.abs(car.x - near.x) < 70 || Math.abs(car.y - near.y) < 70;
    if (onCrossing && car.turnAt <= 0 && rng() < 0.02) retargetTraffic(car, rng);
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Never leave the roads: nudge a stray car back onto the nearest one.
  if (!isOnRoad(car.x, car.y)) {
    const back = nearestRoadPoint(car.x, car.y);
    if (back) {
      car.x += clamp(back.x - car.x, -120 * dt, 120 * dt);
      car.y += clamp(back.y - car.y, -120 * dt, 120 * dt);
    }
  }
  if (car.ramCooldown > 0) car.ramCooldown -= dt;
}

/**
 * One police car: steer toward Lena, full throttle, and ram her when close.
 * It drives on roads when it can and cuts across blocks when it must — a cop
 * in a hurry does not mind the sidewalk.
 */
/** A cruiser. When `pursuing` it hunts the player; when the heat is gone it
 *  stands down and drives away, so leftover cops do not keep ramming a
 *  player who has already lost them (that used to waste her on foot at
 *  wanted 0, with three cruisers parked on the hideout). */
export function updatePoliceCar(car, dt, player, city, pursuing = true) {
  if (car.dead) {
    car.fade -= dt * 0.4;
    return;
  }
  const tx = player.car ? player.car.x : player.x;
  const ty = player.car ? player.car.y : player.y;
  // Standing down: head away from the player, out to despawn range.
  const wantAngle = Math.atan2(ty - car.y, tx - car.x) + (pursuing ? 0 : Math.PI);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 2.2, -1, 1);
  const d = dist(car.x, car.y, tx, ty);
  const gas = pursuing ? (d > 60 ? 1 : 0.4) : 1;
  driveCar(car, gas, 0, steer, false, dt, city);
  if (car.ramCooldown > 0) car.ramCooldown -= dt;
  if (car.smoke > 0) car.smoke -= dt * 0.25;
}

/** Simple car-vs-car push-apart so traffic and police do not drive through each other. */
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 44;
      if (d > 0.01 && d < min) {
        // Capped per frame: an uncapped push lets a ramming cop shove the
        // player's car forward like a bulldozer, faster than its own engine.
        const push = Math.min((min - d) / 2, 3);
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        // Only a deep overlap scrubs speed: a light tailgate just pushes the
        // cars apart, so a faster car does not grind to a halt behind traffic.
        if (d < 26) {
          a.speed *= 0.94;
          b.speed *= 0.94;
        }
      }
    }
  }
}

/** Spawn the traffic that fills the streets around the player. */
export function spawnTraffic(rng, count, cx, cy) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(rng, cx, cy, 500);
    const car = createCar(p.x, p.y, 0, 'traffic', rng);
    retargetTraffic(car, rng);
    car.speed = 120 + rng() * 80;
    cars.push(car);
  }
  return cars;
}

/** Parked cars along the road edges, waiting to be borrowed. About one in
 * seven is a yellow cab: steal a taxi and the fares pay cash (see side.js). */
export function spawnParkedCars(rng, count) {
  const cars = [];
  const used = new Set();
  for (let i = 0; i < count; i += 1) {
    let px;
    let py;
    let angle;
    if (rng() < 0.5) {
      const road = ROAD_V[Math.floor(rng() * ROAD_V.length)];
      const along = ROAD_H[Math.floor(rng() * ROAD_H.length)] + (rng() - 0.5) * 300;
      const key = `${road}|${Math.round(along / 100)}`;
      if (used.has(key)) continue;
      used.add(key);
      px = road + (rng() < 0.5 ? -42 : 42);
      py = along;
      angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const road = ROAD_H[Math.floor(rng() * ROAD_H.length)];
      const along = ROAD_V[Math.floor(rng() * ROAD_V.length)] + (rng() - 0.5) * 300;
      const key = `${Math.round(along / 100)}|${road}`;
      if (used.has(key)) continue;
      used.add(key);
      px = along;
      py = road + (rng() < 0.5 ? -42 : 42);
      angle = rng() < 0.5 ? 0 : Math.PI;
    }
    if (isBlockedAt({ buildings: [], waterY: 99999, harborX: 99999, pier: { x: 0, y: 0, w: 0, h: 0 } }, px, py, 10)) continue;
    const kind = rng() < 0.15 ? 'taxi' : 'parked';
    cars.push(createCar(px, py, angle, kind, rng));
  }
  return cars;
}

/** A yellow cab placed deliberately (a guaranteed taxi near the spawn). */
export function createTaxi(x, y, angle, rng) {
  const car = createCar(x, y, angle, 'taxi', rng);
  return car;
}

/** A police car spawns on a road some distance from the player, siren on. */
export function spawnPoliceCar(rng, playerX, playerY) {
  const p = randomRoadPoint(rng, playerX, playerY, 550);
  const car = createCar(p.x, p.y, 0, 'police', rng);
  car.angle = Math.atan2(playerY - p.y, playerX - p.x);
  car.speed = 420; // arriving rolling, not from a standstill
  return car;
}
