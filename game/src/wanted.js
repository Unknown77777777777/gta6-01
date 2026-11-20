// The wanted level: five stars, earned by crime, lost by patience or by hiding.
// The higher it climbs, the more police cars the city throws at Lena — and the
// longer it takes to cool down. Sol Garage is the one place the heat cannot follow.

import { dist } from './city.js';

export const MAX_WANTED = 5;
export const DECAY_QUIET_SECONDS = 28;
export const DECAY_STEP_SECONDS = 9;
export const HIDEOUT_CLEAR_SECONDS = 2.5;

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
  wanted.decayTimer = DECAY_STEP_SECONDS;
}

/** Set the wanted level outright (mission 6 opens at four stars). */
export function setWanted(wanted, stars) {
  wanted.level = Math.max(0, Math.min(MAX_WANTED, stars));
  wanted.sinceCrime = 0;
  wanted.decayTimer = DECAY_STEP_SECONDS;
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
  return 4;
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
  // Hiding in the garage while unseen burns the whole heat off.
  const inHideout = dist(pos.x, pos.y, hideout.x, hideout.y) < hideout.r;
  if (inHideout && !wanted.seenByPolice) {
    wanted.hideoutTimer += dt;
    if (wanted.hideoutTimer >= HIDEOUT_CLEAR_SECONDS) {
      clearWanted(wanted);
      return 'hidden';
    }
    return null;
  }
  wanted.hideoutTimer = 0;
  // Quiet and unseen: the heat cools off one star at a time.
  if (wanted.sinceCrime > DECAY_QUIET_SECONDS && !wanted.seenByPolice) {
    wanted.decayTimer -= dt;
    if (wanted.decayTimer <= 0) {
      wanted.level -= 1;
      wanted.decayTimer = DECAY_STEP_SECONDS;
      if (wanted.level === 0) {
        wanted.sinceCrime = 999;
        return 'cooled';
      }
      return 'cooled';
    }
  }
  return null;
}
