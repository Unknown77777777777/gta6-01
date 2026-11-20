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
