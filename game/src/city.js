// Costa Sol: the city itself. A seeded grid city on the coast — avenues, blocks,
// buildings, a park, a plaza, a beach along the south edge and a harbour pier on
// the east edge. Everything is generated from one seed, so the same seed always
// builds the same city. No drawing here: this file only knows where things are
// and what blocks movement.

export const WORLD_W = 4800;
export const WORLD_H = 3600;

/** The road centrelines: vertical avenues and horizontal streets. */
export const ROAD_V = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400, 3800, 4200, 4600];
export const ROAD_H = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROAD_HALF = 55;

export const BEACH_Y = 3100;
export const WATER_Y = 3420;
export const HARBOR_X = 4680;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Seeded random (mulberry32): the same seed gives the same city, traffic and shots. */
export function createRng(seed) {
  let a = seed | 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROOFS = ['#e8a88f', '#f2c98a', '#8fc8b8', '#e89ab0', '#9ab0d8', '#d8c89a', '#a8d08a', '#c89ad8', '#f0b090', '#7fb8c8'];
const WALLS = ['#f7d9c4', '#fbe8c0', '#c8e8dc', '#f8ccd8', '#c8d4ec', '#ece0b8', '#d8eec8', '#e8ccf0', '#fadcc8', '#b8dce8'];

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/**
 * Build the city from a seed. Returns buildings, trees, the park, the plaza, the
 * garage hideout, the hospital, the corner store, the pier, and the player's spawn.
 */
export function createCity(seed) {
  const rng = createRng(seed);
  const buildings = [];
  const trees = [];

  // The park block (avenue 5, street 3) and the plaza block (avenue 2, street 1)
  // hold no buildings; the garage, hospital and store blocks hold their own.
  const PARK = { i: 5, j: 3 };
  const PLAZA = { i: 2, j: 1 };
  const GARAGE = { i: 9, j: 6 };
  const HOSPITAL = { i: 1, j: 5 };
  const STORE = { i: 7, j: 2 };

  function blockRect(i, j) {
    return {
      x: ROAD_V[i] + ROAD_HALF + 16,
      y: ROAD_H[j] + ROAD_HALF + 16,
      w: ROAD_V[i + 1] - ROAD_V[i] - 2 * (ROAD_HALF + 16),
      h: ROAD_H[j + 1] - ROAD_H[j] - 2 * (ROAD_HALF + 16),
    };
  }

  for (let i = 0; i < ROAD_V.length - 1; i += 1) {
    for (let j = 0; j < ROAD_H.length - 1; j += 1) {
      const b = blockRect(i, j);
      if (i === PARK.i && j === PARK.j) {
        for (let t = 0; t < 16; t += 1) {
          trees.push({ x: b.x + 24 + rng() * (b.w - 48), y: b.y + 24 + rng() * (b.h - 48), r: 16 + rng() * 10 });
        }
        continue;
      }
      if (i === PLAZA.i && j === PLAZA.j) {
        for (let t = 0; t < 6; t += 1) {
          const a = (t / 6) * Math.PI * 2;
          trees.push({ x: b.x + b.w / 2 + Math.cos(a) * 90, y: b.y + b.h / 2 + Math.sin(a) * 70, r: 14 });
        }
        continue;
      }
      if (i === GARAGE.i && j === GARAGE.j) {
        buildings.push({ x: b.x, y: b.y, w: b.w, h: b.h, hgt: 26, roof: '#5a6a7a', wall: '#8a9aa8', kind: 'garage', label: 'SOL GARAGE' });
        continue;
      }
      if (i === HOSPITAL.i && j === HOSPITAL.j) {
        buildings.push({ x: b.x, y: b.y, w: b.w, h: b.h, hgt: 34, roof: '#e8e8e8', wall: '#f4f4f0', kind: 'hospital', label: 'HOSPITAL' });
        continue;
      }
      if (i === STORE.i && j === STORE.j) {
        buildings.push({ x: b.x, y: b.y, w: b.w, h: b.h, hgt: 22, roof: '#c85a4a', wall: '#f0d8c8', kind: 'store', label: 'QUICKSTOP' });
        continue;
      }
      // A normal block holds one or two buildings with a courtyard gap.
      const count = rng() < 0.55 ? 1 : 2;
      if (count === 1) {
        const w = b.w * (0.55 + rng() * 0.3);
        const h = b.h * (0.55 + rng() * 0.3);
        buildings.push({
          x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h,
          hgt: 18 + Math.floor(rng() * 5) * 12, roof: pick(rng, ROOFS), wall: pick(rng, WALLS), kind: 'house', label: '',
        });
      } else {
        const split = rng() < 0.5;
        for (let k = 0; k < 2; k += 1) {
          const w = split ? b.w * (0.42 + rng() * 0.08) : b.w * (0.6 + rng() * 0.2);
          const h = split ? b.h * (0.6 + rng() * 0.2) : b.h * (0.42 + rng() * 0.08);
          buildings.push({
            x: split ? b.x + k * (b.w / 2) + 6 : b.x + (b.w - w) / 2,
            y: split ? b.y + (b.h - h) / 2 : b.y + k * (b.h / 2) + 6,
            w, h, hgt: 18 + Math.floor(rng() * 4) * 12,
            roof: pick(rng, ROOFS), wall: pick(rng, WALLS), kind: 'house', label: '',
          });
        }
      }
      // A few sidewalk trees around the block.
      if (rng() < 0.6) {
        trees.push({ x: b.x - 8, y: b.y - 8, r: 12 });
        trees.push({ x: b.x + b.w + 8, y: b.y + b.h + 8, r: 12 });
      }
    }
  }

  const park = blockRect(PARK.i, PARK.j);
  const plaza = blockRect(PLAZA.i, PLAZA.j);
  const garage = buildings.find((b) => b.kind === 'garage');
  const hospital = buildings.find((b) => b.kind === 'hospital');
  const store = buildings.find((b) => b.kind === 'store');

  // Streetlamps along the main avenues and the beachfront: warm pools of
  // light for the sunset-to-neon lighting pass. Fixed positions, seeded order.
  const streetlamps = [];
  for (const rx of [600, 1400, 2200, 3000, 3800]) {
    for (let y = 400; y <= 3000; y += 800) streetlamps.push({ x: rx + 62, y });
  }
  for (const ry of [600, 1400, 2200]) {
    for (let x = 400; x <= 4600; x += 800) streetlamps.push({ x, y: ry + 62 });
  }
  for (let x = 400; x <= 4600; x += 700) streetlamps.push({ x, y: 3160 });

  // Side-work spots, all on open ground Lena can reach on foot: the park,
  // the plaza, the beach, the pier, the garage forecourt, the hospital and
  // store fronts, and the north marina roadside. Eight hidden packages pay
  // $25 each; three taxi stands are where fares wait; three ramps on the
  // long avenues pay for a fast jump.
  const garageFront = { x: garage.x + garage.w / 2, y: garage.y + garage.h + 60 };
  const packageSpots = [
    { x: park.x + park.w * 0.3, y: park.y + park.h * 0.3 },
    { x: plaza.x + plaza.w * 0.75, y: plaza.y + plaza.h * 0.7 },
    { x: 1400, y: 3240 },
    { x: 4680, y: 1800 },
    { x: garageFront.x - 60, y: garageFront.y + 30 },
    { x: hospital.x + hospital.w / 2, y: hospital.y + hospital.h + 40 },
    { x: store.x + store.w / 2, y: store.y - 40 },
    { x: 4550, y: 640 },
  ];
  const taxiStands = [
    { x: plaza.x + plaza.w / 2, y: plaza.y + plaza.h + 30 },
    { x: 4200, y: 2540 },
    { x: 2200, y: 3120 },
    { x: garageFront.x, y: garageFront.y },
  ];
  const jumpRamps = [
    { x: 2200, y: 2900, angle: -Math.PI / 2 },
    { x: 3000, y: 600, angle: 0 },
    { x: 4200, y: 2200, angle: Math.PI / 2 },
  ];
  // Boats anchored in the harbour water by the pier: Marco Venn's getaway
  // boat among them. They bob on the swell (drawn live, not baked).
  const boats = [
    { x: 4730, y: 1560, angle: 0.3, color: '#e8e8e8', size: 1 },
    { x: 4720, y: 2080, angle: -0.4, color: '#d8b13c', size: 0.8 },
    { x: 4700, y: 2450, angle: 0.9, color: '#4a90d8', size: 0.9 },
  ];
  // Beach furniture: umbrellas and towels scattered on the sand, seeded so
  // the same seed always lays the same beach. Baked into the static tiles.
  const umbrellaColors = ['#e85a5a', '#4a90d8', '#f2c230', '#6ac88a', '#c86ae8'];
  const beachProps = [];
  for (let i = 0; i < 9; i += 1) {
    const ux = 350 + rng() * 4100;
    const uy = 3150 + rng() * 190;
    beachProps.push({
      x: ux, y: uy,
      color: umbrellaColors[Math.floor(rng() * umbrellaColors.length)],
      towel: rng() < 0.7 ? { x: ux + 26 + rng() * 20, y: uy + 10 + rng() * 14, color: umbrellaColors[Math.floor(rng() * umbrellaColors.length)] } : null,
    });
  }

  return {
    seed, buildings, trees, park, plaza, garage, hospital, store, streetlamps,
    packageSpots, taxiStands, jumpRamps, beachProps, boats,
    beachY: BEACH_Y, waterY: WATER_Y, harborX: HARBOR_X,
    // The pier juts into the harbour water on the east edge; it is walkable.
    pier: { x: 4600, y: 1760, w: 180, h: 80 },
    hideout: { x: garage.x + garage.w / 2, y: garage.y + garage.h + 60, r: 130 },
    spawn: { x: 4000, y: 2960 },
    hospitalSpawn: { x: 800, y: 2650 },
  };
}

/** True when the point is in the sea (south water or the harbour), pier excluded. */
export function isWaterAt(city, x, y) {
  if (y >= city.waterY) return true;
  if (x >= city.harborX) {
    const p = city.pier;
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return false;
    return true;
  }
  return false;
}

/** True when a circle of radius r at (x, y) overlaps a building, the sea or the map edge. */
export function isBlockedAt(city, x, y, r) {
  if (x < r + 8 || x > WORLD_W - r - 8 || y < r + 8 || y > WORLD_H - r - 8) return true;
  if (isWaterAt(city, x, y)) return true;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
  }
  return false;
}

