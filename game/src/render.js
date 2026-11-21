// Drawing only: the city, the cars, the people, Lena, the effects and the sun.
// The camera follows Lena smoothly; the world is drawn in world coordinates and
// the HUD lives in the DOM. Tire marks, smoke, muzzle flashes and screen shake
// make the chase feel like a chase.
//
// v3 render path — the static city is baked once, not repainted every frame.
// The ground, roads, blocks, park, plaza, pier and trees never move, so at
// init they are painted into 640 px offscreen tiles (8 x 6 over the 4800 x
// 3600 map). Each frame draws only the ~6 tiles the camera sees — a handful
// of drawImage calls instead of hundreds of pattern fills, zebra rects and
// kerb strokes in software rendering. Buildings stay dynamic (their 2.5D
// roofs shift with the camera), but their shaded wall colours are computed
// once per city instead of parsed out of a hex string for every building on
// every frame. Lighting still uses pre-rendered glow sprites, and the only
// per-frame allocation left in the hot path is the small side-marker list.

import { ROAD_H, ROAD_V, ROAD_HALF, WORLD_H, WORLD_W } from './city.js';
import { CAR_H, CAR_W } from './vehicles.js';
import { missionTarget, missionTargetFor } from './missions.js';
import { drawParticles as drawPoolParticles } from './particles.js';
import { sideMarkers } from './side.js';
import { skyTint, lampGlow, headlightsOn, isNight, fireflyPositions } from './daynight.js';
import { weaponMarkers } from './weapons.js';
import { minigameMarkers } from './minigames.js';
import { policeTacticMarkers } from './wanted.js';
import { dialogueActive } from './cutscenes.js';
import { playerWeaponId } from './player.js';

