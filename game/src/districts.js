// Districts: Costa Sol is eight neighbourhoods, not one flat map. Each has its
// own bounds, its own police presence, its own gang activity, and its own small
// bonus — and the city treats Lena differently in each one. The HUD names the
// district she is standing in; the wanted system reads the police presence
// when it decides how fast cruisers arrive; the side work reads the bonuses
// when it pays; and finishing a story mission in a district marks it
// controlled, which pays a small permanent bonus there.
//
// The bounds match the district names the HUD already showed (see city.js
// districtAt): Beachfront, Harbour Pier, East Docks, North Plaza, Sol Garage,
// South Market, North Marina, Downtown. The names are the same on purpose —
// one city, one map of names, two files that agree.

import { dist } from './city.js';

/**
 * The eight districts. Bounds are world rectangles (x0,y0,x1,y1) in the same
 * order the HUD's districtAt checks them, so districtAt and districtInfo
 * never disagree about where Lena is.
 *   policePresence 0..5: how many extra cruisers the district fields.
 *   gangActivity   0..5: how often gang peds and trouble spawn there.
 *   bonus: what the district pays extra for (taxi / package / jump).
 *   controlled: false until a story mission finishes there.
 */
export const DISTRICTS = [
  {
    id: 'beachfront', name: 'Beachfront', bounds: [0, 3100, 4800, 3600],
    policePresence: 1, gangActivity: 1,
    bonus: { kind: 'package', value: 5, text: 'Beachcomber: packages +$5' },
    blurb: 'Sand, surf, and umbrellas. Quiet, except on the weekends.',
  },
  {
    id: 'harbour', name: 'Harbour Pier', bounds: [4600, 0, 4800, 3100],
    policePresence: 3, gangActivity: 2,
    bonus: { kind: 'jump', value: 25, text: 'Pier runner: jumps +$25' },
    blurb: "Boats, gulls, and Marco Venn's men watching the water.",
  },
  {
    id: 'docks', name: 'East Docks', bounds: [4200, 2200, 4600, 3100],
    policePresence: 2, gangActivity: 4,
    bonus: { kind: 'taxi', value: 0.2, text: 'Dock rates: taxi fares +20%' },
    blurb: 'Cranes and containers. The gangs run the night shift here.',
  },
  {
    id: 'plaza', name: 'North Plaza', bounds: [0, 0, 1400, 1200],
    policePresence: 2, gangActivity: 1,
    bonus: { kind: 'package', value: 5, text: 'Plaza regular: packages +$5' },
    blurb: 'Fountains and cafés. Lena picked up her first fare here.',
  },
  {
    id: 'garage', name: 'Sol Garage', bounds: [3600, 2600, 4200, 3100],
    policePresence: 0, gangActivity: 0,
    bonus: { kind: 'taxi', value: 0.1, text: 'Home turf: taxi fares +10%' },
    blurb: 'Sol Garage. The one place the heat cannot follow.',
  },
  {
    id: 'market', name: 'South Market', bounds: [0, 2200, 1400, 3100],
    policePresence: 2, gangActivity: 3,
    bonus: { kind: 'jump', value: 25, text: 'Market dash: jumps +$25' },
    blurb: 'Stalls, spice, and quick money if you know the alleys.',
  },
  {
    id: 'marina', name: 'North Marina', bounds: [4200, 0, 4600, 1200],
    policePresence: 3, gangActivity: 1,
    bonus: { kind: 'package', value: 5, text: 'Marina cache: packages +$5' },
    blurb: 'Yachts and lawyers. The evidence goes to the lawyer here.',
  },
  {
    id: 'downtown', name: 'Downtown', bounds: [1400, 0, 4200, 3100],
    policePresence: 2, gangActivity: 2,
    bonus: { kind: 'taxi', value: 0.15, text: 'Downtown rush: taxi fares +15%' },
    blurb: 'The avenues, the towers, the traffic. The city proper.',
  },
];

/** Fresh district state: control flags, and the raid that may be live. */
export function createDistrictState() {
  return {
    controlled: {}, // district id -> true once a mission finished there
    raid: null, // { districtId, name, timer } while a police raid runs
    raidCooldown: 120, // seconds until the next raid may start
    events: [], // recent district events, newest first (HUD log)
  };
}