/**
 * Push a circle out of buildings, water and the map edge. Returns true when it moved.
 * The circle slides along walls instead of stopping dead.
 */
export function resolveCircle(city, ent, r) {
  let moved = false;
  if (ent.x < r + 8) { ent.x = r + 8; moved = true; }
  if (ent.x > WORLD_W - r - 8) { ent.x = WORLD_W - r - 8; moved = true; }
  if (ent.y < r + 8) { ent.y = r + 8; moved = true; }
  if (ent.y > WORLD_H - r - 8) { ent.y = WORLD_H - r - 8; moved = true; }
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const cx = clamp(ent.x, b.x, b.x + b.w);
    const cy = clamp(ent.y, b.y, b.y + b.h);
    const dx = ent.x - cx;
    const dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      ent.x = cx + (dx / d) * r;
      ent.y = cy + (dy / d) * r;
    } else {
      // Dead centre inside the building: push out along the shortest side.
      const left = ent.x - (b.x - r);
      const right = b.x + b.w + r - ent.x;
      const top = ent.y - (b.y - r);
      const bottom = b.y + b.h + r - ent.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) ent.x = b.x - r;
      else if (m === right) ent.x = b.x + b.w + r;
      else if (m === top) ent.y = b.y - r;
      else ent.y = b.y + b.h + r;
    }
    moved = true;
  }
  return moved;
}

