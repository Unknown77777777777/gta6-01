// The arsenal: Lena's guns on foot. The pistol was always hers (player.js);
// this file adds the three guns she can pick up around the city and the bat
// she has always swung, and ties them into one system: stats, ammo, switching,
// pickups, and the bullets each one throws. No hitscan magic — every shot is
// a real bullet the world steps, so a shotgun's pellets can miss, a rifle's
// round can cross the street, and an SMG burst can chew a whole magazine.
//
//   Pistol   the sidearm: steady, 12 rounds, reloaded with R.
//   Shotgun  five pellets, huge damage up close, useless past 260 px.
//   SMG      fast and loose: 30 rounds, a bullet every 0.09 s.
//   Rifle    one precise round, long range, slow and loud.
//   Bat      the F punch, with its own damage and swing arc.
//
// Ammo lives on the player's weapon state, so saves, respawns and the HUD all
// read one place. Running dry on a picked-up gun drops Lena back to her pistol
// on its own — an empty gun is dead weight in a gunfight.

import { dist } from './city.js';

/** The four guns, in HUD slot order (keys 1-4). The bat is not a slot: it
 * is the F punch, and it never runs out of swings. */
export const WEAPON_SLOTS = ['pistol', 'shotgun', 'smg', 'rifle'];

export const WEAPON_STATS = {
  pistol: {
    name: 'PISTOL', slot: 1, key: 'Digit1',
    damage: 34, range: 520, fireRate: 0.22, spread: 0.03, pellets: 1,
    ammoMax: 12, reloadTime: 0.8, bulletSpeed: 900,
    tracer: '#ffe27a', muzzle: '#ffe27a', sound: 'shoot',
    blurb: 'Steady sidearm — 12 rounds, reloaded with R',
  },
  shotgun: {
    name: 'SHOTGUN', slot: 2, key: 'Digit2',
    damage: 22, range: 260, fireRate: 0.85, spread: 0.22, pellets: 5,
    ammoMax: 6, reloadTime: 1.4, bulletSpeed: 780,
    tracer: '#ffb03c', muzzle: '#ff9a2c', sound: 'shotgun',
    blurb: 'Five pellets, huge up close, useless at range',
  },
  smg: {
    name: 'SMG', slot: 3, key: 'Digit3',
    damage: 14, range: 380, fireRate: 0.09, spread: 0.11, pellets: 1,
    ammoMax: 30, reloadTime: 1.1, bulletSpeed: 950,
    tracer: '#9adcff', muzzle: '#c8ecff', sound: 'smg',
    blurb: 'Fast and loose — 30 rounds, a bullet every heartbeat',
  },
  rifle: {
    name: 'RIFLE', slot: 4, key: 'Digit4',
    damage: 60, range: 900, fireRate: 0.7, spread: 0.01, pellets: 1,
    ammoMax: 8, reloadTime: 1.6, bulletSpeed: 1400,
    tracer: '#ff6a5a', muzzle: '#ff8a70', sound: 'rifle',
    blurb: 'One precise round, clear across the street',
  },
};

/** The bat: the F punch's numbers, kept here so combat has one table. */
export const BAT_STATS = {
  name: 'BAT', damage: 40, range: 44, swingTime: 0.32,
  blurb: 'A wooden bat. It never needs reloading.',
};

/** Where the guns wait in the world: one per corner of the city, on open
 * ground Lena can reach on foot. Plaza, docks, beach, north marina — each
 * pickup is one gun with a full magazine. */
export const WEAPON_PICKUP_SPOTS = [
  { x: 1200, y: 900, weapon: 'shotgun' },
  { x: 4200, y: 2540, weapon: 'smg' },
  { x: 1400, y: 3240, weapon: 'rifle' },
  { x: 4550, y: 640, weapon: 'shotgun' },
];

/** Fresh weapon state, attached to the player at creation. */
export function createWeaponState() {
  return {
    current: 'pistol',
    owned: { pistol: true, shotgun: false, smg: false, rifle: false },
    ammo: { pistol: 12, shotgun: 0, smg: 0, rifle: 0 },
    pickups: WEAPON_PICKUP_SPOTS.map((s) => ({ x: s.x, y: s.y, weapon: s.weapon, taken: false })),
  };
}

/** The stats of the gun Lena is holding right now. */
export function currentWeaponStats(player) {
  const id = (player.weapons && player.weapons.current) || 'pistol';
  return WEAPON_STATS[id] || WEAPON_STATS.pistol;
}

