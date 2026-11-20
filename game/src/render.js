// Drawing only: the city, the cars, the people, Lena, the effects and the sun.
// The camera follows Lena smoothly; the world is drawn in world coordinates and
// the HUD lives in the DOM. Tire marks, smoke, muzzle flashes and screen shake
// make the chase feel like a chase.

import { ROAD_H, ROAD_V, ROAD_HALF, WORLD_H, WORLD_W } from './city.js';
import { CAR_H, CAR_W } from './vehicles.js';
import { missionTarget } from './missions.js';

const VIEW_W = 1280;
const VIEW_H = 720;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = { x: 0, y: 0, w: VIEW_W, h: VIEW_H, shake: 0, shakeX: 0, shakeY: 0 };
  const fonts = new Map();

  function font(size, bold) {
    const key = `${bold ? 'b' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px system-ui, -apple-system, "Segoe UI", sans-serif`);
    return fonts.get(key);
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

  function drawGround(city) {
    // Grass base for the whole city.
    ctx.fillStyle = '#7ab86a';
    ctx.fillRect(camera.x - 90, camera.y - 90, VIEW_W + 180, VIEW_H + 180);
    // Beach sand and the sea along the south edge.
    ctx.fillStyle = '#ecd9a0';
    ctx.fillRect(camera.x - 90, Math.max(camera.y - 90, city.beachY), VIEW_W + 180, city.waterY - city.beachY);
    ctx.fillStyle = '#2f88c8';
    ctx.fillRect(camera.x - 90, Math.max(camera.y - 90, city.waterY), VIEW_W + 180, VIEW_H + 180);
    // Harbour water on the east edge.
    ctx.fillRect(Math.max(camera.x - 90, city.harborX), camera.y - 90, VIEW_W + 180, VIEW_H + 180);
    // Surf lines where the sea meets the sand.
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
    // Blocks: pale sidewalks between the roads.
    ctx.fillStyle = '#c8bfa8';
    for (let i = 0; i < ROAD_V.length - 1; i += 1) {
      for (let j = 0; j < ROAD_H.length - 1; j += 1) {
        const x = ROAD_V[i] + ROAD_HALF;
        const y = ROAD_H[j] + ROAD_HALF;
        const w = ROAD_V[i + 1] - ROAD_V[i] - 2 * ROAD_HALF;
        const h = ROAD_H[j + 1] - ROAD_H[j] - 2 * ROAD_HALF;
        if (x > camera.x + VIEW_W || x + w < camera.x || y > camera.y + VIEW_H || y + h < camera.y) continue;
        ctx.fillRect(x, y, w, h);
      }
    }
    // Park grass and plaza stone.
    ctx.fillStyle = '#58a858';
    ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
    ctx.fillStyle = '#d8cbb0';
    ctx.fillRect(city.plaza.x, city.plaza.y, city.plaza.w, city.plaza.h);
    // Plaza fountain.
    ctx.fillStyle = '#7ab8d8';
    ctx.beginPath();
    ctx.arc(city.plaza.x + city.plaza.w / 2, city.plaza.y + city.plaza.h / 2, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath();
    ctx.arc(city.plaza.x + city.plaza.w / 2, city.plaza.y + city.plaza.h / 2, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7ab8d8';
    ctx.beginPath();
    ctx.arc(city.plaza.x + city.plaza.w / 2, city.plaza.y + city.plaza.h / 2, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRoads() {
    ctx.fillStyle = '#3c4048';
    for (const rx of ROAD_V) ctx.fillRect(rx - ROAD_HALF, camera.y - 90, ROAD_HALF * 2, VIEW_H + 180);
    for (const ry of ROAD_H) ctx.fillRect(camera.x - 90, ry - ROAD_HALF, VIEW_W + 180, ROAD_HALF * 2);
    // Centre dashes.
    ctx.fillStyle = '#f2e8a0';
    for (const rx of ROAD_V) {
      for (let y = Math.floor((camera.y - 90) / 60) * 60; y < camera.y + VIEW_H + 90; y += 60) {
        if (y > 3000) break;
        ctx.fillRect(rx - 2, y, 4, 28);
      }
    }
    for (const ry of ROAD_H) {
      for (let x = Math.floor((camera.x - 90) / 60) * 60; x < camera.x + VIEW_W + 90; x += 60) {
        if (x > 4600) break;
        ctx.fillRect(x, ry - 2, 28, 4);
      }
    }
    // Kerb lines.
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 2;
    for (const rx of ROAD_V) {
      ctx.beginPath(); ctx.moveTo(rx - ROAD_HALF, camera.y - 90); ctx.lineTo(rx - ROAD_HALF, camera.y + VIEW_H + 90); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx + ROAD_HALF, camera.y - 90); ctx.lineTo(rx + ROAD_HALF, camera.y + VIEW_H + 90); ctx.stroke();
    }
    for (const ry of ROAD_H) {
      ctx.beginPath(); ctx.moveTo(camera.x - 90, ry - ROAD_HALF); ctx.lineTo(camera.x + VIEW_W + 90, ry - ROAD_HALF); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(camera.x - 90, ry + ROAD_HALF); ctx.lineTo(camera.x + VIEW_W + 90, ry + ROAD_HALF); ctx.stroke();
    }
  }

  function drawBuildings(city) {
    for (const b of city.buildings) {
      if (b.x > camera.x + VIEW_W + 60 || b.x + b.w < camera.x - 60 || b.y > camera.y + VIEW_H + 60 || b.y + b.h < camera.y - 60) continue;
      // Drop shadow: the sun is high and to the south-west.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      // Walls, then the roof set in by the building's height.
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      // Roof detail: a skylight or a vent.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, b.w * 0.18, b.h * 0.2);
      ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.55, b.w * 0.15, b.h * 0.18);
      if (b.label) {
        ctx.font = font(15, true);
        ctx.fillStyle = '#20242c';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5);
      }
    }
    // The pier: wooden planks over the harbour water.
    const p = city.pier;
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#6a4a2a';
    ctx.lineWidth = 2;
    for (let x = p.x + 20; x < p.x + p.w; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
    }
    // Trees.
    for (const t of city.trees) {
      if (t.x < camera.x - 30 || t.x > camera.x + VIEW_W + 30 || t.y < camera.y - 30 || t.y > camera.y + VIEW_H + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath(); ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3f8a4a';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#58b868';
      ctx.beginPath(); ctx.arc(t.x - 4, t.y - 4, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
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
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (car.dead) ctx.globalAlpha = Math.max(0, car.fade);
    if (isPlayerCar) {
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 3;
      ctx.strokeRect(-CAR_W / 2 - 4, -CAR_H / 2 - 4, CAR_W + 8, CAR_H + 8);
    }
    // Body with a darker outline.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-CAR_W / 2 + 2, -CAR_H / 2 + 3, CAR_W, CAR_H);
    ctx.fillStyle = car.color;
    ctx.fillRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
    // Windshield and rear window.
    ctx.fillStyle = '#1c2a38';
    ctx.fillRect(CAR_W / 2 - 14, -CAR_H / 2 + 3, 8, CAR_H - 6);
    ctx.fillRect(-CAR_W / 2 + 4, -CAR_H / 2 + 3, 6, CAR_H - 6);
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(CAR_W / 2 - 2, -CAR_H / 2 + 2, 3, 5);
    ctx.fillRect(CAR_W / 2 - 2, CAR_H / 2 - 7, 3, 5);
    if (car.kind === 'police') {
      // Black-and-white cruiser with a light bar.
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(-6, -CAR_H / 2, 12, CAR_H);
      const flash = Math.floor(performance.now() / 220) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3030' : '#3070ff';
      ctx.fillRect(-4, -CAR_H / 2 - 2, 8, 6);
      ctx.fillStyle = flash ? '#3070ff' : '#ff3030';
      ctx.fillRect(-4, CAR_H / 2 - 4, 8, 6);
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
    if (car.kind === 'target') {
      ctx.fillStyle = '#20242c';
      ctx.font = font(8, true);
      ctx.textAlign = 'center';
      ctx.fillText('★', 0, 3);
    }
    if (car.smoke > 0.15) {
      ctx.fillStyle = `rgba(120,120,120,${Math.min(0.6, car.smoke)})`;
      ctx.beginPath();
      ctx.arc(-CAR_W / 2 - 6, 0, 8 + Math.random() * 6, 0, Math.PI * 2);
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
    const bob = Math.sin(ped.walkPhase) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(ped.x, ped.y + 8, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.4, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4 - 4 + bob * 0.4, 6, 0, Math.PI * 2); ctx.fill();
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
    // Pistol in hand when aiming.
    if (game.mouseDown || player.muzzle > 0) {
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(player.x + Math.cos(player.angle) * 10, player.y + Math.sin(player.angle) * 10);
      ctx.lineTo(player.x + Math.cos(player.angle) * 22, player.y + Math.sin(player.angle) * 22);
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
    ctx.fillStyle = '#ffe27a';
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles(particles) {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMarkers(game) {
    const target = missionTarget(game.missions);
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

  /** The waypoint arrow: points at the mission marker from the screen edge. */
  function drawWaypointArrow(game) {
    const target = missionTarget(game.missions);
    if (!target) return;
    const px = game.player.car ? game.player.car.x : game.player.x;
    const py = game.player.car ? game.player.car.y : game.player.y;
    const dx = target.x - px;
    const dy = target.y - py;
    const d = Math.hypot(dx, dy);
    if (d < 160) return; // the beacon on the ground is enough up close
    const angle = Math.atan2(dy, dx);
    const cx = VIEW_W / 2 + Math.cos(angle) * 300;
    const cy = VIEW_H / 2 + Math.sin(angle) * 220;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = font(14, true);
    ctx.fillStyle = '#ffd23c';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(d)}m`, cx, cy + 30);
  }

  function drawSunlight() {
    // Warm midday sun: a soft radial glow and a gentle vignette.
    const g = ctx.createRadialGradient(VIEW_W * 0.72, VIEW_H * 0.18, 80, VIEW_W * 0.72, VIEW_H * 0.18, 900);
    g.addColorStop(0, 'rgba(255,240,180,0.14)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(20,20,60,0.18)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /** Paint one frame of the live game. */
  function draw(game) {
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
    drawGround(game.city);
    drawRoads();
    drawBuildings(game.city);
    drawTireMarks(game.tireMarks);
    drawMarkers(game);
    // Draw order: parked and traffic, then police, then Lena's car, then people, then Lena.
    for (const car of game.cars) drawCar(car, false);
    for (const cop of game.police) drawCar(cop, false);
    if (game.player.car) drawCar(game.player.car, true);
    for (const ped of game.peds) drawPed(ped);
    drawPlayer(game.player, game);
    drawBullets(game.bullets);
    drawParticles(game.particles);
    ctx.restore();
    drawWaypointArrow(game);
    drawSunlight();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, camera, addShake, VIEW_W, VIEW_H };
}
