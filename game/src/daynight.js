// The day-night cycle: Costa Sol runs on its own clock, and the city changes
// with it. One game minute passes every ten real seconds, starting at 08:00,
// and the light follows four phases — dawn, day, sunset, night — with smooth
// blends between them instead of hard cuts. At night the streetlamps and
// headlights matter, the neon burns brighter, and the streets empty out; at
// noon the avenues are full of traffic and people.
//
// The renderer reads the tint (an overlay colour and strength) and the lamp
// glow (0..1) every frame; the crowd and traffic spawn code reads the density
// factors; the HUD reads the clock text and the phase icon. The clock is saved
// with the game, so a night owl stays a night owl.

/** Game minutes per real second: one game minute every ten seconds. */
export const CLOCK_RATE = 0.1;
/** Minutes in a game day. */
export const DAY_MINUTES = 1440;
/** The game starts at 08:00, a bright morning over the harbour. */
export const START_MINUTES = 8 * 60;

/** Phase boundaries in game minutes: dawn 05:00-08:00, day 08:00-17:00,
 * sunset 17:00-20:00, night 20:00-05:00. */
export const PHASES = [
  { id: 'dawn', name: 'Dawn', icon: '🌅', start: 300, end: 480 },
  { id: 'day', name: 'Day', icon: '☀️', start: 480, end: 1020 },
  { id: 'sunset', name: 'Sunset', icon: '🌇', start: 1020, end: 1200 },
  { id: 'night', name: 'Night', icon: '🌙', start: 1200, end: 1440 },
  { id: 'night', name: 'Night', icon: '🌙', start: 0, end: 300 },
];

/** The sky tint each phase blends toward: [r, g, b, strength]. Dawn is warm
 * and soft, day is clear (almost no tint at all), sunset is the orange the
 * city is famous for, night is a deep blue dark. */
export const PHASE_TINTS = {
  dawn: [255, 190, 120, 0.10],
  day: [255, 244, 214, 0.02],
  sunset: [255, 150, 70, 0.16],
  night: [30, 50, 120, 0.30],
};

/** How busy the streets are in each phase, as a multiplier on the normal
 * pedestrian and traffic counts. Nights are quiet; midday is the rush. */
export const PHASE_DENSITY = {
  dawn: { ped: 0.6, traffic: 0.7 },
  day: { ped: 1.0, traffic: 1.0 },
  sunset: { ped: 0.9, traffic: 0.9 },
  night: { ped: 0.45, traffic: 0.5 },
};

/** Fresh clock: 08:00 on a new game, phase day, blend fully settled. */
export function createClock() {
  return {
    minutes: START_MINUTES,
    phase: 'day',
    blend: 1, // 0..1: how far into the current phase's tint we are
  };
}

/** Advance the clock by `dt` real seconds. Returns the phase id when it
 * changed this step, else null — the main loop plays a stinger on a change,
 * so the player hears the city turn. */
export function advanceClock(clock, dt) {
  clock.minutes = (clock.minutes + dt * CLOCK_RATE * 60) % DAY_MINUTES;
  const phase = phaseAt(clock.minutes);
  const changed = phase !== clock.phase;
  clock.phase = phase;
  // Blend: the tint eases in over the first 20 game minutes of a phase
  // (about three real minutes), so dawn never snaps in.
  const into = minutesIntoPhase(clock.minutes, phase);
  clock.blend = Math.min(1, into / 20);
  return changed ? phase : null;
}

/** Which phase a minute of the day belongs to. */
export function phaseAt(minutes) {
  if (minutes >= 300 && minutes < 480) return 'dawn';
  if (minutes >= 480 && minutes < 1020) return 'day';
  if (minutes >= 1020 && minutes < 1200) return 'sunset';
  return 'night';
}

/** Minutes since the current phase began (for the blend). */
function minutesIntoPhase(minutes, phase) {
  if (phase === 'dawn') return minutes - 300;
  if (phase === 'day') return minutes - 480;
  if (phase === 'sunset') return minutes - 1020;
  // Night wraps midnight: 20:00-24:00 counts from 1200, 00:00-05:00 from 0.
  return minutes >= 1200 ? minutes - 1200 : minutes + 240;
}

/** The phase the clock is in right now. */
export function currentPhase(clock) {
  return clock.phase;
}

/** Plain-language name of the current phase, for the HUD and the stinger. */
export function phaseName(clock) {
  const p = PHASES.find((ph) => ph.id === clock.phase);
  return p ? p.name : 'Day';
}

/** The emoji icon of the current phase, for the HUD clock line. */
export function phaseIcon(clock) {
  if (clock.phase === 'dawn') return '🌅';
  if (clock.phase === 'day') return '☀️';
  if (clock.phase === 'sunset') return '🌇';
  return '🌙';
}

/** True while the city is in its night phase (lamps on, neon bright). */
export function isNight(clock) {
  return clock.phase === 'night';
}

/** True while the sun is down enough for headlights to matter: night, and
 * the last stretch of sunset. */
export function headlightsOn(clock) {
  if (clock.phase === 'night') return true;
  if (clock.phase === 'sunset') return clock.minutes > 1140;
  return false;
}

