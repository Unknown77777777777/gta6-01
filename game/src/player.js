// Lena Cruz on foot: walking, running, punching and shooting. The player object
// is shared by the car code: when she is driving, `car` points at her car and her
// position follows it; on foot she moves on her own two feet.

import { clamp, isCircleBlockedAt, isWaterAt, nearestFreePoint, resolveCircle } from './city.js';

export const PLAYER_RADIUS = 14;
export const WALK_SPEED = 170;
export const RUN_SPEED = 300;
export const PUNCH_RANGE = 34;
export const PUNCH_DAMAGE = 25;
export const GUN_DAMAGE = 34;
export const GUN_RANGE = 520;
export const GUN_FIRE_DELAY = 0.22;
export const MAX_HEALTH = 100;

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, // facing up the street
    vx: 0, vy: 0,
    health: MAX_HEALTH,
    onFoot: true,
    car: null,
    ammo: 12,
    punchTimer: 0,
    fireTimer: 0,
    muzzle: 0, // frames of muzzle flash left to draw
    hurtTimer: 0, // brief invulnerability after a hard hit
    bustedTimer: 0, // seconds a cop car has sat on top of her while wanted
    kx: 0, ky: 0, // knockback velocity: a shove from a bumper decays fast
    moving: false,
    running: false,
    // v4: the arsenal and the minigame ledger. `weapons` is the state object
    // weapons.js builds (current gun, owned guns, ammo per gun); the three
    // counters are the minigame stats the save file keeps.
    weapons: null,
    racesWon: 0,
    vigilanteKills: 0,
    patientsSaved: 0,
  };
}

/**
 * Shove Lena on foot: a cop's bumper or a clipped car sends her stumbling
 * in (dx, dy) with `force` speed. The shove decays over a fraction of a
 * second, so it reads as a hit, not a slide.
 */
export function knockPlayer(player, dx, dy, force) {
  const len = Math.hypot(dx, dy) || 1;
  player.kx = (dx / len) * force;
  player.ky = (dy / len) * force;
}

/**
 * Move Lena on foot. `move` is {x, y} in -1..1, `run` is shift. Walls slide her
 * along instead of stopping her: try the full step, then each axis alone.
 */
export function updatePlayerOnFoot(player, move, run, dt, city) {
  const speed = run ? RUN_SPEED : WALK_SPEED;
  const len = Math.hypot(move.x, move.y);
  player.moving = len > 0.05;
  player.running = run && player.moving;
  // Knockback rides along with her own movement and decays fast.
  if (Math.abs(player.kx) > 1 || Math.abs(player.ky) > 1) {
    player.x += player.kx * dt;
    player.y += player.ky * dt;
    player.kx *= Math.max(0, 1 - dt * 6);
    player.ky *= Math.max(0, 1 - dt * 6);
    resolveCircle(city, player, PLAYER_RADIUS);
  }
  if (player.moving) {
    const nx = move.x / (len || 1);
    const ny = move.y / (len || 1);
    player.angle = Math.atan2(ny, nx);
    const stepX = nx * speed * dt;
    const stepY = ny * speed * dt;
    // Free the start first: a step that begins inside a wall can never get
    // out, because the axis retries below assume a free start — from inside
    // a building each retry re-collides and reverts to the same trapped
    // spot, so movement along the shortest exit side nets exactly zero
    // every frame (a permanent soft-lock: run 3 sat at (2340,1115) for
    // ~450 s). Push out first, so the step starts on open ground and the
    // slide below works as designed. This also frees a Lena shoved into
    // the sea, where the no-swimming rule would otherwise freeze her.
    if (isCircleBlockedAt(city, player.x, player.y, PLAYER_RADIUS)) {
      const free = nearestFreePoint(city, player.x, player.y, PLAYER_RADIUS);
      player.x = free.x;
      player.y = free.y;
    }
    const ox = player.x;
    const oy = player.y;
    player.x += stepX;
    player.y += stepY;
    if (isWaterAt(city, player.x, player.y)) {
      // Lena does not swim: the sea stops her at the sand.
      player.x = ox;
      player.y = oy;
    } else if (resolveCircle(city, player, PLAYER_RADIUS)) {
      // Blocked diagonally: try each axis alone so she slides along the wall.
      player.x = ox + stepX;
      player.y = oy;
      if (resolveCircle(city, player, PLAYER_RADIUS)) player.x = ox;
      player.y = oy + stepY;
      if (resolveCircle(city, player, PLAYER_RADIUS)) player.y = oy;
    }
  }
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (player.fireTimer > 0) player.fireTimer -= dt;
  if (player.muzzle > 0) player.muzzle -= dt;
  if (player.hurtTimer > 0) player.hurtTimer -= dt;
}

/** Start a punch: a short swing that hits whatever is in front of her. */
export function playerPunch(player) {
  if (player.punchTimer > 0 || !player.onFoot) return false;
  player.punchTimer = 0.32;
  return true;
}

