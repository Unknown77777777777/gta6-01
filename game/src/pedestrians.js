// The people of Costa Sol: pedestrians strolling the sidewalks, crossing at the
// corners, and running for cover when a gun goes off or a car mounts the kerb.
// They give the city life, and hitting one is the fastest way to earn a star.

import { clamp, createRng, dist, isOnRoad, nearestRoadPoint, resolveCircle, ROAD_H, ROAD_V } from './city.js';

export const PED_RADIUS = 11;
export const PED_WALK_SPEED = 55;
export const PED_RUN_SPEED = 190;

const SHIRTS = ['#e86a6a', '#6a9ae8', '#6ac88a', '#e8c86a', '#c86ae8', '#e8e8e8', '#6ad8d8', '#e89a6a'];
const SKINS = ['#f2c9a0', '#e8b088', '#c98d5f', '#a06a42', '#f7d9b8'];

/** Make one pedestrian near a road, walking along the sidewalk. */
export function createPed(rng, x, y) {
  return {
    x, y,
    angle: rng() * Math.PI * 2,
    speed: PED_WALK_SPEED * (0.8 + rng() * 0.4),
    shirt: SHIRTS[Math.floor(rng() * SHIRTS.length)],
    skin: SKINS[Math.floor(rng() * SKINS.length)],
    walkPhase: rng() * Math.PI * 2,
    // Sidewalk strolling: a target point to walk toward, re-picked on arrival.
    tx: x, ty: y,
    flee: 0, // seconds of panic left
    down: 0, // seconds lying down after being hit
    dead: false,
  };
}

/** A crowd spread over the sidewalks near the city centre and the beachfront. */
export function spawnPedestrians(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    let x;
    let y;
    if (rng() < 0.25) {
      // Beachfront strollers.
      x = 300 + rng() * 4200;
      y = 3050 + rng() * 250;
    } else {
      const road = ROAD_V[Math.floor(rng() * ROAD_V.length)];
      const along = 200 + rng() * 2900;
      x = road + (rng() < 0.5 ? -75 : 75);
      y = along;
      if (rng() < 0.5) {
        const hRoad = ROAD_H[Math.floor(rng() * ROAD_H.length)];
        x = 200 + rng() * 4400;
        y = hRoad + (rng() < 0.5 ? -75 : 75);
      }
    }
    const ped = createPed(rng, x, y);
    pickStrollTarget(ped, rng);
    peds.push(ped);
  }
  return peds;
}

/** Pick a new stroll target: a nearby point on a sidewalk along the same road. */
export function pickStrollTarget(ped, rng) {
  const near = nearestRoadPoint(ped.x, ped.y);
  const along = (rng() - 0.5) * 700;
  if (!near) {
    ped.tx = ped.x + along;
    ped.ty = ped.y;
    return;
  }
  if (near.axis === 'v') {
    ped.tx = near.x + (ped.x < near.x ? -75 : 75);
    ped.ty = clamp(ped.y + along, 150, 3050);
  } else {
    ped.tx = clamp(ped.x + along, 150, 4650);
    ped.ty = near.y + (ped.y < near.y ? -75 : 75);
  }
}

/**
 * One pedestrian step: stroll to the target, or run away from `danger` (a point
 * and radius) while panicking. Lying-down pedestrians stay down, then get up.
 */
export function updatePed(ped, dt, city, rng, danger) {
  if (ped.down > 0) {
    ped.down -= dt;
    return;
  }
  ped.walkPhase += dt * (ped.flee > 0 ? 14 : 7);
  if (danger && dist(ped.x, ped.y, danger.x, danger.y) < danger.r) {
    ped.flee = 2.5;
  }
  if (ped.flee > 0) {
    ped.flee -= dt;
    const away = Math.atan2(ped.y - (danger ? danger.y : ped.y), ped.x - (danger ? danger.x : ped.x));
    ped.angle = away;
    ped.x += Math.cos(away) * PED_RUN_SPEED * dt;
    ped.y += Math.sin(away) * PED_RUN_SPEED * dt;
    resolveCircle(city, ped, PED_RADIUS);
    return;
  }
  const dx = ped.tx - ped.x;
  const dy = ped.ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) {
    pickStrollTarget(ped, rng);
    return;
  }
  ped.angle = Math.atan2(dy, dx);
  ped.x += (dx / d) * ped.speed * dt;
  ped.y += (dy / d) * ped.speed * dt;
  resolveCircle(city, ped, PED_RADIUS);
  // Keep pedestrians off the beach water and the harbour.
  if (ped.y > 3380) ped.y = 3380;
  if (ped.x > 4640) ped.x = 4640;
}

/** Knock a pedestrian down (a car hit). Returns true when it was a fresh hit. */
export function knockPedDown(ped) {
  if (ped.down > 0) return false;
  ped.down = 4;
  ped.flee = 0;
  return true;
}

/** Scare every pedestrian near a point (a gunshot, a crash). */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (dist(ped.x, ped.y, x, y) < radius) ped.flee = 2.5;
  }
}
