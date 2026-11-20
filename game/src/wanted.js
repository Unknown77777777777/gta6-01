// The wanted level: five stars, earned by crime, lost by patience or by hiding.
// The higher it climbs, the more police cars the city throws at Lena — and the
// longer it takes to cool down. Sol Garage is the one place the heat cannot follow.

import { dist } from './city.js';

export const MAX_WANTED = 5;
export const DECAY_QUIET_SECONDS = 28;
export const DECAY_STEP_SECONDS = 9;
export const HIDEOUT_CLEAR_SECONDS = 3;

/**
 * Heat tuning (v3): hotter chases are harder to shake. The quiet time before
 * the first star drops grows with the level (28 s at one star, +6 s a star),
 * each star then takes longer to cool (+2 s a star past the second), and
 * cruisers arrive faster the hotter it gets. At five stars the city fields
 * five cars instead of four.
 */
export function quietSecondsFor(level) {
  return DECAY_QUIET_SECONDS + Math.max(0, level - 1) * 6;
}

export function decayStepFor(level) {
  return DECAY_STEP_SECONDS + Math.max(0, level - 2) * 2;
}

/** Seconds between police spawns: 1.2 s at one star, down to 0.6 s at five. */
export function policeSpawnInterval(level) {
  return Math.max(0.6, 1.2 - Math.max(0, level - 1) * 0.15);
}

/** Progress 0..1 toward clearing the heat inside the hideout (HUD hint). */
export function hideoutProgress(wanted) {
  return Math.min(1, wanted.hideoutTimer / HIDEOUT_CLEAR_SECONDS);
}

export function createWanted() {
  return {
    level: 0,
    sinceCrime: 999, // seconds since the last crime
    decayTimer: 0, // counts down to the next star lost
    hideoutTimer: 0, // seconds spent inside the garage zone
    seenByPolice: false,
  };
}

/** Add stars for a crime, up to the five-star cap. Resets the quiet clock. */
export function addWanted(wanted, stars) {
  wanted.level = Math.min(MAX_WANTED, wanted.level + stars);
  wanted.sinceCrime = 0;
  wanted.decayTimer = decayStepFor(wanted.level);
}

/** Set the wanted level outright (mission 6 opens at four stars). */
export function setWanted(wanted, stars) {
  wanted.level = Math.max(0, Math.min(MAX_WANTED, stars));
  wanted.sinceCrime = 0;
  wanted.decayTimer = decayStepFor(wanted.level);
}

/** Clear the heat entirely (busted, wasted, or a clean hideout escape). */
export function clearWanted(wanted) {
  wanted.level = 0;
  wanted.sinceCrime = 999;
  wanted.decayTimer = 0;
  wanted.hideoutTimer = 0;
}

/** How many police cars the city fields at this heat. */
export function policeTargetCount(level) {
  if (level <= 0) return 0;
  if (level === 1) return 1;
  if (level === 2) return 2;
  if (level === 3) return 3;
  if (level === 4) return 4;
  return 5; // five stars: the whole city is on her tail
}

/** Plain-language name for a wanted level, for announcements and the HUD. */
export function heatLevelName(level) {
  if (level <= 0) return 'Clean';
  if (level === 1) return 'Heat';
  if (level === 2) return 'Hot';
  if (level === 3) return 'Blazing';
  if (level === 4) return 'Inferno';
  return 'Lockdown';
}

/**
 * Step the wanted level. `police` are the active police cars, `hideout` is the
 * garage zone, `pos` is Lena's position. Returns 'cooled' when a star drops,
 * 'hidden' when the garage clears the heat, else null.
 */
export function updateWanted(wanted, dt, pos, police, hideout) {
  wanted.sinceCrime += dt;
  // Is any cop close enough to see her right now?
  wanted.seenByPolice = false;
  for (const cop of police) {
    if (dist(cop.x, cop.y, pos.x, pos.y) < 520) {
      wanted.seenByPolice = true;
      break;
    }
  }
  if (wanted.level === 0) {
    wanted.hideoutTimer = 0;
    return null;
  }
  // Hiding in the garage burns the whole heat off: the garage is the one place
  // the heat cannot follow, so the timer runs even while a cruiser is still
  // circling outside — otherwise an 'escape' objective could never complete
  // while police stay within sight range. Takes 3 seconds inside the zone.
  const inHideout = dist(pos.x, pos.y, hideout.x, hideout.y) < hideout.r;
  if (inHideout) {
    wanted.hideoutTimer += dt;
    if (wanted.hideoutTimer >= HIDEOUT_CLEAR_SECONDS) {
      clearWanted(wanted);
      return 'hidden';
    }
    return null;
  }
  wanted.hideoutTimer = 0;
  // Quiet and unseen: the heat cools off one star at a time. Hotter chases
  // need longer quiet (quietSecondsFor) and cool slower (decayStepFor).
  if (wanted.sinceCrime > quietSecondsFor(wanted.level) && !wanted.seenByPolice) {
    wanted.decayTimer -= dt;
    if (wanted.decayTimer <= 0) {
      wanted.level -= 1;
      wanted.decayTimer = decayStepFor(wanted.level);
      if (wanted.level === 0) {
        wanted.sinceCrime = 999;
        return 'cooled';
      }
      return 'cooled';
    }
  }
  return null;
}
