# Costa Sol — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Unknown77777777777/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Unknown77777777777/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

Lena Cruz drives for a living — and owes Marco Venn $2,000 for the last job that
went wrong. **Costa Sol** is a sun-soaked coastal city, open from the beachfront
to the harbour pier, and every street in it is yours: walk it, drive it, steal
it, and stay ahead of the police while six story missions pay the debt off.

**2.5D Edition:** extruded building roofs with GTA 2-style parallax, golden
sunset melting into neon night, headlight cones and flashing police sirens,
textured asphalt with zebra crossings, four vehicle classes, damage smoke and
fire, skid marks, floating score popups, and a three-station procedural
WebAudio car radio — all on the same 2D physics, still 60 FPS, still zero
network requests.

**v3 — faster and busier:** the static city (ground, roads, trees) is baked
once into offscreen tiles, so each frame draws ~6 tile images instead of
hundreds of pattern fills; building wall shades are pre-computed, lighting
walks the car lists without allocating, and particles live in a fixed pool.
The HUD shows the live FPS. Between missions Lena can now drive taxi fares
(pull up to a waiting passenger, press E, drop them off for $60+), pocket 8
hidden packages ($25 each), and hit stunt ramps at speed ($50 a jump) — all
saved in the v3 save file. Hotter chases are harder to shake: the heat cools
slower and five cruisers answer a five-star wanted level.

## Play

Open `game/index.html` in a desktop browser — no build step, no network, no
install. Everything (code, art, sound) is generated from the files in `game/`.

- **WASD / Arrows** — walk and drive (Shift to run)
- **E** — enter / steal a car, pick up a fare or a package
- **Mouse + Click** — aim and shoot · **F** — punch · **R** — radio (in a car) / reload (on foot)
- **Space** — handbrake · **P** — pause · **M** — mute

## What's in the city

- A full grid city: avenues, blocks, houses, a park, a plaza fountain, a beach
  with umbrellas and towels, and a harbour pier with boats riding the swell —
  drawn in 2.5D with extruded roofs, lit windows, wall faces and neon, in
  golden-sunset-to-neon-night light. Eight named districts show on the HUD
  as Lena moves: North Plaza, Downtown, South Market, East Docks, Sol Garage,
  North Marina, Beachfront and the Harbour Pier.
- Traffic that cruises the roads and pedestrians who stroll the sidewalks (and
  run when a gun goes off).
- Cars to steal and drive in four classes — Compact, Sedan, Sports, Police
  Interceptor — each with its own speed, acceleration, steering and size,
  plus arcade handling, handbrake slides, tire marks and damage smoke/fire.
- A wanted level (0–5 stars): steal, hit someone, shoot, rob the QuickStop —
  and the police come for you. Lose them, or hide at Sol Garage. Hotter heat
  cools slower, cruisers arrive faster, and five stars brings five cars.
- Six story missions with briefings, a GPS waypoint arrow with live distance,
  timers, rewards and a debt meter: fares, a borrowed coupe, a heat run, a hot
  package, a quick score, and the last getaway. Anti soft-lock: the mission
  coupe respawns if wrecked or lost, a ride is always nearby when a job
  starts, and wasted/busted retries reset clean with no duplicates.
- Side work between missions: taxi fares (wait for the green TAXI pin, pull up
  in any car, press E, deliver for $60+ and a tip), 8 hidden packages ($25
  each, on foot), and 3 stunt ramps ($50 a jump over 100 km/h). All of it is
  saved (save v3) and marked on the map and the minimap.
- HUD with money, wanted stars, health, speed, mission objective + GPS
  distance and a live minimap. Start screen, pause menu, busted/wasted
  respawns, and saves in localStorage (including the debt ledger).
- Sound synthesized live with WebAudio: engine hum, sirens, gunshots, pickup
  blips and mission jingles, plus a four-station procedural car radio
  (COSTA SYNTHWAVE, HARBOR LO-FI, POLICE SCANNER, SUNSET DRIVE — R to switch).
  No audio files. Side work has its own sounds: a coin chime, a jump whoosh,
  a cab blip.

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
- `game/src/particles.js` — the pooled particle system (bursts, smoke)
- `game/src/side.js` — side work: taxi fares, hidden packages, stunt jumps
- `main.ts` — hands the entry in (`mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`)

## License

MIT — see [LICENSE](LICENSE). An original game: its city, characters, story,
art and sounds were made for this entry.