/** Reload the pistol: a fresh magazine of 12 after the reload delay. */
export function reloadWeapon(player) {
  player.ammo = 12;
}

/** Aim at the mouse (world coordinates) and fire the pistol when it is ready. */
export function playerShoot(player, targetX, targetY) {
  if (!player.onFoot || player.fireTimer > 0 || player.ammo <= 0) return null;
  player.fireTimer = GUN_FIRE_DELAY;
  player.ammo -= 1;
  player.muzzle = 0.07;
  player.angle = Math.atan2(targetY - player.y, targetX - player.x);
  const bx = player.x + Math.cos(player.angle) * 20;
  const by = player.y + Math.sin(player.angle) * 20;
  return {
    x: bx, y: by,
    vx: Math.cos(player.angle) * 900, vy: Math.sin(player.angle) * 900,
    life: GUN_RANGE / 900, damage: GUN_DAMAGE, fromPlayer: true,
  };
}

/** Hurt Lena; returns true when the hit killed her. */
export function hurtPlayer(player, amount) {
  if (player.hurtTimer > 0) return false;
  player.health -= amount;
  player.hurtTimer = 0.6;
  if (player.health <= 0) {
    player.health = 0;
    return true;
  }
  return false;
}

/** Heal Lena back up (hospital respawn, mission rewards). */
export function healPlayer(player, amount) {
  player.health = clamp(player.health + amount, 0, MAX_HEALTH);
}

/** Reset every per-life timer after a wasted/busted respawn, so no stale
 * punch, fire, hurt or busted timer leaks into the retried mission. */
export function resetPlayerTimers(player) {
  player.punchTimer = 0;
  player.fireTimer = 0;
  player.muzzle = 0;
  player.hurtTimer = 0;
  player.bustedTimer = 0;
  player.kx = 0;
  player.ky = 0;
  player.moving = false;
  player.running = false;
}

/** True while Lena is aiming her pistol (muzzle flash still showing). */
export function playerIsAiming(player) {
  return player.muzzle > 0;
}

/**
 * Equip a gun Lena owns, by id ('pistol' | 'shotgun' | 'smg' | 'rifle').
 * Returns true when the gun is now in her hands. The pistol is always owned;
 * the others need a pickup first (see weapons.js).
 */
export function equipWeapon(player, weaponId) {
  const ws = player.weapons;
  if (!ws) return weaponId === 'pistol';
  if (!ws.owned[weaponId]) return false;
  ws.current = weaponId;
  player.ammo = ws.ammo[weaponId];
  player.fireTimer = 0.15;
  return true;
}

/** The id of the gun Lena is holding ('pistol' when no weapon state yet). */
export function playerWeaponId(player) {
  return (player.weapons && player.weapons.current) || 'pistol';
}

/** Rounds in the gun Lena is holding right now. */
export function playerWeaponAmmo(player) {
  const ws = player.weapons;
  if (!ws) return player.ammo;
  return ws.ammo[ws.current] ?? 0;
}

/** Add rounds to a gun Lena owns. Returns the rounds actually added. */
export function addPlayerAmmo(player, weaponId, rounds) {
  const ws = player.weapons;
  if (!ws || !ws.owned[weaponId]) return 0;
  const max = { pistol: 12, shotgun: 6, smg: 30, rifle: 8 }[weaponId] || 12;
  const before = ws.ammo[weaponId];
  ws.ammo[weaponId] = Math.min(max, before + rounds);
  if (ws.current === weaponId) player.ammo = ws.ammo[weaponId];
  return ws.ammo[weaponId] - before;
}

/**
 * The minigame ledger: races won, criminals stopped, patients saved. The save
 * file and the story-complete screen read this one object.
 */
export function playerStats(player) {
  return {
    racesWon: player.racesWon || 0,
    vigilanteKills: player.vigilanteKills || 0,
    patientsSaved: player.patientsSaved || 0,
  };
}

/** One line about Lena's combat readiness, for the HUD's weapon slot. */
export function playerCombatSummary(player) {
  const ws = player.weapons;
  if (!ws) return { weapon: 'pistol', ammo: player.ammo, owned: 1 };
  let owned = 0;
  for (const id of ['pistol', 'shotgun', 'smg', 'rifle']) if (ws.owned[id]) owned += 1;
  return { weapon: ws.current, ammo: ws.ammo[ws.current], owned };
}

/**
 * After a wasted/busted respawn: back to the pistol with a fresh magazine,
 * but the guns she picked up stay hers — a hospital trip is not a
 * confiscation. The minigame counters are untouched: a lost race is still a
 * race she ran.
 */
export function resetPlayerCombat(player) {
  const ws = player.weapons;
  if (ws) {
    ws.current = 'pistol';
    ws.ammo.pistol = 12;
  }
  player.ammo = 12;
  player.fireTimer = 0;
  player.muzzle = 0;
}
