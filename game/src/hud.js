// The HUD: money, debt, wanted stars, health, speed, the mission objective and
// its timer, plus the minimap — a small live canvas of the whole city with Lena,
// her car, the police, traffic and the mission marker on it.

import { WORLD_H, WORLD_W, districtAt } from './city.js';
import { missionTarget, missionTargetFor, missionSummary, debtProgress } from './missions.js';
import { hideoutProgress, heatLevelName } from './wanted.js';
import { sideStatusText, sideMarkers } from './side.js';

/** Write text only when it changed: updateHud runs every frame, and a
 * redundant textContent write is work the browser does not need to redo. */
function setText(el, value) {
  if (el._last !== value) {
    el._last = value;
    el.textContent = value;
  }
}

/** The HUD's DOM nodes, looked up once. */
export function createHud() {
  const el = (id) => document.getElementById(id);
  const minimap = el('minimap');
  return {
    money: el('hud-money'),
    debt: el('hud-debt'),
    debtFill: el('hud-debt-fill'),
    stars: el('hud-stars'),
    healthFill: el('hud-health-fill'),
    healthText: el('hud-health-text'),
    speed: el('hud-speed'),
    objective: el('hud-objective'),
    timer: el('hud-timer'),
    ammo: el('hud-ammo'),
    banner: el('hud-banner'),
    radio: el('hud-radio'),
    side: el('hud-side'),
    district: el('hud-district'),
    fps: el('hud-fps'),
    minimap,
    mapCtx: minimap ? minimap.getContext('2d') : null,
  };
}

function starRow(level) {
  let out = '';
  for (let i = 0; i < 5; i += 1) out += i < level ? '★' : '☆';
  return out;
}

/** Refresh the text HUD. Called every frame; cheap string writes only. */
export function updateHud(hud, game) {
  const player = game.player;
  setText(hud.money, `$${game.money}`);
  const debt = debtProgress(game.missions);
  setText(hud.debt, game.missions.done ? 'DEBT PAID ✓' : `DEBT $${debt.left} TO MARCO VENN · ${debt.pct}%`);
  if (hud.debtFill) hud.debtFill.style.width = `${game.missions.done ? 100 : debt.pct}%`;
  setText(hud.stars, starRow(game.wanted.level));
  hud.stars.className = game.wanted.level > 0 ? 'stars hot' : 'stars';
  hud.stars.title = heatLevelName(game.wanted.level);
  const hp = Math.max(0, Math.round(player.health));
  hud.healthFill.style.width = `${hp}%`;
  hud.healthFill.className = hp > 50 ? 'fill good' : hp > 25 ? 'fill warn' : 'fill bad';
  setText(hud.healthText, `${hp}`);
  const speedKmh = player.car ? Math.round(Math.abs(player.car.speed) * 0.24) : 0;
  setText(hud.speed, player.car ? `${speedKmh} km/h` : '');
  const summary = missionSummary(game.missions);
  if (game.missions.done) {
    setText(hud.objective, 'Debt paid. Costa Sol is yours — free roam!');
  } else if (summary) {
    // GPS distance to the objective, live in the panel: the player reads the
    // direction from the arrow and the metres from here, in one glance.
    const target = missionTargetFor(game.missions, game);
    let distText = '';
    if (target) {
      const px = player.car ? player.car.x : player.x;
      const py = player.car ? player.car.y : player.y;
      const d = Math.round(Math.hypot(target.x - px, target.y - py));
      distText = ` · ${d}m`;
    }
    const hide = summary.type === 'escape' && game.wanted.level > 0 && hideoutProgress(game.wanted) > 0
      ? ` · hiding ${Math.round(hideoutProgress(game.wanted) * 100)}%` : '';
    setText(hud.objective, `${summary.title} — ${summary.text}${distText}${hide}`);
  } else {
    setText(hud.objective, '');
  }
  setText(hud.timer, game.missions.timer > 0 ? `⏱ ${Math.ceil(game.missions.timer)}s` : '');
  setText(hud.ammo, player.onFoot ? `🔫 ${player.ammo}` : '');
  if (game.missions.banner > 0 && game.missions.justCompleted) {
    hud.banner.textContent = `✓ ${game.missions.justCompleted.title} complete — +$${game.missions.justCompleted.reward}`;
    hud.banner.classList.add('show');
  } else {
    hud.banner.classList.remove('show');
  }
  // Radio banner: station name for 2.5 s after entering a car or switching.
  if (hud.radio) {
    if (game.radioBanner > 0 && game.radioName) {
      hud.radio.textContent = game.radioBlurb ? `♪ ${game.radioName} — ${game.radioBlurb}` : `♪ ${game.radioName}`;
      hud.radio.classList.add('show');
    } else {
      hud.radio.classList.remove('show');
    }
  }
  // Side-work line: packages found, taxi fares, jumps — and the live FPS,
  // so the frame rate is always visible, not a number in a log.
  if (hud.side && game.side) setText(hud.side, sideStatusText(game.side));
  if (hud.district) {
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;
    setText(hud.district, `◈ ${districtAt(px, py).toUpperCase()}`);
  }
  if (hud.fps && game.fps) {
    setText(hud.fps, `${game.fps} FPS`);
    hud.fps.className = game.fps >= 50 ? 'good' : game.fps >= 30 ? 'warn' : 'bad';
  }
}