/** The id of the gun Lena is holding right now ('pistol' by default). */
export function currentWeaponId(player) {
  return (player.weapons && player.weapons.current) || 'pistol';
}

/** Rounds left in the gun Lena is holding. */
export function currentWeaponAmmo(player) {
  const ws = player.weapons;
  if (!ws) return player.ammo;
  return ws.ammo[ws.current] ?? 0;
}

/** Rounds left in a named gun (0 when she does not own it). */
export function weaponAmmo(player, weaponId) {
  const ws = player.weapons;
  if (!ws) return weaponId === 'pistol' ? player.ammo : 0;
  return ws.ammo[weaponId] ?? 0;
}

/** True when Lena owns the named gun. */
export function ownsWeapon(player, weaponId) {
  const ws = player.weapons;
  if (!ws) return weaponId === 'pistol';
  return !!ws.owned[weaponId];
}

/**
 * Switch to the gun in HUD slot 1-4. Returns the gun's name when the switch
 * happened, or null when she does not own that gun yet (the HUD then says
 * so instead of silently doing nothing).
 */
export function switchWeapon(player, slot) {
  const ws = player.weapons;
  if (!ws) return null;
  const id = WEAPON_SLOTS[slot - 1];
  if (!id || !ws.owned[id]) return null;
  if (ws.current === id) return null;
  ws.current = id;
  player.ammo = ws.ammo[id];
  player.fireTimer = 0.15;
  player.muzzle = 0;
  return WEAPON_STATS[id].name;
}

/** Switch by key code ('Digit1'..'Digit4'): the keydown handler's shape. */
export function switchWeaponByKey(player, code) {
  for (const id of WEAPON_SLOTS) {
    if (WEAPON_STATS[id].key === code) return switchWeapon(player, WEAPON_STATS[id].slot);
  }
  return null;
}

/**
 * Pick up a gun: Lena owns it from now on, its magazine is full, and it
 * becomes the gun in her hands. Returns the gun's name, or null when the
 * pickup was already taken.
 */
export function pickupWeapon(player, weaponId) {
  const ws = player.weapons;
  if (!ws) return null;
  const st = WEAPON_STATS[weaponId];
  if (!st) return null;
  ws.owned[weaponId] = true;
  ws.ammo[weaponId] = st.ammoMax;
  ws.current = weaponId;
  player.ammo = st.ammoMax;
  player.fireTimer = 0.2;
  return st.name;
}

/** Add rounds to a gun she owns (a pickup she already has gives ammo). */
export function addAmmo(player, weaponId, rounds) {
  const ws = player.weapons;
  if (!ws) return 0;
  const st = WEAPON_STATS[weaponId];
  if (!st || !ws.owned[weaponId]) return 0;
  const before = ws.ammo[weaponId];
  ws.ammo[weaponId] = Math.min(st.ammoMax, before + rounds);
  if (ws.current === weaponId) player.ammo = ws.ammo[weaponId];
  return ws.ammo[weaponId] - before;
}

/**
 * Fire the gun Lena is holding at (targetX, targetY). Returns an array of
 * bullets (one per pellet — a shotgun throws five), or null when the gun is
 * not ready, is empty, or Lena is not on foot. The caller plays the sound
 * named in the stats and shakes the camera; this file only makes the
 * bullets. An empty magazine drops her back to the pistol: the click of an
 * empty gun is a death sentence in a gunfight.
 */
export function fireWeapon(player, targetX, targetY) {
  if (!player.onFoot || player.fireTimer > 0) return null;
  const ws = player.weapons;
  const st = currentWeaponStats(player);
  const id = currentWeaponId(player);
  if (ws && ws.ammo[id] <= 0) {
    // Dry: back to the pistol, which always has a magazine.
    ws.current = 'pistol';
    ws.ammo.pistol = Math.max(ws.ammo.pistol, 0);
    player.ammo = ws.ammo.pistol;
    player.fireTimer = 0.3;
    return null;
  }
  player.fireTimer = st.fireRate;
  if (ws) {
    ws.ammo[id] -= 1;
    player.ammo = ws.ammo[id];
  } else {
    player.ammo -= 1;
  }
  player.muzzle = 0.07;
  player.angle = Math.atan2(targetY - player.y, targetX - player.x);
  const bullets = [];
  for (let i = 0; i < st.pellets; i += 1) {
    const spread = (Math.random() - 0.5) * 2 * st.spread;
    const a = player.angle + spread;
    const bx = player.x + Math.cos(a) * 20;
    const by = player.y + Math.sin(a) * 20;
    bullets.push({
      x: bx, y: by,
      vx: Math.cos(a) * st.bulletSpeed, vy: Math.sin(a) * st.bulletSpeed,
      life: st.range / st.bulletSpeed, damage: st.damage, fromPlayer: true,
      color: st.tracer, weapon: id,
    });
  }
  return bullets;
}