/**
 * The sky tint to paint over the world this frame: { r, g, b, alpha }. The
 * blend eases between the previous phase's tint and this one, so a sunset
 * melts into night over minutes instead of flipping. The renderer draws it
 * as one full-screen fill — cheap, and it unifies the whole frame's mood in
 * a way per-sprite tints never could.
 */
export function skyTint(clock) {
  const tint = PHASE_TINTS[clock.phase];
  const prev = previousPhase(clock.phase);
  const prevTint = PHASE_TINTS[prev];
  const b = clock.blend;
  const r = Math.round(prevTint[0] + (tint[0] - prevTint[0]) * b);
  const g = Math.round(prevTint[1] + (tint[1] - prevTint[1]) * b);
  const bl = Math.round(prevTint[2] + (tint[2] - prevTint[2]) * b);
  const alpha = prevTint[3] + (tint[3] - prevTint[3]) * b;
  return { r, g, b, alpha: Math.max(0, Math.min(0.42, alpha)) };
}

/** The phase before this one, for the tint blend. */
function previousPhase(phase) {
  if (phase === 'dawn') return 'night';
  if (phase === 'day') return 'dawn';
  if (phase === 'sunset') return 'day';
  return 'sunset';
}

/**
 * How strongly the streetlamps and neon glow right now, 0..1. Day: off.
 * Sunset: warming up. Night: full. Dawn: fading out. The renderer
 * multiplies its lamp sprite alpha by this, so the city lights itself.
 */
export function lampGlow(clock) {
  if (clock.phase === 'night') return 1;
  if (clock.phase === 'day') return 0;
  if (clock.phase === 'sunset') return Math.min(1, Math.max(0, (clock.minutes - 1080) / 120));
  return Math.min(1, Math.max(0, 1 - (clock.minutes - 300) / 120));
}

/** How busy the sidewalks are right now, 0.45..1.0. */
export function pedDensity(clock) {
  return PHASE_DENSITY[clock.phase].ped;
}

/** How busy the roads are right now, 0.5..1.0. */
export function trafficDensity(clock) {
  return PHASE_DENSITY[clock.phase].traffic;
}

/** The clock as the HUD shows it: "08:00" plus the phase icon. */
export function clockText(clock) {
  const h = Math.floor(clock.minutes / 60) % 24;
  const m = Math.floor(clock.minutes % 60);
  const hh = h < 10 ? `0${h}` : `${h}`;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${hh}:${mm}`;
}

/** The clock line for the HUD: time, icon and phase name in one glance. */
export function clockHudText(clock) {
  return `${phaseIcon(clock)} ${clockText(clock)} · ${phaseName(clock)}`;
}

/**
 * Jump the clock to a minute of the day (the screenshot stager and the debug
 * keys use this): the phase and blend settle at once, so the frame after the
 * jump already shows the new light.
 */
export function setClockMinutes(clock, minutes) {
  clock.minutes = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  clock.phase = phaseAt(clock.minutes);
  clock.blend = 1;
}

/** The next phase boundary, in game minutes from now — for the HUD's "sunset
 * in 40 min" hint and for scheduling phase events. */
export function minutesToNextPhase(clock) {
  const order = [300, 480, 1020, 1200, 1440];
  for (const edge of order) {
    if (clock.minutes < edge) return Math.round(edge - clock.minutes);
  }
  return Math.round(1440 - clock.minutes + 300);
}

/** A short line about the coming light, for the HUD's clock tooltip. */
export function nextPhaseHint(clock) {
  const mins = minutesToNextPhase(clock);
  const next = phaseAt((clock.minutes + mins + 1) % DAY_MINUTES);
  const name = next === 'dawn' ? 'Dawn' : next === 'day' ? 'Day' : next === 'sunset' ? 'Sunset' : 'Night';
  return `${name} in ${mins} min`;
}

/**
 * Night pay: the city pays better after dark. A night fare or a night package
 * is worth more — the side-work code asks this before it pays, so the bonus
 * is one function, not a number copied in three places.
 */
export function nightBonusMultiplier(clock) {
  return isNight(clock) ? 1.25 : 1;
}

/** The clock a save keeps: just the minutes — the phase follows from it. */
export function clockSaveData(clock) {
  return { minutes: Math.round(clock.minutes) };
}

/** Restore the clock from a save (v3 saves carry none: 08:00). */
export function applyClockSave(clock, data) {
  if (!data || typeof data.minutes !== 'number') return;
  setClockMinutes(clock, data.minutes);
}

/**
 * Fireflies over the park at night: positions drift slowly, glow amber, and
 * only exist while it is dark. The renderer asks for them once per frame; the
 * list is rebuilt cheaply from the clock and the frame count, so no state is
 * kept and nothing allocates in the hot loop beyond the small array itself.
 */
export function fireflyPositions(clock, frame, park) {
  if (!isNight(clock) || !park) return [];
  const out = [];
  for (let i = 0; i < 10; i += 1) {
    const t = frame * 0.008 + i * 1.7;
    const x = park.x + park.w / 2 + Math.sin(t * 0.9 + i) * (park.w / 2 - 30);
    const y = park.y + park.h / 2 + Math.cos(t * 0.7 + i * 2.3) * (park.h / 2 - 24);
    const glow = 0.35 + 0.35 * Math.sin(t * 2.4 + i);
    out.push({ x, y, glow: Math.max(0.1, glow) });
  }
  return out;
}