/** The district object a world point belongs to (Downtown is the catch-all). */
export function districtInfo(x, y) {
  for (const d of DISTRICTS) {
    const b = d.bounds;
    if (x >= b[0] && x < b[2] && y >= b[1] && y < b[3]) return d;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

/** The district's name at a point — the HUD's location line reads this. */
export function districtNameAt(x, y) {
  return districtInfo(x, y).name;
}

/** The district object by id, or null. */
export function districtById(id) {
  for (const d of DISTRICTS) {
    if (d.id === id) return d;
  }
  return null;
}

/** Police presence 0..5 in the district at a point: how hot it is there. */
export function districtPoliceLevel(x, y) {
  return districtInfo(x, y).policePresence;
}

/** Gang activity 0..5 in the district at a point: how rough it is there. */
export function districtGangLevel(x, y) {
  return districtInfo(x, y).gangActivity;
}

/** The district's bonus text, for the HUD's district line. */
export function districtBonusText(x, y) {
  return districtInfo(x, y).bonus.text;
}

/**
 * The taxi bonus at a point, as a multiplier (1.0 when the district pays no
 * taxi bonus). A fare dropped in the East Docks pays 20% more; the side-work
 * code multiplies the fare by this, so the bonus is honest arithmetic, not a
 * line of text.
 */
export function districtTaxiMultiplier(x, y) {
  const d = districtInfo(x, y);
  return d.bonus.kind === 'taxi' ? 1 + d.bonus.value : 1;
}

/** Extra dollars a hidden package pays in the district at a point. */
export function districtPackageBonus(x, y) {
  const d = districtInfo(x, y);
  return d.bonus.kind === 'package' ? d.bonus.value : 0;
}

/** Extra dollars a stunt jump pays in the district at a point. */
export function districtJumpBonus(x, y) {
  const d = districtInfo(x, y);
  return d.bonus.kind === 'jump' ? d.bonus.value : 0;
}

/** True when Lena controls the district at a point (a mission finished there). */
export function districtControlled(state, x, y) {
  return !!state.controlled[districtInfo(x, y).id];
}

/**
 * Mark the district at a point controlled: a story mission finished there.
 * Controlled districts pay a small permanent bonus on top of their normal
 * one — the city remembers who runs it. Returns the district's name, or null
 * when it was already controlled.
 */
export function controlDistrict(state, x, y) {
  const d = districtInfo(x, y);
  if (state.controlled[d.id]) return null;
  state.controlled[d.id] = true;
  logDistrictEvent(state, `${d.name} is under Lena's control now.`);
  return d.name;
}

/** How many of the eight districts Lena controls (0..8). */
export function controlledCount(state) {
  let n = 0;
  for (const d of DISTRICTS) if (state.controlled[d.id]) n += 1;
  return n;
}

/** Extra dollars any payout earns in a controlled district: +$5 a job. */
export function controlledBonus(state, x, y) {
  return districtControlled(state, x, y) ? 5 : 0;
}

/** The raid currently running, or null. A raid is a 60-second police surge in
 * one district: cruisers arrive faster and the wanted level cools slower
 * while it lasts. */
export function activeRaid(state) {
  return state.raid;
}

/** True when a raid is live in the district at a point. */
export function raidHere(state, x, y) {
  return !!state.raid && state.raid.districtId === districtInfo(x, y).id;
}

/** Extra police cars the city fields at a point: +1 while a raid runs there. */
export function districtPoliceBonus(state, x, y) {
  return raidHere(state, x, y) ? 1 : 0;
}

/**
 * Step the district events. Every couple of minutes a raid may start in a
 * random district with police presence 3 or more: 60 seconds of extra
 * cruisers, announced so the player can steer clear — or drive straight into
 * it, if that is the kind of driver she is. Raids never start in Sol Garage:
 * the hideout stays a safe place.
 */
export function updateDistricts(state, game, dt) {
  if (state.raid) {
    state.raid.timer -= dt;
    if (state.raid.timer <= 0) {
      logDistrictEvent(state, `Raid over in ${state.raid.name}. The cruisers pull back.`);
      state.raid = null;
      state.raidCooldown = 100 + Math.random() * 80;
    }
    return;
  }
  state.raidCooldown -= dt;
  if (state.raidCooldown > 0) return;
  state.raidCooldown = 30;
  if (Math.random() > 0.35) return;
  const hot = DISTRICTS.filter((d) => d.policePresence >= 3 && d.id !== 'garage');
  if (hot.length === 0) return;
  const pick = hot[Math.floor(Math.random() * hot.length)];
  state.raid = { districtId: pick.id, name: pick.name, timer: 60 };
  logDistrictEvent(state, `POLICE RAID in ${pick.name} — 60 seconds of extra cruisers!`);
}

/** Keep the last few district events for the HUD log (newest first). */
export function logDistrictEvent(state, text) {
  state.events.unshift({ text, at: Date.now() });
  if (state.events.length > 4) state.events.pop();
}

/** The latest district event, or null. */
export function latestDistrictEvent(state) {
  return state.events.length > 0 ? state.events[0].text : null;
}

/**
 * One line for the HUD's district display: the name, the bonus, and a raid
 * warning when one is live there. The HUD already shows the name; this line
 * adds the reason to care about it.
 */
export function districtHudText(state, x, y) {
  const d = districtInfo(x, y);
  const star = state.controlled[d.id] ? ' ★' : '';
  const raid = raidHere(state, x, y) ? ' · RAID!' : '';
  return `◈ ${d.name.toUpperCase()}${star} — ${d.bonus.text}${raid}`;
}

/** The district progress a save keeps: which districts are controlled. */
export function districtsSaveData(state) {
  return { controlled: { ...state.controlled } };
}

/** Restore controlled districts from a save (v3 saves carry none). */
export function applyDistrictsSave(state, data) {
  if (!data || !data.controlled) return;
  for (const d of DISTRICTS) {
    if (data.controlled[d.id]) state.controlled[d.id] = true;
  }
}