/** Refill the gun Lena is holding (the R reload, after its delay). */
export function reloadCurrentWeapon(player) {
  const ws = player.weapons;
  if (!ws) {
    player.ammo = 12;
    return;
  }
  const id = ws.current;
  const st = WEAPON_STATS[id];
  ws.ammo[id] = st.ammoMax;
  player.ammo = st.ammoMax;
}

/**
 * A pickup Lena is standing on: take it (or top its ammo up when she already
 * owns the gun) and mark it taken. Returns the gun's name, or null when no
 * pickup is in reach. The pickup stays taken for the run; a fresh game
 * re-arms all four spots.
 */
export function collectWeaponPickup(player) {
  const ws = player.weapons;
  if (!ws) return null;
  for (const p of ws.pickups) {
    if (p.taken) continue;
    if (dist(player.x, player.y, p.x, p.y) < 40) {
      p.taken = true;
      if (ws.owned[p.weapon]) {
        addAmmo(player, p.weapon, WEAPON_STATS[p.weapon].ammoMax);
        return `${WEAPON_STATS[p.weapon].name} AMMO`;
      }
      return pickupWeapon(player, p.weapon);
    }
  }
  return null;
}

/** Markers for the renderer and the minimap: the guns still on the ground. */
export function weaponMarkers(player) {
  const ws = player.weapons;
  if (!ws) return [];
  const out = [];
  for (const p of ws.pickups) {
    if (!p.taken) out.push({ x: p.x, y: p.y, kind: 'weapon', weapon: p.weapon, label: `${WEAPON_STATS[p.weapon].name} — walk over it` });
  }
  return out;
}

/** One line for the HUD's weapon slot: the gun, its ammo, and the next slot. */
export function weaponHudText(player) {
  const ws = player.weapons;
  if (!ws) return `🔫 ${player.ammo}`;
  const st = currentWeaponStats(player);
  const owned = WEAPON_SLOTS.filter((id) => ws.owned[id]);
  const slots = owned.map((id) => {
    const s = WEAPON_STATS[id];
    const mark = id === ws.current ? '●' : '○';
    return `${mark}${s.slot}:${s.name} ${ws.ammo[id]}`;
  }).join('  ');
  return `${st.name} ${ws.ammo[ws.current]}/${st.ammoMax}  ·  ${slots}`;
}

/** The weapon progress a save keeps: which guns she owns, their ammo, and
 * which pickups are already taken. The pistol is always owned. */
export function weaponsSaveData(player) {
  const ws = player.weapons;
  if (!ws) return null;
  return {
    current: ws.current,
    owned: { ...ws.owned },
    ammo: { ...ws.ammo },
    pickupsTaken: ws.pickups.map((p) => (p.taken ? 1 : 0)),
  };
}

/** Restore weapons from a save (v3 saves carry none: pistol only). */
export function applyWeaponsSave(player, data) {
  const ws = player.weapons;
  if (!ws || !data) return;
  if (typeof data.current === 'string' && WEAPON_STATS[data.current]) ws.current = data.current;
  if (data.owned) {
    for (const id of WEAPON_SLOTS) {
      if (typeof data.owned[id] === 'boolean') ws.owned[id] = data.owned[id];
    }
  }
  ws.owned.pistol = true;
  if (data.ammo) {
    for (const id of WEAPON_SLOTS) {
      if (typeof data.ammo[id] === 'number') ws.ammo[id] = Math.max(0, Math.min(WEAPON_STATS[id].ammoMax, data.ammo[id]));
    }
  }
  if (Array.isArray(data.pickupsTaken)) {
    for (let i = 0; i < data.pickupsTaken.length && i < ws.pickups.length; i += 1) {
      ws.pickups[i].taken = data.pickupsTaken[i] === 1;
    }
  }
  player.ammo = ws.ammo[ws.current];
}
