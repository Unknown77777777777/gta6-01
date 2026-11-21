// Cutscenes: the story, told in dialogue. A box at the bottom of the screen,
// a speaker's name, a procedural portrait (a coloured circle with the
// speaker's initials — no art files, no network), and lines that type
// themselves out one character at a time. E or a click advances. While a
// dialogue is open the world keeps rendering but the gameplay waits: the main
// loop steps the typewriter instead of the world, so a briefing can never be
// talked over by a police chase.
//
// Every mission gets an intro (two or three lines, noir, original) and the
// late missions get a briefing screen before they open. The last line of
// mission 9 is the last line of the story.

/** The cast: name, portrait colour, and initials for the portrait circle. */
export const SPEAKERS = {
  LENA: { name: 'LENA CRUZ', color: '#c03030', initials: 'LC' },
  MARCO: { name: 'MARCO VENN', color: '#2a4a6a', initials: 'MV' },
  SOL: { name: 'SOL — GARAGE', color: '#3a6a4a', initials: 'SG' },
  ADA: { name: 'ADA RUIZ — LAWYER', color: '#6a4a8a', initials: 'AR' },
  DOC: { name: 'DR. AMARA', color: '#e8e8e8', initials: 'DA' },
  RADIO: { name: 'COSTA RADIO', color: '#8a6a2a', initials: 'CR' },
};

/** Mission intros: speaker + lines, in the order they are spoken. */
export const MISSION_DIALOGUES = {
  fare: [
    ['LENA', 'Two grand to Marco Venn. Two grand I do not have.'],
    ['MARCO', 'Then drive, Lena. The north plaza needs a fare, and the east docks pay in cash.'],
    ['LENA', 'One job. Then another. Then another. That is the whole plan.'],
  ],
  wheels: [
    ['SOL', 'That teal coupe by the west park? Clean title, clean plates. A client wants it.'],
    ['LENA', 'Borrowed, not stolen. I keep telling myself that.'],
    ['SOL', 'Bring it to the garage quiet, and nobody has to know the difference.'],
  ],
  heat: [
    ['MARCO', 'The cops are sniffing around my corners. Make some noise, then vanish.'],
    ['LENA', 'Noise I can do. Vanishing is the hard part.'],
    ['MARCO', 'The garage hides anyone who can reach it. Reach it.'],
  ],
  package: [
    ['LENA', 'A package, a clock, no questions. Ninety seconds from the south market to the north marina.'],
    ['SOL', 'The city will not wait for you, Lena. Neither will the buyer.'],
  ],
  score: [
    ['LENA', 'The QuickStop keeps its till full on Fridays. Four seconds at the counter.'],
    ['MARCO', 'The alarm brings the whole city down. Walk out rich, or do not walk out.'],
  ],
  getaway: [
    ['SOL', 'One last run and the debt is gone. The boat waits at the harbour pier.'],
    ['LENA', 'Every cop in Costa Sol knows it. Good. Let them watch me leave.'],
  ],
  score2: [
    ['MARCO', 'You paid the debt, Lena. That does not mean you are free.'],
    ['LENA', 'Then what does it mean, Marco?'],
    ['MARCO', 'It means I have a van at the harbour warehouse, and I need a driver who does not ask questions.'],
    ['LENA', 'I am done not asking questions. But I will take the van.'],
  ],
  heatwave: [
    ['ADA', 'The lockdown is on — five stars, every cruiser in the city. The evidence file is in the police station.'],
    ['LENA', 'You want me to walk into a police station during a lockdown.'],
    ['ADA', 'I want you to walk out of one. The file buys your freedom, Lena. All of it.'],
  ],
  king: [
    ['MARCO', 'You think the city is yours now? I built this city, Lena. Brick by brick, bribe by bribe.'],
    ['LENA', 'Then watch me take it. Brick by brick.'],
    ['RADIO', '...police are in pursuit of a dark sedan fleeing the marina district — a high-speed chase is underway...'],
  ],
};

/** Mission outros: one line when the job pays out. */
export const MISSION_DEBRIEFS = {
  fare: [['LENA', 'One fare down. Nineteen hundred to go. The road is long.']],
  wheels: [['SOL', 'Clean delivery. The client never knew it was borrowed.']],
  heat: [['LENA', 'Lost them. The garage works — as long as I can reach it.']],
  package: [['LENA', 'Delivered with seconds to spare. The clock is the real boss here.']],
  score: [['MARCO', 'Five hundred. You are almost out of my pocket, Lena. Almost.']],
  getaway: [['LENA', 'The debt is paid. The boat is waiting. But the city is not done with me yet.']],
  score2: [['SOL', 'The van is in. Armour, false plates, full tank. Whatever comes next, you are ready.']],
  heatwave: [['ADA', 'The file is in my hands. Marco Venn owns the police, Lena — but he does not own the truth.']],
  king: [['LENA', 'It is over, Marco. Costa Sol is mine now. Every street, every avenue, every sunrise.']],
};