const VIEW_W = 1280;
const VIEW_H = 720;
/** 2.5D roof parallax: how far a roof shifts away from the camera centre. */
const ROOF_PARALLAX = 0.14;
/** Static-layer tile size in world pixels: 4800 x 3600 -> 8 x 6 tiles. */
const TILE = 640;
const TILE_COLS = Math.ceil(WORLD_W / TILE);
const TILE_ROWS = Math.ceil(WORLD_H / TILE);

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = { x: 0, y: 0, w: VIEW_W, h: VIEW_H, shake: 0, shakeX: 0, shakeY: 0 };
  const fonts = new Map();
  /** Frame cost, for the FPS readout: exponential average of draw() time. */
  const stats = { drawMs: 0, tilesDrawn: 0 };

  /** Procedural surface textures, painted once into offscreen canvases at
   * init (0 network): speckled asphalt, grainy beach sand, tiled sidewalk. */
  function makeTexture(size, base, speckles, speckleAlpha) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (const [color, count, rMax] of speckles) {
      g.fillStyle = color;
      for (let i = 0; i < count; i += 1) {
        g.globalAlpha = speckleAlpha * (0.5 + Math.random() * 0.5);
        const r = 1 + Math.random() * rMax;
        g.beginPath();
        g.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    return ctx.createPattern(c, 'repeat');
  }
  const asphaltTex = makeTexture(128, '#3c4048', [['#2c3038', 90, 2], ['#4c525c', 70, 2], ['#20242a', 40, 1.5]], 0.5);
  const sandTex = makeTexture(128, '#ecd9a0', [['#d8c088', 80, 2.5], ['#f7e8b8', 60, 2]], 0.55);
  const sidewalkTex = makeTexture(128, '#c8bfa8', [['#b0a888', 50, 2], ['#d8d0b8', 50, 2]], 0.5);

  /** Glow sprites, painted once at init: a radial gradient + arc fill per
   * light per frame costs ~35 gradient fills in software rendering (headless
   * Chromium measured 25 FPS in a chase). A pre-rendered sprite drawn with
   * drawImage under 'lighter' looks identical and is far cheaper. */
  function makeGlowSprite(radius, stops) {
    const c = document.createElement('canvas');
    c.width = radius * 2;
    c.height = radius * 2;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(radius, radius, radius * 0.06, radius, radius, radius);
    for (const [offset, color] of stops) grad.addColorStop(offset, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, radius * 2, radius * 2);
    return c;
  }
  const headlightSprite = makeGlowSprite(120, [[0, 'rgba(255,244,180,0.20)'], [1, 'rgba(255,244,180,0)']]);
  const sirenRedSprite = makeGlowSprite(110, [[0, 'rgba(255,48,48,0.30)'], [1, 'rgba(255,48,48,0)']]);
  const sirenBlueSprite = makeGlowSprite(110, [[0, 'rgba(48,112,255,0.30)'], [1, 'rgba(48,112,255,0)']]);
  const lampSprite = makeGlowSprite(90, [[0, 'rgba(255,200,110,0.22)'], [1, 'rgba(255,200,110,0)']]);

  /** The sunset + vignette overlay, painted once: the two full-screen
   * gradients were re-created every frame for an identical result. */
  const sunlightCanvas = (() => {
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, VIEW_W, VIEW_H);
    grad.addColorStop(0, 'rgba(255,170,90,0.13)');
    grad.addColorStop(0.55, 'rgba(255,210,130,0.05)');
    grad.addColorStop(1, 'rgba(90,60,160,0.10)');
    g.fillStyle = grad;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const v = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(20,10,50,0.22)');
    g.fillStyle = v;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    return c;
  })();

  function font(size, bold) {
    const key = `${bold ? 'b' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px system-ui, -apple-system, "Segoe UI", sans-serif`);
    return fonts.get(key);
  }

  /** Darken a #rrggbb colour by `factor` (0..1) for 2.5D wall faces. */
  function shade(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * factor);
    const g = Math.round(((n >> 8) & 255) * factor);
    const b = Math.round((n & 255) * factor);
    return `rgb(${r},${g},${b})`;
  }

  // ------------------------------------------------------------ static layer

  /** The baked city, rebuilt when a new city object arrives (a restart
   * builds a fresh city from the same seed). `tiles[ty][tx]` is one 640 px
   * canvas holding everything that never moves. */
  let staticTiles = null;
  let staticCity = null;

  /** Paint the ground half of one tile: grass, sand, sea, harbour, blocks,
   * park, plaza, fountain and pier. `g` is already translated so world
   * coordinates work; drawing is clipped to the tile by the caller. */
  function paintGroundTile(g, city, x0, y0, x1, y1) {
    g.fillStyle = '#7ab86a';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (y1 > city.beachY) {
      g.fillStyle = sandTex || '#ecd9a0';
      g.fillRect(x0, Math.max(y0, city.beachY), x1 - x0, Math.min(y1, city.waterY) - Math.max(y0, city.beachY));
    }
    if (y1 > city.waterY) {
      g.fillStyle = '#2f88c8';
      g.fillRect(x0, Math.max(y0, city.waterY), x1 - x0, y1 - Math.max(y0, city.waterY));
    }
    if (x1 > city.harborX) {
      g.fillStyle = '#2f88c8';
      g.fillRect(Math.max(x0, city.harborX), y0, x1 - Math.max(x0, city.harborX), y1 - y0);
    }
    // Blocks: pale sidewalks between the roads.
    g.fillStyle = sidewalkTex || '#c8bfa8';
    for (let i = 0; i < ROAD_V.length - 1; i += 1) {
      for (let j = 0; j < ROAD_H.length - 1; j += 1) {
        const x = ROAD_V[i] + ROAD_HALF;
        const y = ROAD_H[j] + ROAD_HALF;
        const w = ROAD_V[i + 1] - ROAD_V[i] - 2 * ROAD_HALF;
        const h = ROAD_H[j + 1] - ROAD_H[j] - 2 * ROAD_HALF;
        if (x > x1 || x + w < x0 || y > y1 || y + h < y0) continue;
        g.fillRect(x, y, w, h);
      }
    }
    // Park grass and plaza stone.
    g.fillStyle = '#58a858';
    g.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
    g.fillStyle = '#d8cbb0';
    g.fillRect(city.plaza.x, city.plaza.y, city.plaza.w, city.plaza.h);
    // Plaza fountain.
    const fx = city.plaza.x + city.plaza.w / 2;
    const fy = city.plaza.y + city.plaza.h / 2;
    g.fillStyle = '#7ab8d8';
    g.beginPath(); g.arc(fx, fy, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8e8e8';
    g.beginPath(); g.arc(fx, fy, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7ab8d8';
    g.beginPath(); g.arc(fx, fy, 14, 0, Math.PI * 2); g.fill();
    // The pier: wooden planks over the harbour water.
    const p = city.pier;
    g.fillStyle = '#8a6a42';
    g.fillRect(p.x, p.y, p.w, p.h);
    g.strokeStyle = '#6a4a2a';
    g.lineWidth = 2;
    for (let x = p.x + 20; x < p.x + p.w; x += 20) {
      g.beginPath(); g.moveTo(x, p.y); g.lineTo(x, p.y + p.h); g.stroke();
    }
    // Beach furniture: striped umbrellas and towels on the sand.
    for (const u of city.beachProps || []) {
      if (u.x < x0 - 40 || u.x > x1 + 40 || u.y < y0 - 40 || u.y > y1 + 40) continue;
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.beginPath(); g.ellipse(u.x + 4, u.y + 4, 20, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = u.color;
      g.beginPath(); g.arc(u.x, u.y, 18, Math.PI, 0); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(u.x, u.y); g.lineTo(u.x, u.y - 16); g.stroke();
      if (u.towel) {
        g.fillStyle = u.towel.color;
        g.fillRect(u.towel.x - 12, u.towel.y - 6, 24, 12);
      }
    }
  }

  /** Paint the road half of one tile: asphalt, zebra crossings, centre
   * dashes and kerb lines. */
  function paintRoadsTile(g, x0, y0, x1, y1) {
    g.fillStyle = asphaltTex || '#3c4048';
    for (const rx of ROAD_V) {
      if (rx + ROAD_HALF < x0 || rx - ROAD_HALF > x1) continue;
      g.fillRect(rx - ROAD_HALF, y0, ROAD_HALF * 2, y1 - y0);
    }
    for (const ry of ROAD_H) {
      if (ry + ROAD_HALF < y0 || ry - ROAD_HALF > y1) continue;
      g.fillRect(x0, ry - ROAD_HALF, x1 - x0, ROAD_HALF * 2);
    }
    // Zebra crossings at every intersection in the tile.
    g.fillStyle = 'rgba(240,240,230,0.85)';
    for (const rx of ROAD_V) {
      for (const ry of ROAD_H) {
        if (rx < x0 - 80 || rx > x1 + 80 || ry < y0 - 80 || ry > y1 + 80) continue;
        for (let i = -4; i <= 4; i += 1) g.fillRect(rx + i * 11 - 3, ry - ROAD_HALF + 6, 6, 16);
        for (let i = -4; i <= 4; i += 1) g.fillRect(rx - ROAD_HALF + 6, ry + i * 11 - 3, 16, 6);
      }
    }
    // Centre dashes.
    g.fillStyle = '#f2e8a0';
    for (const rx of ROAD_V) {
      if (rx < x0 || rx > x1) continue;
      for (let y = Math.floor(y0 / 60) * 60; y < y1; y += 60) {
        if (y > 3000) break;
        g.fillRect(rx - 2, y, 4, 28);
      }
    }
    for (const ry of ROAD_H) {
      if (ry < y0 || ry > y1) continue;
      for (let x = Math.floor(x0 / 60) * 60; x < x1; x += 60) {
        if (x > 4600) break;
        g.fillRect(x, ry - 2, 28, 4);
      }
    }
    // Kerb lines.
    g.strokeStyle = '#e8e8e8';
    g.lineWidth = 2;
    for (const rx of ROAD_V) {
      if (rx < x0 || rx > x1) continue;
      g.beginPath(); g.moveTo(rx - ROAD_HALF, y0); g.lineTo(rx - ROAD_HALF, y1); g.stroke();
      g.beginPath(); g.moveTo(rx + ROAD_HALF, y0); g.lineTo(rx + ROAD_HALF, y1); g.stroke();
    }
    for (const ry of ROAD_H) {
      if (ry < y0 || ry > y1) continue;
      g.beginPath(); g.moveTo(x0, ry - ROAD_HALF); g.lineTo(x1, ry - ROAD_HALF); g.stroke();
      g.beginPath(); g.moveTo(x0, ry + ROAD_HALF); g.lineTo(x1, ry + ROAD_HALF); g.stroke();
    }
  }

  /** Paint the trees of one tile (static, so they bake in with the ground). */
  function paintTreesTile(g, city, x0, y0, x1, y1) {
    for (const t of city.trees) {
      if (t.x < x0 - 30 || t.x > x1 + 30 || t.y < y0 - 30 || t.y > y1 + 30) continue;
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.beginPath(); g.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3f8a4a';
      g.beginPath(); g.arc(t.x, t.y, t.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#58b868';
      g.beginPath(); g.arc(t.x - 4, t.y - 4, t.r * 0.6, 0, Math.PI * 2); g.fill();
    }
  }

  /** Build the whole static layer for `city`, and pre-compute each
   * building's shaded wall colours and roof-shift constant once. */
  function buildStaticLayer(city) {
    const tiles = [];
    for (let ty = 0; ty < TILE_ROWS; ty += 1) {
      const row = [];
      for (let tx = 0; tx < TILE_COLS; tx += 1) {
        const c = document.createElement('canvas');
        c.width = TILE;
        c.height = TILE;
        const g = c.getContext('2d');
        const x0 = tx * TILE;
        const y0 = ty * TILE;
        g.translate(-x0, -y0);
        paintGroundTile(g, city, x0, y0, x0 + TILE, y0 + TILE);
        paintRoadsTile(g, x0, y0, x0 + TILE, y0 + TILE);
        paintTreesTile(g, city, x0, y0, x0 + TILE, y0 + TILE);
        row.push(c);
      }
      tiles.push(row);
    }
    for (const b of city.buildings) {
      b._wallDark = shade(b.wall, 0.55);
      b._wallDarker = shade(b.wall, 0.72);
      b._shift = Math.min(46, b.hgt * 0.55);
    }
    staticTiles = tiles;
    staticCity = city;
  }

  /** Draw the visible static tiles: ~6 drawImage calls replace the whole
   * ground + roads + trees pass that used to run every frame. */
  function drawStaticLayer() {
    const x0 = Math.max(0, Math.floor(camera.x / TILE));
    const x1 = Math.min(TILE_COLS - 1, Math.floor((camera.x + VIEW_W) / TILE));
    const y0 = Math.max(0, Math.floor(camera.y / TILE));
    const y1 = Math.min(TILE_ROWS - 1, Math.floor((camera.y + VIEW_H) / TILE));
    let n = 0;
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        ctx.drawImage(staticTiles[ty][tx], tx * TILE, ty * TILE);
        n += 1;
      }
    }
    stats.tilesDrawn = n;
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }

  /** Follow Lena; the shake decays and jitters the view while it lasts. */
  function updateCamera(focusX, focusY, dt) {
    const tx = focusX - VIEW_W / 2;
    const ty = focusY - VIEW_H / 2;
    camera.x += (tx - camera.x) * Math.min(1, dt * 5);
    camera.y += (ty - camera.y) * Math.min(1, dt * 5);
    camera.x = Math.max(-80, Math.min(WORLD_W - VIEW_W + 80, camera.x));
    camera.y = Math.max(-80, Math.min(WORLD_H - VIEW_H + 80, camera.y));
    if (camera.shake > 0) {
      camera.shake -= dt * 2.2;
      camera.shakeX = (Math.random() * 2 - 1) * camera.shake * 14;
      camera.shakeY = (Math.random() * 2 - 1) * camera.shake * 14;
    } else {
      camera.shakeX = 0;
      camera.shakeY = 0;
    }
  }

  function addShake(amount) {
    camera.shake = Math.min(1, camera.shake + amount);
  }

  /** The one animated piece of the ground: surf lines rolling on the sand.
   * Everything else under them is baked into the tiles. */
  function drawSurf(city) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      const wy = city.waterY + 8 + i * 14 + Math.sin(performance.now() / 900 + i * 2) * 3;
      if (wy < camera.y - 10 || wy > camera.y + VIEW_H + 10) continue;
      ctx.beginPath();
      ctx.moveTo(camera.x - 90, wy);
      ctx.lineTo(camera.x + VIEW_W + 90, wy);
      ctx.stroke();
    }
  }

  function drawBuildings(city) {
    // Frustum culling: only buildings within the screen + a 300 px margin.
    const camCX = camera.x + VIEW_W / 2;
    const camCY = camera.y + VIEW_H / 2;
    const labelFont = font(15, true);
    const helipadFont = font(11, true);
    for (const b of city.buildings) {
      if (b.x > camera.x + VIEW_W + 300 || b.x + b.w < camera.x - 300 || b.y > camera.y + VIEW_H + 300 || b.y + b.h < camera.y - 300) continue;
      // 2.5D extruded roof: the roof shifts away from the camera centre by a
      // parallax factor, and dark wall faces connect base to roof — the
      // classic GTA 2 perspective, with the 2D physics untouched underneath.
      // Wall shades and the height shift were pre-computed at init, so this
      // loop does no string parsing or colour math per frame.
      const bcx = b.x + b.w / 2;
      const bcy = b.y + b.h / 2;
      const roofOX = (bcx - camCX) * ROOF_PARALLAX + b._shift * 0.28;
      const roofOY = (bcy - camCY) * ROOF_PARALLAX + b._shift * 0.28;
      const rx = b.x + roofOX;
      const ry = b.y + roofOY;
      // Drop shadow: the low sun throws it south-east of the base.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
      // South wall face (base bottom edge -> roof bottom edge), darkest.
      ctx.fillStyle = b._wallDark;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.lineTo(rx + b.w, ry + b.h);
      ctx.lineTo(rx, ry + b.h);
      ctx.closePath();
      ctx.fill();
      // East wall face (base right edge -> roof right edge).
      ctx.fillStyle = b._wallDarker;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w, b.y);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.lineTo(rx + b.w, ry + b.h);
      ctx.lineTo(rx + b.w, ry);
      ctx.closePath();
      ctx.fill();
      // Walls, then the extruded roof on top with procedural detail.
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(rx + 4, ry + 4, b.w - 8, b.h - 8);
      // Roof detail: AC vents, a skylight, and a helipad on tall buildings.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(rx + b.w * 0.2, ry + b.h * 0.25, b.w * 0.18, b.h * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(rx + b.w * 0.6, ry + b.h * 0.55, b.w * 0.15, b.h * 0.18);
      if (b.hgt >= 54) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx + b.w * 0.68, ry + b.h * 0.3, Math.min(b.w, b.h) * 0.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = helipadFont;
        ctx.textAlign = 'center';
        ctx.fillText('H', rx + b.w * 0.68, ry + b.h * 0.3 + 4);
      }
      // Neon strip along the roof edge of shops and the garage at dusk.
      if (b.kind === 'store' || b.kind === 'garage') {
        ctx.fillStyle = b.kind === 'store' ? 'rgba(255,80,110,0.9)' : 'rgba(80,220,255,0.9)';
        ctx.fillRect(rx + 4, ry + 4, b.w - 8, 4);
      }
      // Lit windows on taller buildings: warm squares on the wall face,
      // placed by a hash of the building's position so they never flicker.
      if (b.hgt >= 30) {
        const seed = (Math.round(b.x) * 31 + Math.round(b.y) * 17) % 100;
        ctx.fillStyle = 'rgba(255,210,110,0.8)';
        const rows = 1 + (seed % 2);
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < 2; c += 1) {
            if ((seed + r * 3 + c * 7) % 3 === 0) continue;
            ctx.fillRect(b.x + 10 + c * (b.w / 2.4), b.y + 12 + r * (b.h / 2.6), 7, 9);
          }
        }
      }
      if (b.label) {
        ctx.font = labelFont;
        ctx.fillStyle = '#20242c';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, rx + b.w / 2, ry + b.h / 2 + 5);
      }
    }
  }

  /** Boats anchored in the harbour: hull, cabin and mast, bobbing gently
   * on the swell. Drawn live (they move), after the static tiles. */
  function drawBoats(city) {
    const t = performance.now() / 700;
    for (const b of city.boats || []) {
      if (b.x < camera.x - 60 || b.x > camera.x + VIEW_W + 60 || b.y < camera.y - 60 || b.y > camera.y + VIEW_H + 60) continue;
      const bob = Math.sin(t + b.x * 0.01) * 3;
      const s = b.size || 1;
      ctx.save();
      ctx.translate(b.x, b.y + bob);
      ctx.rotate(b.angle + Math.sin(t * 0.6 + b.y * 0.01) * 0.05);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(2, 4, 26 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(-24 * s, 0);
      ctx.lineTo(24 * s, 0);
      ctx.lineTo(16 * s, 10 * s);
      ctx.lineTo(-16 * s, 10 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a3542';
      ctx.fillRect(-8 * s, -10 * s, 16 * s, 10 * s);
      ctx.strokeStyle = '#5a4632';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -10 * s); ctx.lineTo(0, -26 * s); ctx.stroke();
      ctx.restore();
    }
  }

  function drawTireMarks(marks) {
    ctx.strokeStyle = 'rgba(20,20,20,0.35)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const m of marks) {
      ctx.globalAlpha = m.life;
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCar(car, isPlayerCar) {
    if (car.dead && car.fade <= 0) return;
    const w = car.w || CAR_W;
    const h = car.h || CAR_H;
    // Drop shadow under the car, offset with the low sun.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(car.x + 4, car.y + 6, w * 0.55, h * 0.62, car.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (car.dead) ctx.globalAlpha = Math.max(0, car.fade);
    if (isPlayerCar) {
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 3;
      ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    }
    // Body with a darker outline.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
    ctx.fillStyle = car.color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // Windshield and rear window.
    ctx.fillStyle = '#1c2a38';
    ctx.fillRect(w / 2 - 14, -h / 2 + 3, 8, h - 6);
    ctx.fillRect(-w / 2 + 4, -h / 2 + 3, 6, h - 6);
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(w / 2 - 2, -h / 2 + 2, 3, 5);
    ctx.fillRect(w / 2 - 2, h / 2 - 7, 3, 5);
    if (car.kind === 'police') {
      // Black-and-white cruiser with a light bar.
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(-6, -h / 2, 12, h);
      const flash = Math.floor(performance.now() / 220) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3030' : '#3070ff';
      ctx.fillRect(-4, -h / 2 - 2, 8, 6);
      ctx.fillStyle = flash ? '#3070ff' : '#ff3030';
      ctx.fillRect(-4, h / 2 - 4, 8, 6);
      ctx.fillStyle = '#20242c';
      ctx.font = font(9, true);
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
    }
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#20242c';
      ctx.font = font(9, true);
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    if (car.kind === 'ambulance') {
      // White ambulance with a red cross on the roof.
      ctx.fillStyle = '#c03030';
      ctx.fillRect(-3, -8, 6, 16);
      ctx.fillRect(-8, -3, 16, 6);
    }
    if (car.kind === 'van') {
      ctx.fillStyle = '#e8e8e8';
      ctx.font = font(8, true);
      ctx.textAlign = 'center';
      ctx.fillText('VAN', 0, 3);
    }
    if (car.kind === 'motorcycle') {
      // Two wheels and a rider: a slim bike reads differently from a car.
      ctx.fillStyle = '#222222';
      ctx.beginPath(); ctx.arc(w / 2 - 4, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-w / 2 + 4, 0, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (car.kind === 'truck') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-w / 2 + 6, -h / 2 + 3, w - 20, h - 6);
    }
    if (car.kind === 'limo') {
      ctx.fillStyle = '#1c2a38';
      ctx.fillRect(-w / 2 + 12, -h / 2 + 3, 10, h - 6);
      ctx.fillRect(2, -h / 2 + 3, 10, h - 6);
    }
    if (car.fleeCar) {
      ctx.fillStyle = '#ffd23c';
      ctx.font = font(8, true);
      ctx.textAlign = 'center';
      ctx.fillText('MARCO', 0, -h / 2 - 6);
    }
    if (car.kind === 'target') {
      ctx.fillStyle = '#20242c';
      ctx.font = font(8, true);
      ctx.textAlign = 'center';
      ctx.fillText('★', 0, 3);
    }
    // Damage states: white smoke under 60% HP, thick black smoke and flames
    // under 30% — the car tells you it is dying before it blows.
    if (!car.dead && car.health < 60) {
      const heavy = car.health < 30;
      ctx.fillStyle = heavy ? `rgba(40,40,40,${0.55 + Math.random() * 0.2})` : `rgba(200,200,200,${0.45 + Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(-w / 2 - 6, (Math.random() - 0.5) * 8, heavy ? 9 + Math.random() * 6 : 7 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
      if (heavy) {
        ctx.fillStyle = `rgba(255,${120 + Math.floor(Math.random() * 80)},30,0.85)`;
        ctx.beginPath();
        ctx.arc(-w / 2 + 4, (Math.random() - 0.5) * 10, 4 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (car.smoke > 0.15 && car.health >= 60) {
      ctx.fillStyle = `rgba(120,120,120,${Math.min(0.6, car.smoke)})`;
      ctx.beginPath();
      ctx.arc(-w / 2 - 6, 0, 8 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(ped) {
    if (ped.down > 0) {
      // Lying flat after a hit.
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 16, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(ped.x + Math.cos(ped.angle) * 18, ped.y + Math.sin(ped.angle) * 18, 6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const bob = Math.sin(ped.walkPhase) * (ped.stride || 1.5);
    // Soft drop shadow under each walker, stretched by their stride.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(ped.x + 2, ped.y + 8, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.4, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4 - 4 + bob * 0.4, 6, 0, Math.PI * 2); ctx.fill();
    if (ped.waiting && !ped.racer && !ped.paramedic && !ped.lawyer && !ped.patient) {
      // A fare waiting for a taxi waves one arm and carries a gold TAXI tag,
      // so the player spots them from across the street.
      const wave = Math.sin(performance.now() / 240) * 6;
      ctx.strokeStyle = ped.skin;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ped.x, ped.y - 4);
      ctx.lineTo(ped.x + 12, ped.y - 20 + wave);
      ctx.stroke();
      ctx.font = font(11, true);
      ctx.fillStyle = '#ffd23c';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.strokeText('TAXI', ped.x, ped.y - 28);
      ctx.fillText('TAXI', ped.x, ped.y - 28);
    }
    if (ped.gang) {
      // Dark cap on a dark jacket: the docks crowd watches, never runs.
      ctx.fillStyle = '#1a1a22';
      ctx.beginPath(); ctx.arc(ped.x, ped.y - 8, 7, Math.PI, 0); ctx.fill();
    }
    if (ped.racer) {
      // A checkered flag, waved at the start line.
      const wave = Math.sin(performance.now() / 200) * 4;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ped.x + 8, ped.y - 26 + wave, 12, 8);
      ctx.fillStyle = '#111111';
      ctx.fillRect(ped.x + 8, ped.y - 22 + wave, 6, 4);
      ctx.fillRect(ped.x + 14, ped.y - 26 + wave, 6, 4);
    }
    if (ped.paramedic || ped.lawyer || ped.patient) {
      ctx.font = font(10, true);
      ctx.fillStyle = ped.patient ? '#ff9ac0' : ped.lawyer ? '#c8a0e8' : '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      const tag = ped.patient ? 'HELP' : ped.lawyer ? 'ADA' : 'MED';
      ctx.strokeText(tag, ped.x, ped.y - 26);
      ctx.fillText(tag, ped.x, ped.y - 26);
    }
  }

  function drawPlayer(player, game) {
    if (!player.onFoot) return;
    const blink = player.hurtTimer > 0 && Math.floor(player.hurtTimer * 12) % 2 === 0;
    if (blink) return;
    const bob = player.moving ? Math.sin(performance.now() / 90) * 2 : 0;
    // A soft ring marks Lena on foot, so she reads at a glance among the crowd.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(player.x, player.y, 17, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(player.x, player.y + 9, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    // Lena: red jacket, dark jeans, hair.
    ctx.fillStyle = '#c03030';
    ctx.beginPath(); ctx.arc(player.x, player.y + bob * 0.3, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath(); ctx.arc(player.x + Math.cos(player.angle) * 4, player.y + Math.sin(player.angle) * 4 - 3, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.arc(player.x - Math.cos(player.angle) * 2, player.y - Math.sin(player.angle) * 2 - 5, 6, 0, Math.PI * 2); ctx.fill();
    // The gun in hand: pistol, shotgun, SMG or rifle — each a different length.
    if (game.mouseDown || player.muzzle > 0) {
      const gunId = playerWeaponId(player);
      const gunLen = gunId === 'rifle' ? 30 : gunId === 'shotgun' ? 26 : gunId === 'smg' ? 18 : 22;
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(player.x + Math.cos(player.angle) * 10, player.y + Math.sin(player.angle) * 10);
      ctx.lineTo(player.x + Math.cos(player.angle) * gunLen, player.y + Math.sin(player.angle) * gunLen);
      ctx.stroke();
    }
    if (player.muzzle > 0) {
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      ctx.arc(player.x + Math.cos(player.angle) * 28, player.y + Math.sin(player.angle) * 28, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (player.punchTimer > 0.2) {
      ctx.strokeStyle = '#f2c9a0';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(player.x + Math.cos(player.angle) * 12, player.y + Math.sin(player.angle) * 12);
      ctx.lineTo(player.x + Math.cos(player.angle) * 30, player.y + Math.sin(player.angle) * 30);
      ctx.stroke();
    }
  }

  function drawBullets(bullets) {
    // Bullet tracers: a bright line from where the shot has been to where it is.
    // Each gun's tracer has its own colour (pistol gold, SMG blue, rifle red).
    ctx.lineWidth = 2;
    for (const b of bullets) {
      ctx.strokeStyle = b.color ? b.color : '#ffe27a';
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const b of bullets) {
      ctx.fillStyle = b.color ? b.color : '#ffe27a';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Floating combat/economy popups (+$150, WANTED, MISSION COMPLETE). */
  function drawFloatTexts(floatTexts) {
    if (!floatTexts) return;
    ctx.textAlign = 'center';
    for (const f of floatTexts) {
      const a = Math.max(0, f.life / f.maxLife);
      ctx.globalAlpha = a;
      ctx.font = font(f.size || 18, true);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  /** Side-work markers: hidden packages, taxi fares and stunt ramps, drawn
   * from the side state so the player can find the extra jobs at a glance. */
  function drawSideMarkers(game) {
    if (!game.side) return;
    const markers = sideMarkers(game.side);
    const pulse = 1 + Math.sin(performance.now() / 300) * 0.15;
    ctx.textAlign = 'center';
    for (const m of markers) {
      if (m.x < camera.x - 40 || m.x > camera.x + VIEW_W + 40 || m.y < camera.y - 40 || m.y > camera.y + VIEW_H + 40) continue;
      if (m.kind === 'package') {
        // A small gold stash, glinting.
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#ffd23c';
        ctx.fillRect(-8 * pulse, -8 * pulse, 16 * pulse, 16 * pulse);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-8 * pulse, -8 * pulse, 16 * pulse, 16 * pulse);
        ctx.restore();
        ctx.fillStyle = '#fff3c0';
        ctx.font = font(13, true);
        ctx.fillText('$', m.x, m.y + 4);
      } else if (m.kind === 'taxi-wait') {
        ctx.fillStyle = 'rgba(80,220,120,0.25)';
        ctx.beginPath(); ctx.arc(m.x, m.y, 26 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#50dc78';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(m.x, m.y, 26 * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#50dc78';
        ctx.font = font(13, true);
        ctx.fillText('TAXI', m.x, m.y + 4);
      } else if (m.kind === 'taxi-drop') {
        ctx.strokeStyle = '#50dc78';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(m.x, m.y + 14); ctx.lineTo(m.x, m.y - 22); ctx.stroke();
        ctx.fillStyle = '#50dc78';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y - 22);
        ctx.lineTo(m.x + 20, m.y - 16);
        ctx.lineTo(m.x, m.y - 10);
        ctx.closePath();
        ctx.fill();
      } else if (m.kind === 'jump') {
        // Orange chevrons on the ramp: speed through here pays.
        ctx.strokeStyle = 'rgba(255,140,40,0.9)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (let i = 0; i < 2; i += 1) {
          const oy = -8 + i * 12;
          ctx.beginPath();
          ctx.moveTo(m.x - 12, m.y + oy - 6);
          ctx.lineTo(m.x, m.y + oy + 6);
          ctx.lineTo(m.x + 12, m.y + oy - 6);
          ctx.stroke();
        }
      }
    }
  }

  /** Weapon pickups: orange gun markers on the ground, pulsing so Lena spots them. */
  function drawWeaponPickups(game) {
    if (!game.player || !game.player.weapons) return;
    const pulse = 1 + Math.sin(performance.now() / 300) * 0.15;
    ctx.textAlign = 'center';
    for (const m of weaponMarkers(game.player)) {
      if (m.x < camera.x - 40 || m.x > camera.x + VIEW_W + 40 || m.y < camera.y - 40 || m.y > camera.y + VIEW_H + 40) continue;
      ctx.fillStyle = 'rgba(255,140,40,0.25)';
      ctx.beginPath(); ctx.arc(m.x, m.y, 24 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff8c28';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(m.x, m.y, 24 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff8c28';
      ctx.font = font(11, true);
      ctx.fillText(m.weapon.toUpperCase(), m.x, m.y + 4);
    }
  }

  /** Minigame markers: the race line and checkpoints, the criminal car, the
   * patient, the ambulance. */
  function drawMinigameMarkers(game) {
    if (!game.minigames) return;
    ctx.textAlign = 'center';
    for (const m of minigameMarkers(game.minigames)) {
      if (m.x < camera.x - 40 || m.x > camera.x + VIEW_W + 40 || m.y < camera.y - 40 || m.y > camera.y + VIEW_H + 40) continue;
      if (m.kind === 'race-start') {
        // The checkered start line across the avenue.
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#111111';
          ctx.fillRect(m.x + i * 12, m.y - 30, 12, 12);
          ctx.fillStyle = (i % 2 === 0) ? '#111111' : '#ffffff';
          ctx.fillRect(m.x + i * 12, m.y - 18, 12, 12);
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = font(13, true);
        ctx.fillText('RACE — E · $50', m.x, m.y - 40);
      } else if (m.kind === 'race-cp') {
        ctx.strokeStyle = '#ffd23c';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(m.x, m.y, 22, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffd23c';
        ctx.font = font(15, true);
        ctx.fillText(`${m.cp}`, m.x, m.y + 5);
      } else if (m.kind === 'criminal') {
        ctx.strokeStyle = '#ff4040';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(m.x, m.y, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff4040';
        ctx.font = font(12, true);
        ctx.fillText('WANTED', m.x, m.y - 40);
      } else if (m.kind === 'patient') {
        ctx.fillStyle = '#ff9ac0';
        ctx.font = font(20, true);
        ctx.fillText('+', m.x, m.y + 7);
        ctx.font = font(11, true);
        ctx.fillText('PATIENT', m.x, m.y - 22);
      } else if (m.kind === 'ambulance') {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m.x, m.y, 30, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  /** Mission 7-9 markers: the getaway van, Marco's sedan, the final walk-up point. */
  function drawMissions2Markers(game) {
    if (!game.missions2) return;
    ctx.textAlign = 'center';
    const m2 = game.missions2;
    if (m2.van && !m2.van.dead) {
      ctx.strokeStyle = '#50dc78';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(m2.van.x, m2.van.y, 36, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#50dc78';
      ctx.font = font(12, true);
      ctx.fillText('GETAWAY VAN', m2.van.x, m2.van.y - 42);
    }
    if (m2.fleeCar && !m2.fleeCar.dead) {
      ctx.strokeStyle = '#3070ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(m2.fleeCar.x, m2.fleeCar.y, 36, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#8ab0ff';
      ctx.font = font(12, true);
      ctx.fillText("MARCO'S SEDAN", m2.fleeCar.x, m2.fleeCar.y - 42);
    }
    if (m2.finalPoint) {
      const pulse = 1 + Math.sin(performance.now() / 300) * 0.15;
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(m2.finalPoint.x, m2.finalPoint.y, 26 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd23c';
      ctx.font = font(13, true);
      ctx.fillText('END IT — E', m2.finalPoint.x, m2.finalPoint.y - 32);
    }
  }

  /** Spike strips: dark toothed strips across the lane. */
  function drawSpikeStrips(game) {
    if (!game.tactics) return;
    for (const m of policeTacticMarkers(game.tactics)) {
      if (m.x < camera.x - 40 || m.x > camera.x + VIEW_W + 40 || m.y < camera.y - 40 || m.y > camera.y + VIEW_H + 40) continue;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-30, -8, 60, 16);
      ctx.fillStyle = '#c8c8c8';
      for (let i = -24; i <= 24; i += 12) {
        ctx.beginPath();
        ctx.moveTo(i, -8);
        ctx.lineTo(i + 6, 0);
        ctx.lineTo(i, 8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Night fireflies over the park: small amber glows that drift and pulse. */
  function drawFireflies(game) {
    if (!game.clock || !isNight(game.clock)) return;
    const spots = fireflyPositions(game.clock, game.frameNo * 30, game.city.park);
    for (const f of spots) {
      if (f.x < camera.x - 20 || f.x > camera.x + VIEW_W + 20 || f.y < camera.y - 20 || f.y > camera.y + VIEW_H + 20) continue;
      ctx.globalAlpha = f.glow;
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The day-night sky tint: one full-screen fill over the world, in screen
   * space after the world pass. Cheap, and it unifies the frame's mood. */
  function drawSkyTint(game) {
    if (!game.clock) return;
    const tint = skyTint(game.clock);
    if (tint.alpha <= 0.01) return;
    ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${tint.alpha})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /** Cinematic letterbox bars while a dialogue is open: the story gets a frame. */
  function drawLetterbox(game) {
    if (!game.dialogue || !dialogueActive(game.dialogue)) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, VIEW_W, 64);
    ctx.fillRect(0, VIEW_H - 64, VIEW_W, 64);
  }

  function drawMarkers(game) {
    const target = missionTargetFor(game.missions, game);
    if (target) {
      // A gold beacon pillar at the marker.
      const pulse = 1 + Math.sin(performance.now() / 300) * 0.15;
      ctx.fillStyle = 'rgba(255,210,60,0.25)';
      ctx.fillRect(target.x - 26 * pulse, target.y - 90, 52 * pulse, 90);
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd23c';
      ctx.font = font(20, true);
      ctx.textAlign = 'center';
      ctx.fillText('◆', target.x, target.y + 7);
    }
    // The garage hideout glows green when Lena is wanted.
    if (game.wanted.level > 0) {
      const h = game.city.hideout;
      ctx.strokeStyle = 'rgba(80,220,120,0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#50dc78';
      ctx.font = font(14, true);
      ctx.textAlign = 'center';
      ctx.fillText('HIDEOUT', h.x, h.y - h.r - 8);
    }
  }

  /**
   * The GPS waypoint arrow: a gold arrow on a ~75 px ring around Lena (or her
   * car), always pointing at the active objective, with the distance in
   * metres under it — readable in the first second of play.
   */
  function drawWaypointArrow(game) {
    const target = missionTargetFor(game.missions, game);
    if (!target) return;
    const px = game.player.car ? game.player.car.x : game.player.x;
    const py = game.player.car ? game.player.car.y : game.player.y;
    const dx = target.x - px;
    const dy = target.y - py;
    const d = Math.hypot(dx, dy);
    if (d < 60) return; // the beacon on the ground is enough up close
    const angle = Math.atan2(dy, dx);
    // Screen position of Lena, then a 75 px ring around her.
    const sx = px - camera.x;
    const sy = py - camera.y;
    const cx = sx + Math.cos(angle) * 75;
    const cy = sy + Math.sin(angle) * 75;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd23c';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-9, -11);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-9, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.font = font(14, true);
    ctx.fillStyle = '#ffd23c';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.strokeText(`${Math.round(d)}m`, cx, cy + 30);
    ctx.fillText(`${Math.round(d)}m`, cx, cy + 30);
  }

  /**
   * Dynamic lighting pass (world space, additive): headlight cones in front
   * of nearby cars, red-blue siren pools under police cars, and warm
   * streetlamp glows — the neon-night half of the sunset-to-neon look.
   * The car lists are walked in place (no concat allocation per frame) and
   * every light is one pre-rendered sprite drawImage under 'lighter'.
   * Headlights are capped on purpose: a parked car has its lights off, and
   * only traffic within ~700 px of Lena gets a cone — sixty additive
   * 240 px sprites a frame was the single biggest raster cost in software
   * rendering, and a cone two screens away is invisible anyway.
   */
  function drawLighting(game) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const onScreen = (x, y, r) => x > camera.x - r && x < camera.x + VIEW_W + r && y > camera.y - r && y < camera.y + VIEW_H + r;
    const px = game.player.car ? game.player.car.x : game.player.x;
    const py = game.player.car ? game.player.car.y : game.player.y;
    const night = game.clock ? headlightsOn(game.clock) : false;
    const headlight = (car, always) => {
      if (car.dead || !onScreen(car.x, car.y, 320)) return;
      if (!always && car.kind === 'parked') return; // parked: lights off
      if (!always && car.kind !== 'police' && (car.x - px) * (car.x - px) + (car.y - py) * (car.y - py) > 700 * 700) return;
      const hx = car.x + Math.cos(car.angle) * 130;
      const hy = car.y + Math.sin(car.angle) * 130;
      // At night the cones burn full; in daylight they are dimmer.
      ctx.globalAlpha = night ? 1 : 0.55;
      ctx.drawImage(headlightSprite, hx - 120, hy - 120);
      ctx.globalAlpha = 1;
    };
    for (const car of game.cars) headlight(car, false);
    for (const cop of game.police) headlight(cop, true);
    if (game.player.car) headlight(game.player.car, true);
    // Police siren pools flashing red-blue on the asphalt.
    const flash = Math.floor(performance.now() / 220) % 2 === 0;
    for (const cop of game.police) {
      if (cop.dead || !onScreen(cop.x, cop.y, 260)) continue;
      ctx.drawImage(flash ? sirenRedSprite : sirenBlueSprite, cop.x - 110, cop.y - 110);
    }
    // Streetlamps: warm pools along the avenues and the beachfront. Their
    // glow follows the clock — full at night, gone at noon.
    const glow = game.clock ? lampGlow(game.clock) : 1;
    for (const lamp of game.city.streetlamps) {
      if (!onScreen(lamp.x, lamp.y, 200)) continue;
      if (glow > 0.02) {
        ctx.globalAlpha = glow;
        ctx.drawImage(lampSprite, lamp.x - 90, lamp.y - 90);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#ffd88a';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSunlight() {
    // Golden sunset melting into neon night, pre-rendered once at init.
    ctx.drawImage(sunlightCanvas, 0, 0);
  }

  /** Paint one frame of the live game. */
  function draw(game) {
    const t0 = performance.now();
    if (game.city !== staticCity) buildStaticLayer(game.city);
    const focusX = game.player.car ? game.player.car.x : game.player.x;
    const focusY = game.player.car ? game.player.car.y : game.player.y;
    updateCamera(focusX, focusY, 1 / 60);
    game.camera = camera;
    const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    const ox = (canvas.width - VIEW_W * scale) / 2;
    const oy = (canvas.height - VIEW_H * scale) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox + camera.shakeX * scale, oy + camera.shakeY * scale);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawStaticLayer();
    drawSurf(game.city);
    drawBoats(game.city);
    drawBuildings(game.city);
    drawTireMarks(game.tireMarks);
    drawMarkers(game);
    drawSideMarkers(game);
    drawWeaponPickups(game);
    drawMinigameMarkers(game);
    drawMissions2Markers(game);
    drawSpikeStrips(game);
    // Draw order: parked and traffic, then police, then Lena's car, then people, then Lena.
    for (const car of game.cars) drawCar(car, false);
    for (const cop of game.police) drawCar(cop, false);
    if (game.player.car) drawCar(game.player.car, true);
    for (const ped of game.peds) drawPed(ped);
    drawPlayer(game.player, game);
    drawBullets(game.bullets);
    drawPoolParticles(ctx, game.particles);
    drawFloatTexts(game.floatTexts);
    drawLighting(game);
    drawFireflies(game);
    ctx.restore();
    drawWaypointArrow(game);
    drawSunlight();
    drawSkyTint(game);
    drawLetterbox(game);
    const dt = performance.now() - t0;
    stats.drawMs = stats.drawMs * 0.9 + dt * 0.1;
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, camera, addShake, VIEW_W, VIEW_H, stats };
}
