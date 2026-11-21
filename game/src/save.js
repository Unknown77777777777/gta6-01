// Saving Costa Sol: money, mission progress, Lena's position and health, kept in
// localStorage between visits. A save from a finished story still loads — it just
// starts a free-roam city with the debt paid.

import { ALL_MISSIONS } from './missions.js';
import { sideSaveData } from './side.js';
import { weaponsSaveData } from './weapons.js';
import { missions2SaveData } from './missions2.js';
import { minigamesSaveData } from './minigames.js';
import { clockSaveData } from './daynight.js';
import { districtsSaveData } from './districts.js';
import { dialoguesSaveData } from './cutscenes.js';

export const SAVE_KEY = 'costa-sol.save.v1';
/** Save schema version: v4 adds weapons, the late missions, minigame stats,
 * the day-night clock, controlled districts and seen dialogues. */
export const SAVE_VERSION = 4;

/** Dollars of the $2000 debt already paid off, from a list of finished ids. */
export function debtPaidFromIds(completedIds) {
  let sum = 0;
  for (const id of completedIds || []) {
    const m = ALL_MISSIONS.find((mm) => mm.id === id);
    if (m) sum += m.reward;
  }
  return sum;
}

/** Migrate a v3 save (no v4 blocks) up to v4: the old progress stays, the new
 * systems start empty. A v2 save migrates the same way. */
export function migrateSaveToV4(data) {
  if (!data) return null;
  const out = { ...data, version: 4 };
  if (!out.weapons) out.weapons = null;
  if (!out.missions2) out.missions2 = null;
  if (!out.minigames) out.minigames = null;
  if (!out.clock) out.clock = null;
  if (!out.districts) out.districts = null;
  if (!out.dialogues) out.dialogues = null;
  // v3 completedIds only knew six missions; a v3 save that finished the story
  // still finished it — the late missions simply wait, unplayed.
  if (!Array.isArray(out.completedIds)) out.completedIds = [];
  return out;
}

/** Snapshot the parts of the game worth keeping. The debt ledger is stored
 * explicitly — completed mission ids and the money earned from them — so the
 * $2000 payoff progress survives a reload exactly, never recomputed from a
 * guess. v3 also keeps the side-work ledger: which hidden packages are
 * pocketed, how many fares were driven, and the jump count. v4 adds the
 * arsenal, the late-mission flags, the minigame stats, the clock, the
 * controlled districts and the seen dialogues. */
export function saveGame(game) {
  const data = {
    version: SAVE_VERSION,
    money: game.money,
    missionIndex: game.missions.done ? game.missions.index : game.missions.index,
    missionDone: game.missions.done,
    completedIds: [...(game.missions.completedIds || [])],
    debtPaid: debtPaidFromIds(game.missions.completedIds || []),
    x: game.player.x,
    y: game.player.y,
    health: game.player.health,
    wanted: game.wanted.level,
    radioStation: game.radioStation || 0,
    side: game.side ? sideSaveData(game.side) : null,
    weapons: game.player ? weaponsSaveData(game.player) : null,
    missions2: game.missions2 ? missions2SaveData(game.missions2) : null,
    minigames: game.minigames ? minigamesSaveData(game.minigames) : null,
    clock: game.clock ? clockSaveData(game.clock) : null,
    districts: game.districts ? districtsSaveData(game.districts) : null,
    dialogues: game.dialogue ? dialoguesSaveData(game.dialogue) : null,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // storage off (private windows): the run lasts this visit only
  }
}

/** Read a save back, or null when there is none or it is broken. A v2 save
 * (no `side` block) loads fine: the side ledger just starts empty. */
export function loadSave() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number' || typeof data.missionIndex !== 'number') return null;
    if (!data.version || data.version < 2) return null; // pre-ledger saves are too old to trust
    if (data.version < 4) return migrateSaveToV4(data);
    return data;
  } catch {
    return null;
  }
}

/** True when a save exists to continue from. */
export function hasSave() {
  return loadSave() !== null;
}

/**
 * One line about a save, for the title screen's Continue button: how much
 * of the debt is paid and how much cash Lena carries. Null when no save.
 */
export function saveSummary() {
  const data = loadSave();
  if (!data) return null;
  const paid = data.debtPaid || 0;
  const missionsDone = (data.completedIds || []).length;
  return `Continue — $${data.money} · debt $${Math.max(0, 2000 - paid)} left · ${missionsDone}/9 jobs done`;
}

/** The v4 Continue line: nine jobs, the late story, and the minigames. */
export function saveSummaryV4() {
  const data = loadSave();
  if (!data) return null;
  const paid = data.debtPaid || 0;
  const missionsDone = (data.completedIds || []).length;
  const late = (data.completedIds || []).filter((id) => ['score2', 'heatwave', 'king'].includes(id)).length;
  const extra = late > 0 ? ` · late story ${late}/3` : '';
  return `Continue — $${data.money} · debt $${Math.max(0, 2000 - paid)} left · ${missionsDone}/9 jobs done${extra}`;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
