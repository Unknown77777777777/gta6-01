# Costa Sol — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Unknown77777777777/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Unknown77777777777/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

Lena Cruz drives for a living — and owes Marco Venn $2,000 for the last job that
went wrong. **Costa Sol** is a sun-soaked coastal city, open from the beachfront
to the harbour pier, and every street in it is yours: walk it, drive it, steal
it, and stay ahead of the police while nine story missions pay the debt off
and settle the score with Marco himself.

**2.5D Edition:** extruded building roofs with GTA 2-style parallax, golden
sunset melting into neon night, headlight cones and flashing police sirens,
textured asphalt with zebra crossings, four vehicle classes, damage smoke and
fire, skid marks, floating score popups, and a three-station procedural
WebAudio car radio — all on the same 2D physics, still 60 FPS, still zero
network requests.

**v4 — a living city, and the reckoning:** the sun now moves — a full day-night
cycle turns the golden afternoon into sunset and neon night, streetlamps burn,
fireflies drift over the park, and night pays 1.25× on side work. The eight
named districts have character: police presence, gang activity and their own
bonuses, and a district Lena finishes a job in comes under her control. She
fights back with an arsenal (pistol, shotgun, SMG, rifle — orange pickups,
1–4 to switch, reload with R), and the story talks back: every mission opens
with a letterboxed briefing from Lena, Marco, Sol, Ada, Doc or the radio, and
closes with a debrief. Between jobs there are street races ($50 in, $300 for
the win), vigilante chases (V, ram the red car) and paramedic runs (pick the
patient up, get them to the hospital). The police fight back too: roadblocks
and spike strips at high heat. And the story goes on past the debt — three
more missions, $2,000 more: steal the getaway van, run the evidence to the
lawyer under lockdown, and end it with Marco's sedan in the harbour chase.

## Play

Open `game/index.html` in a desktop browser — no build step, no network, no
install. Everything (code, art, sound) is generated from the files in `game/`.

- **WASD / Arrows** — walk and drive (Shift to run)
- **E** — enter / steal a car, pick up a fare or a package
- **Mouse + Click** — aim and shoot · **F** — punch · **R** — radio (in a car) / reload (on foot)
- **1–4** — pistol / shotgun / SMG / rifle · **V** — start a vigilante chase (in a car, no heat)
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
- Cars to steal and drive in nine classes — Compact, Sedan, Sports, Police
  Interceptor, Motorcycle, Truck, Limo, Ambulance, Van — each with its own
  speed, acceleration, steering and size, plus arcade handling, handbrake
  slides, tire marks and damage smoke/fire.
- A wanted level (0–5 stars): steal, hit someone, shoot, rob the QuickStop —
  and the police come for you. Lose them, or hide at Sol Garage. Hotter heat
  cools slower, cruisers arrive faster, and five stars brings five cars — plus
  roadblocks across the road and spike strips that shred your tyres.
- Nine story missions with briefings, a GPS waypoint arrow with live distance,
  timers, rewards and a debt meter: fares, a borrowed coupe, a heat run, a hot
  package, a quick score, and the last getaway — then the reckoning: steal the
  getaway van, run the evidence to the lawyer while the city locks down, and
  ram Marco's sedan to a stop for the final word. Anti soft-lock: the mission
  coupe respawns if wrecked or lost, a ride is always nearby when a job
  starts, and wasted/busted retries reset clean with no duplicates.
- Side work between missions: taxi fares (wait for the green TAXI pin, pull up
  in any car, press E, deliver for $60+ and a tip), 8 hidden packages ($25
  each, on foot), and 3 stunt ramps ($50 a jump over 100 km/h). All of it is
  saved (save v4) and marked on the map and the minimap. At night, side work
  pays 1.25×, and jump combos stack.
- A day-night cycle: the clock runs from 08:00, the sky warms at dusk and
  darkens at night, lamps glow, fireflies drift over the park, and the streets
  thin out after dark. Eight named districts — North Plaza, Downtown, South
  Market, East Docks, Sol Garage, North Marina, Beachfront, Harbour Pier —
  each with police presence, gang activity and bonuses; finishing a job in a
  district brings it under Lena's control for extra pay, and a police raid can
  break out in the hot ones.
- An arsenal: pistol (12 rounds), shotgun, SMG and rifle, found as orange
  pickups around the city, switched with 1–4, reloaded with R, each with its
  own damage, range, spread and tracer colour. Cutscene dialogues: every
  mission opens with a letterboxed briefing and closes with a debrief, typed
  out line by line — advance with E or a click.
- Minigames between jobs: street races on the east avenue ($50 entry, $300
  for first, $100 for second, three rivals), vigilante chases (V in a car
  with no heat — ram the red criminal car, $150 a stop, combo bonus) and
  paramedic runs (pick the patient up in the ambulance, get them to the
  hospital in 90 seconds, $120 a save).
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
- `game/src/missions2.js` — missions 7–9: the van, the evidence, Marco
- `game/src/weapons.js` — the arsenal: guns, ammo, pickups
- `game/src/daynight.js` — the day-night cycle: clock, phases, sky tints
- `game/src/districts.js` — the eight named districts, control and raids
- `game/src/cutscenes.js` — dialogue: briefings, debriefs, typewriter
- `game/src/minigames.js` — street races, vigilante chases, paramedic runs
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