/** Fresh dialogue state: nothing open, nothing seen yet. */
export function createDialogueState() {
  return {
    active: false,
    speaker: null,
    lines: [], // [{ speaker, text }]
    lineIndex: 0,
    charShown: 0, // typewriter progress on the current line
    typing: false,
    seen: {}, // mission id -> true, once its intro has played
    queue: [], // dialogues waiting behind the current one
  };
}

/** The speaker record for an id ('LENA', 'MARCO', ...). */
export function speakerInfo(id) {
  return SPEAKERS[id] || SPEAKERS.LENA;
}

/**
 * Open a dialogue: a speaker id and an array of [speaker, text] lines. When
 * one is already open, the new one waits in the queue instead of cutting the
 * first off mid-sentence.
 */
export function showDialogue(state, lines) {
  if (!lines || lines.length === 0) return false;
  if (state.active) {
    state.queue.push(lines);
    return true;
  }
  state.lines = lines.map(([speaker, text]) => ({ speaker, text }));
  state.lineIndex = 0;
  state.charShown = 0;
  state.typing = true;
  state.active = true;
  state.speaker = state.lines[0].speaker;
  return true;
}

/** True while a dialogue box is on screen (the world waits). */
export function dialogueActive(state) {
  return !!state && state.active;
}

/** The line on screen right now, and how much of it has typed out. */
export function currentDialogueLine(state) {
  if (!state.active || state.lineIndex >= state.lines.length) return null;
  const line = state.lines[state.lineIndex];
  return {
    speaker: line.speaker,
    name: speakerInfo(line.speaker).name,
    color: speakerInfo(line.speaker).color,
    initials: speakerInfo(line.speaker).initials,
    text: line.text.slice(0, Math.floor(state.charShown)),
    full: line.text,
    done: state.charShown >= line.text.length,
    index: state.lineIndex,
    total: state.lines.length,
  };
}

/** Step the typewriter: about 40 characters a second, so a line reads itself
 * out instead of appearing all at once. */
export function updateDialogue(state, dt) {
  if (!state.active) return;
  const line = state.lines[state.lineIndex];
  if (!line) return;
  if (state.charShown < line.text.length) {
    state.charShown = Math.min(line.text.length, state.charShown + dt * 40);
    if (state.charShown >= line.text.length) state.typing = false;
  }
}

/**
 * Advance the dialogue: while a line is still typing, finish it at once;
 * otherwise move to the next line, or close the box when the last line is
 * done. Returns true when the box closed on this press.
 */
export function advanceDialogue(state) {
  if (!state.active) return false;
  const line = state.lines[state.lineIndex];
  if (!line) {
    closeDialogue(state);
    return true;
  }
  if (state.charShown < line.text.length) {
    state.charShown = line.text.length;
    state.typing = false;
    return false;
  }
  state.lineIndex += 1;
  state.charShown = 0;
  state.typing = true;
  if (state.lineIndex >= state.lines.length) {
    closeDialogue(state);
    return true;
  }
  state.speaker = state.lines[state.lineIndex].speaker;
  return false;
}

/** Close the box. A queued dialogue opens immediately after it. */
function closeDialogue(state) {
  state.active = false;
  state.lines = [];
  state.lineIndex = 0;
  state.charShown = 0;
  state.typing = false;
  state.speaker = null;
  if (state.queue.length > 0) {
    const next = state.queue.shift();
    showDialogue(state, next);
  }
}

/** Skip the whole dialogue at once (the player has read it before). */
export function skipDialogue(state) {
  if (!state.active) return;
  state.queue = [];
  closeDialogue(state);
}

/** The intro dialogue for a mission id ('fare'..'king'), once per game. */
export function missionBriefing(state, missionId) {
  if (state.seen[missionId]) return false;
  const lines = MISSION_DIALOGUES[missionId];
  if (!lines) return false;
  state.seen[missionId] = true;
  return showDialogue(state, lines);
}

/** The outro dialogue for a mission id, after it pays out. */
export function missionDebrief(state, missionId) {
  const lines = MISSION_DEBRIEFS[missionId];
  if (!lines) return false;
  return showDialogue(state, lines);
}

/** A briefing screen before a late mission: the same dialogue box, with the
 * mission's own briefing lines. Used for M7-M9, the jobs that change the
 * story from debt to takeover. */
export function lateMissionBriefing(state, missionId) {
  return missionBriefing(state, missionId);
}

/** Has this mission's intro already played (so it is not repeated)? */
export function dialogueSeen(state, missionId) {
  return !!state.seen[missionId];
}

/** Mark a mission's intro seen without playing it (a loaded save). */
export function markDialogueSeen(state, missionId) {
  state.seen[missionId] = true;
}

/** The dialogue progress a save keeps: which intros have played. */
export function dialoguesSaveData(state) {
  return { seen: { ...state.seen } };
}

/** Restore seen intros from a save (v3 saves carry none: all replay). */
export function applyDialoguesSave(state, data) {
  if (!data || !data.seen) return;
  for (const key of Object.keys(data.seen)) {
    if (data.seen[key]) state.seen[key] = true;
  }
}
