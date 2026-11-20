# Costa Sol — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Unknown77777777777/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Unknown77777777777/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

Lena Cruz drives for a living — and owes Marco Venn $2,000 for the last job that
went wrong. **Costa Sol** is a sun-soaked coastal city, open from the beachfront
to the harbour pier, and every street in it is yours: walk it, drive it, steal
it, and stay ahead of the police while six story missions pay the debt off.

## Play

Open `game/index.html` in a desktop browser — no build step, no network, no
install. Everything (code, art, sound) is generated from the files in `game/`.

- **WASD / Arrows** — walk and drive (Shift to run)
- **E** — enter / steal a car, pick up a fare or a package
- **Mouse + Click** — aim and shoot · **F** — punch · **R** — reload
- **Space** — handbrake · **P** — pause · **M** — mute

## What's in the city

- A full grid city: avenues, blocks, houses, a park, a plaza fountain, a beach
  and a harbour pier — all drawn top-down in bright midday light.
- Traffic that cruises the roads and pedestrians who stroll the sidewalks (and
  run when a gun goes off).
- Cars to steal and drive, with arcade handling, handbrake slides, tire marks
  and smoke.
- A wanted level (0–5 stars): steal, hit someone, shoot, rob the QuickStop —
  and the police come for you. Lose them, or hide at Sol Garage.
- Six story missions with briefings, waypoint arrows, timers, rewards and a
  debt meter: fares, a borrowed coupe, a heat run, a hot package, a quick
  score, and the last getaway.
- HUD with money, wanted stars, health, speed, mission objective and a live
  minimap. Start screen, pause menu, busted/wasted respawns, and saves in
  localStorage.
- Sound synthesized live with WebAudio: engine hum, sirens, gunshots, pickup
  blips and mission jingles. No audio files.

## Files

- `game/index.html` + `game/style.css` — the page, HUD and menus
- `game/src/main.js` — boot, game loop, state machine, screenshots
- `game/src/city.js` — the seeded city: roads, blocks, beach, harbour
- `game/src/player.js` — Lena on foot and in combat
- `game/src/vehicles.js` — driving physics, traffic AI, police AI
- `game/src/pedestrians.js` — the people of Costa Sol
- `game/src/missions.js` — the story and its six missions
- `game/src/wanted.js` — the wanted level and the heat
- `game/src/hud.js` — HUD text and the minimap
- `game/src/audio.js` — synthesized WebAudio sound
- `game/src/save.js` — localStorage saves
- `game/src/render.js` — drawing the world, effects and sunlight
- `main.ts` — hands the entry in (`mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`)

## License

MIT — see [LICENSE](LICENSE). An original game: its city, characters, story,
art and sounds were made for this entry.