/** Draw the minimap: roads, water, beach, park, and every moving dot that matters. */
export function drawMinimap(hud, game) {
  const ctx = hud.mapCtx;
  if (!ctx) return;
  const W = hud.minimap.width;
  const H = hud.minimap.height;
  const sx = W / WORLD_W;
  const sy = H / WORLD_H;
  const X = (x) => x * sx;
  const Y = (y) => y * sy;

  ctx.fillStyle = '#2e4a3a';
  ctx.fillRect(0, 0, W, H);
  // Beach and water.
  ctx.fillStyle = '#e8d8a0';
  ctx.fillRect(0, Y(3100), W, Y(3420) - Y(3100));
  ctx.fillStyle = '#3a90c8';
  ctx.fillRect(0, Y(3420), W, H - Y(3420));
  ctx.fillRect(X(4680), 0, W - X(4680), H);
  // Park.
  ctx.fillStyle = '#4a9a5a';
  ctx.fillRect(X(game.city.park.x), Y(game.city.park.y), game.city.park.w * sx, game.city.park.h * sy);
  // Roads.
  ctx.strokeStyle = '#5a5f6a';
  ctx.lineWidth = Math.max(1, 110 * sx);
  ctx.beginPath();
  for (const rx of [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400, 3800, 4200, 4600]) {
    ctx.moveTo(X(rx), 0);
    ctx.lineTo(X(rx), Y(3000));
  }
  for (const ry of [200, 600, 1000, 1400, 1800, 2200, 2600, 3000]) {
    ctx.moveTo(0, Y(ry));
    ctx.lineTo(X(4600), Y(ry));
  }
  ctx.stroke();
  // Garage hideout.
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(X(game.city.garage.x), Y(game.city.garage.y), game.city.garage.w * sx, game.city.garage.h * sy);
  // Traffic dots.
  ctx.fillStyle = '#c8c8d8';
  for (const car of game.cars) {
    if (car.dead) continue;
    ctx.fillRect(X(car.x) - 1, Y(car.y) - 1, 2, 2);
  }
  // Police dots, flashing blue-red.
  for (const cop of game.police) {
    ctx.fillStyle = Math.floor(performance.now() / 250) % 2 === 0 ? '#ff4040' : '#4080ff';
    ctx.fillRect(X(cop.x) - 2, Y(cop.y) - 2, 4, 4);
  }
  // Mission marker, pulsing gold.
  const target = missionTarget(game.missions);
  if (target) {
    const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.arc(X(target.x), Y(target.y), pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // Side-work markers: hidden packages in gold, a waiting fare or drop-off
  // in green, so the extra jobs are findable from the map alone.
  if (game.side) {
    for (const m of sideMarkers(game.side)) {
      if (m.kind === 'package') {
        ctx.fillStyle = '#ffd23c';
        ctx.fillRect(X(m.x) - 1.5, Y(m.y) - 1.5, 3, 3);
      } else if (m.kind === 'taxi-wait' || m.kind === 'taxi-drop') {
        ctx.fillStyle = '#50dc78';
        ctx.beginPath();
        ctx.arc(X(m.x), Y(m.y), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Lena: white dot with a dark ring, or her car in gold.
  const px = game.player.car ? game.player.car.x : game.player.x;
  const py = game.player.car ? game.player.car.y : game.player.y;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(X(px), Y(py), 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Viewport frame: what the main camera sees.
  const cam = game.camera;
  if (cam) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(X(cam.x), Y(cam.y), cam.w * sx, cam.h * sy);
  }
}