/** True when the point is on a road (inside the asphalt, not the sidewalk). */
export function isOnRoad(x, y) {
  for (const rx of ROAD_V) if (Math.abs(x - rx) < ROAD_HALF) return true;
  for (const ry of ROAD_H) if (Math.abs(y - ry) < ROAD_HALF) return true;
  return false;
}

/** The nearest point on any road centreline, with which road it is on. */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROAD_V) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y, axis: 'v', road: rx }; }
  }
  for (const ry of ROAD_H) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry, axis: 'h', road: ry }; }
  }
  return best;
}

/** The district Lena is standing in, for the HUD's location line. */
export function districtAt(x, y) {
  if (y >= 3100) return 'Beachfront';
  if (x >= 4600) return 'Harbour Pier';
  if (x >= 4200 && y >= 2200) return 'East Docks';
  if (x < 1400 && y < 1200) return 'North Plaza';
  if (x >= 3600 && x <= 4200 && y >= 2600 && y <= 3100) return 'Sol Garage';
  if (x < 1400 && y >= 2200) return 'South Market';
  if (x >= 4200 && y < 1200) return 'North Marina';
  return 'Downtown';
}

/** A random point on a road, at least `minDist` away from (x, y) when given. */
export function randomRoadPoint(rng, x, y, minDist) {
  for (let tries = 0; tries < 40; tries += 1) {
    let px;
    let py;
    if (rng() < 0.5) {
      px = ROAD_V[Math.floor(rng() * ROAD_V.length)];
      py = 200 + rng() * 2900;
    } else {
      px = 200 + rng() * 4400;
      py = ROAD_H[Math.floor(rng() * ROAD_H.length)];
    }
    if (x === undefined || dist(px, py, x, y) >= minDist) return { x: px, y: py };
  }
  return { x: 600, y: 600 };
}
