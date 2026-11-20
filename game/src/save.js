// Saving Costa Sol: money, mission progress, Lena's position and health, kept in
// localStorage between visits. A save from a finished story still loads — it just
// starts a free-roam city with the debt paid.

export const SAVE_KEY = 'costa-sol.save.v1';

/** Snapshot the parts of the game worth keeping. */
export function saveGame(game) {
  const data = {
    version: 1,
    money: game.money,
    missionIndex: game.missions.done ? game.missions.index : game.missions.index,
    missionDone: game.missions.done,
    x: game.player.x,
    y: game.player.y,
    health: game.player.health,
    wanted: game.wanted.level,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // storage off (private windows): the run lasts this visit only
  }
}

/** Read a save back, or null when there is none or it is broken. */
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
    return data;
  } catch {
    return null;
  }
}

/** True when a save exists to continue from. */
export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
