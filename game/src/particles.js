// The particle pool: every spark, puff of smoke, flame and splash in Costa Sol
// lives in one pre-allocated pool, so the game never allocates an object per
// particle per frame. Spawning takes a dead slot, updating sweeps the fixed
// array, and drawing skips the dead ones. Nothing here touches the DOM.

/** A fixed-capacity pool of particle slots. `cursor` is where the next spawn looks. */
export function createParticlePool(capacity) {
  const slots = [];
  for (let i = 0; i < capacity; i += 1) {
    slots.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff', active: false, gravity: 0 });
  }
  return { slots, cursor: 0, capacity };
}

/** Take one dead slot and light it up. Returns false when the pool is full. */
export function spawnParticle(pool, x, y, vx, vy, life, size, color, gravity) {
  const n = pool.slots.length;
  for (let i = 0; i < n; i += 1) {
    pool.cursor = (pool.cursor + 1) % n;
    const p = pool.slots[pool.cursor];
    if (p.active) continue;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.gravity = gravity || 0;
    p.active = true;
    return true;
  }
  return false;
}

/**
 * A burst of `count` particles flying out of (x, y) in every direction:
 * explosion fire, crash sparks, a splash of red, a puff of grey smoke.
 * Speeds vary so the cloud spreads instead of marching in lockstep.
 */
export function spawnBurst(pool, x, y, color, count, speed, life, size, gravity) {
  let spawned = 0;
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.35 + Math.random() * 0.65);
    if (spawnParticle(pool, x, y, Math.cos(a) * s, Math.sin(a) * s,
      life * (0.6 + Math.random() * 0.7), size * (0.7 + Math.random() * 0.6), color, gravity)) {
      spawned += 1;
    }
  }
  return spawned;
}

/** A rising column of smoke: slow, fat, grey particles drifting upward. */
export function spawnSmoke(pool, x, y, count, heavy) {
  for (let i = 0; i < count; i += 1) {
    spawnParticle(pool, x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 30, -26 - Math.random() * 26,
      0.7 + Math.random() * 0.4, heavy ? 7 + Math.random() * 4 : 5 + Math.random() * 3,
      heavy ? '#2e2e2e' : '#bdbdbd', -12);
  }
}

// ------------------------------------------------- v4 particle effects

/** A weapon impact: yellow sparks that fly fast and die fast, plus one small
 * grey puff where the round landed. Called by the bullet code. */
export function spawnImpact(pool, x, y, color) {
  spawnBurst(pool, x, y, color || '#ffd23c', 7, 150, 0.35, 2.2, 0);
  spawnParticle(pool, x, y, (Math.random() - 0.5) * 20, -30, 0.6, 5, '#bdbdbd', -10);
}

/** Race confetti: a burst of bright coloured squares that fall slowly and
 * spin — the finish line, in particles. Colours cycle the rainbow. */
export function spawnConfetti(pool, x, y, count) {
  const colors = ['#ffd23c', '#ff5a8a', '#58d878', '#4a90d8', '#c86ae8', '#ff8c28'];
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 160;
    spawnParticle(pool, x, y, Math.cos(a) * s, Math.sin(a) * s - 60,
      1.2 + Math.random() * 0.8, 3 + Math.random() * 2,
      colors[i % colors.length], 60);
  }
}

/** An ambulance trail: small white crosses that sparkle and fade behind the
 * ambulance while it carries a patient — the city can see the hurry. */
export function spawnAmbulanceTrail(pool, x, y) {
  spawnParticle(pool, x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 16,
    (Math.random() - 0.5) * 20, -20 - Math.random() * 20,
    0.7, 3, '#ffffff', 0);
  if (Math.random() < 0.4) {
    spawnParticle(pool, x, y, 0, -40, 0.5, 2, '#ff6a6a', 0);
  }
}

/** Night fireflies over the park: slow amber dots that drift and pulse. The
 * positions come from daynight.js; this file only lights them. */
export function spawnFireflies(pool, positions) {
  for (const f of positions) {
    spawnParticle(pool, f.x, f.y, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12,
      0.9, 2.5, '#ffe27a', 0);
  }
}

/** A muzzle flash puff for the big guns: a short orange bloom at the barrel. */
export function spawnMuzzle(pool, x, y, color) {
  spawnBurst(pool, x, y, color || '#ffe27a', 5, 90, 0.18, 3, 0);
}

/** A cash sparkle: green-gold dots that rise when a job pays out. */
export function spawnCashSparkle(pool, x, y) {
  for (let i = 0; i < 8; i += 1) {
    spawnParticle(pool, x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 40, -50 - Math.random() * 40,
      0.8, 2.5, i % 2 === 0 ? '#7de89a' : '#ffd23c', -20);
  }
}

/** Step every live particle: move it, age it, kill it when its life runs out. */
export function updateParticles(pool, dt) {
  for (const p of pool.slots) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

/** How many particles are alive right now (for the debug readouts). */
export function liveParticleCount(pool) {
  let n = 0;
  for (const p of pool.slots) if (p.active) n += 1;
  return n;
}

/** Paint every live particle as a fading circle. One path per particle is
 * still the cheapest honest way to draw a few dozen soft dots. */
export function drawParticles(ctx, pool) {
  for (const p of pool.slots) {
    if (!p.active) continue;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
