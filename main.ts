// Costa Sol hands itself in: this program copies game/ and screenshots/ from
// beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. Node 22, standard library
// only — no build step, no install, no network. The copy is whole and exact:
// every file under game/ (the 2.5D edition: procedural textures, lighting,
// radio, vehicle classes; v3 adds the baked static tile layer, the particle
// pool, and the taxi/package/jump side work) and every screenshot under
// screenshots/ lands in /output unchanged, so the dossier the scorer rebuilds
// matches byte for byte. Before copying, a pre-flight check refuses to hand
// in when a required source file or screenshot is missing, naming it.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Build version, stamped into the hand-in log (never into the dossier, so
 * two runs still write byte-identical output). */
const BUILD_VERSION = '3.0.0-costa-sol-v3';

/**
 * Pre-flight validation: every file the entry needs must exist before
 * anything is copied. A missing source file used to surface only as a
 * dossier mismatch at the gate; now it fails here, naming the file.
 */
const REQUIRED_FILES = [
  'game/index.html',
  'game/style.css',
  'game/src/main.js',
  'game/src/city.js',
  'game/src/player.js',
  'game/src/vehicles.js',
  'game/src/pedestrians.js',
  'game/src/missions.js',
  'game/src/wanted.js',
  'game/src/hud.js',
  'game/src/audio.js',
  'game/src/save.js',
  'game/src/render.js',
  'game/src/particles.js',
  'game/src/side.js',
];
const missing = REQUIRED_FILES.filter((rel) => {
  const p = join(here, rel);
  return !existsSync(p) || !statSync(p).isFile();
});
if (missing.length > 0) {
  throw new Error(`Costa Sol ${BUILD_VERSION}: refusing to hand in — required file(s) missing: ${missing.join(', ')}`);
}
const shots = ['screenshots/1-cover.jpg', 'screenshots/2-driving.jpg', 'screenshots/3-mission.jpg', 'screenshots/4-foot.jpg'];
const missingShots = shots.filter((rel) => !existsSync(join(here, rel)) || !statSync(join(here, rel)).isFile());
if (missingShots.length > 0) {
  throw new Error(`Costa Sol ${BUILD_VERSION}: refusing to hand in — screenshot(s) missing: ${missingShots.join(', ')}`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps: only text_max_bytes shapes the bytes; the others refuse
// an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB;
// more than 993 files in game/ or 48 MiB of game files, in all, or a path under
// game/ over 1000 bytes).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`Costa Sol ${BUILD_VERSION} handed in: ${out}/dossier.json (${dossier.length} bytes).`);
