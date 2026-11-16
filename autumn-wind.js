// Coherent autumn wind and debris. No frame history, timers or per-frame random.
// Wind phase is shared with the meadow so seed plumes leave the bending crests.
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const mod = (x, n) => ((x % n) + n) % n;
function random(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let q = Math.imul(seed ^ seed >>> 15, 1 | seed);
    q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q;
    return ((q ^ q >>> 14) >>> 0) / 4294967296;
  };
}
function hash(n) {
  let x = Math.imul(n | 0, 1597334677);
  x = Math.imul(x ^ x >>> 15, 2246822519);
  return ((x ^ x >>> 13) >>> 0) / 4294967296;
}

export function sampleAutumnWind(u, v, t) {
  // Long oblique fronts travel across the whole record. Secondary swells and
  // faster, low-amplitude tips keep the sea of grass from moving as one slab.
  const front = u * 7.1 + v * 5.0 - t * 2.7;
  const swell = Math.sin(front + .27 * Math.sin(v * 4.0 - t * .69));
  const crossing = Math.sin(u * 3.3 - v * 8.7 - t * 1.66 + 1.2);
  const slow = .5 + .5 * Math.sin(t * 1.17 + u * 1.9 - v * 1.4);
  const crest = clamp(.5 + .37 * swell + .13 * crossing);
  const gust = clamp(.24 + .52 * crest + .24 * slow);
  return {
    lean: .16 + .58 * crest + .10 * slow,
    gust,
    crest,
    flutter: .055 * Math.sin(u * 31.7 + v * 21.3 - t * 9.2)
      + .025 * Math.sin(u * 61 - v * 37 - t * 13.1),
    direction: 1,
  };
}

function makeParticles() {
  const rand = random(0x41555455), all = [];
  const add = (kind, count) => {
    for (let i = 0; i < count; i++) {
      let u, v;
      do { u = rand() * 2 - 1; v = rand() * 2 - 1; }
      while (u * u + v * v > .97 || u * u + v * v < .035);
      const life = kind === 'dust' ? 2.0 + rand() * 2.7
        : kind === 'seed' ? 3.1 + rand() * 2.1 : 2.4 + rand() * 2.0;
      all.push({
        id: all.length, kind, u, v, life, phase: rand() * life,
        size: rand(), depth: rand(), drift: .7 + rand() * .65,
        lift: rand(), wobble: rand() * TAU, tilt: rand() * TAU,
        spin: (rand() < .5 ? -1 : 1) * (.8 + rand() * 1.3),
        tone: Math.floor(rand() * 4), opacity: .62 + rand() * .38,
      });
    }
  };
  add('dust', 1450); add('seed', 180); add('leaf', 105); add('haze', 16);
  return all;
}

function seasonFade(p, t, birth) {
  if (birth < p.autumnAt || birth >= p.winterAt) return 0;
  if (t < p.winterAt) return 1;
  if (Math.max(birth, t - .82) >= p.winterAt) return 0;
  // The pointer has just covered the source with snow. Remaining airborne dust
  // dissipates rather than looping forever over the winter surface.
  let a = Math.max(birth, t - .82), b = t;
  for (let i = 0; i < 5; i++) {
    const mid = (a + b) / 2;
    if (mid < p.winterAt) a = mid; else b = mid;
  }
  return 1 - smooth((t - b) / .82);
}

export function createAutumnAir({ project, seasonAt }) {
  const particles = makeParticles();
  function transitionAt(p, stage) {
    let a = 0, b = 23;
    // Only the source's monotonically advancing season matters. Resolve the
    // transition once to sub-microsecond precision, not thousands of times per
    // displayed frame through the pointer binary search and atan2 callback.
    for (let i = 0; i < 27; i++) {
      const m = (a + b) / 2;
      if (seasonAt(p.u, p.v, m) >= stage) b = m; else a = m;
    }
    return b;
  }
  function gustAt(p, t) {
    // Particle trajectories need gust only. Do not allocate a full wind result
    // or evaluate the unused grass-tip flutter terms for every dust grain.
    const front = p.frontPhase - t * 2.7;
    const swell = Math.sin(front + .27 * Math.sin(p.wavePhase - t * .69));
    const crossing = Math.sin(p.crossPhase - t * 1.66 + 1.2);
    const slow = .5 + .5 * Math.sin(t * 1.17 + p.slowPhase);
    const crest = clamp(.5 + .37 * swell + .13 * crossing);
    return clamp(.24 + .52 * crest + .24 * slow);
  }
  // Every patch starts shedding as soon as the autumn sweep reaches it. This
  // avoids a full random lifetime of waiting at the beginning of the season.
  for (const p of particles) {
    let a = 0, b = 23;
    for (let i = 0; i < 13; i++) {
      const m = (a + b) / 2;
      if (seasonAt(p.u, p.v, m) >= 3) b = m; else a = m;
    }
    p.firstBirth = b + p.phase * .075;
    p.autumnAt = transitionAt(p, 3);
    p.winterAt = transitionAt(p, 4);
    p.frontPhase = p.u * 7.1 + p.v * 5.0;
    p.wavePhase = p.v * 4.0;
    p.crossPhase = p.u * 3.3 - p.v * 8.7;
    p.slowPhase = p.u * 1.9 - p.v * 1.4;
    p.canopy = 34 + p.lift * 22;
    p.rise = (p.kind === 'leaf' ? 14 : 19) + p.lift * 17;
    p.curl = 3 + p.lift * 4;
    p.scale = .78 + p.depth * .48;
    p.cycles = [];
    for (let cycle = 0; p.firstBirth + cycle * p.life < p.winterAt; cycle++) {
      const birth = p.firstBirth + cycle * p.life;
      const gust = gustAt(p, birth);
      p.cycles.push({
        gust,
        jitter: hash(p.id * 137 + cycle * 967) - .5,
        strength: .60 + .40 * gust,
        valid: birth >= p.autumnAt && birth < p.winterAt,
      });
    }
    p.result = { x: 0, y: 0, alpha: 0, scale: p.scale, spin: 0, age: 0, gust: 0, p };
  }
  const dustParticles = particles.filter(p => p.kind === 'dust');
  const hazeParticles = particles.filter(p => p.kind === 'haze');
  const detailParticles = particles.filter(p => p.kind === 'seed' || p.kind === 'leaf')
    .sort((a, b) => a.depth - b.depth);
  function at(p, t) {
    if (t < p.firstBirth || t >= p.winterAt + .82) return null;
    const cycle = Math.floor((t - p.firstBirth) / p.life);
    const age = mod(t - p.firstBirth, p.life), birth = t - age;
    const start = p.cycles[cycle]; if (!start?.valid) return null;
    const gate = seasonFade(p, t, birth); if (gate < .002) return null;
    const progress = age / p.life;
    const envelope = smooth(age / .34) * (1 - smooth((progress - .68) / .32));
    if (envelope < .002) return null;
    const strength = start.strength;
    // The root begins at the tips of the tall grass. Drag carries it mainly
    // sideways; lift and a small curl make the trajectories rise and tumble.
    const advect = age * (.085 + .080 * start.gust) * p.drift;
    const du = advect + Math.sin(age * 1.5 + p.wobble) * .027 * age;
    const dv = -age * .026 + Math.sin(age * 1.05 + p.wobble) * .023 * age;
    const u = p.u + du, v = p.v + dv;
    const z = p.canopy + age * p.rise * strength - age * age * 3.4
      + Math.sin(age * 2.4 + p.wobble) * p.curl * age;
    const q = project(u, v, z);
    const x = q.x + start.jitter * 8 * smooth(age), y = q.y;
    if (x < -25 || x > 1045 || y < -22 || y > 565 || z < 8) return null;
    // The source may be behind the camera-side rim: fade before it shoots off
    // the record. The fur/face region is not covered by a dense foreground fog.
    const radius = Math.sqrt(u * u + v * v);
    const offDisc = 1 - smooth((radius - 1.03) / .68);
    let alpha = envelope * gate * strength * p.opacity * offDisc;
    if (x > 480 && x < 640 && y > 360 && y < 460) alpha *= .66;
    const spin = p.tilt + age * p.spin * (1.6 + start.gust);
    const out = p.result;
    out.x = x; out.y = y; out.alpha = alpha; out.spin = spin; out.age = age;
    if (p.kind === 'dust') out.gust = gustAt(p, t);
    return out;
  }
  function drawDust(ctx, t) {
    // Batched far streaks retain direction without behaving like falling snow.
    const paths = Array.from({ length: 16 }, () => new Path2D());
    for (const p of dustParticles) {
      const q = at(p, t); if (!q || q.alpha < .008) continue;
      const index = Math.min(7, Math.floor(q.alpha * 8)) + (p.tone === 2 ? 8 : 0);
      const size = (.25 + p.size * .72) * q.scale;
      const path = paths[index];
      const length = (.5 + p.size * 1.9) * (.75 + q.gust * .6);
      path.moveTo(q.x - length, q.y + length * .12);
      path.lineTo(q.x + size, q.y - size * .15);
    }
    ctx.lineCap = 'round'; ctx.lineWidth = .92;
    for (let i = 0; i < paths.length; i++) {
      ctx.strokeStyle = i < 8 ? `rgba(255,236,174,${.15 + i * .085})`
        : `rgba(121,65,19,${.13 + (i - 8) * .074})`;
      ctx.stroke(paths[i]);
    }
  }
  function drawSeed(ctx, q) {
    const p = q.p, radius = (1.45 + p.size * 1.85) * q.scale;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.spin * .31);
    ctx.strokeStyle = `rgba(255,248,221,${q.alpha * .93})`;
    ctx.lineWidth = .58;
    // A little umbrella of fibres, carried sideways like released grass seed.
    ctx.beginPath(); ctx.moveTo(-radius * .16, radius * 1.2); ctx.lineTo(0, 0);
    for (let k = 0; k < 7; k++) {
      const a = -.93 * Math.PI + k / 6 * .85 * Math.PI;
      const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      ctx.moveTo(0, 0); ctx.quadraticCurveTo(x * .42, y * .28, x, y);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(142,80,24,${q.alpha * .88})`;
    ctx.beginPath(); ctx.ellipse(-radius * .16, radius * 1.2, .51, 1.0, .28, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawLeaf(ctx, q) {
    const p = q.p, length = (1.95 + p.size * 2.5 + (p.depth > .88 ? 1.1 : 0)) * q.scale;
    const flip = .29 + .71 * Math.abs(Math.cos(q.spin * 1.27));
    const tones = ['165,86,24', '250,207,108', '112,61,21', '255,229,155'];
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.spin);
    ctx.fillStyle = `rgba(${tones[p.tone]},${Math.min(1,q.alpha * 1.10)})`;
    ctx.beginPath(); ctx.moveTo(-length, -.12);
    ctx.quadraticCurveTo(-length * .2, -length * .51 * flip, length * .92, 0);
    ctx.quadraticCurveTo(length * .04, length * .62 * flip, -length, -.12);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,224,150,${q.alpha * .45})`; ctx.lineWidth = .38;
    ctx.beginPath(); ctx.moveTo(-length * .75, -.12); ctx.lineTo(length * .66, 0); ctx.stroke();
    ctx.restore();
  }
  function drawHaze(ctx, q) {
    const radius = 9 + q.p.size * 13;
    const g = ctx.createRadialGradient(q.x, q.y, 1, q.x, q.y, radius);
    g.addColorStop(0, `rgba(230,178,91,${q.alpha * .035})`);
    g.addColorStop(1, 'rgba(230,178,91,0)');
    ctx.fillStyle = g; ctx.fillRect(q.x - radius, q.y - radius, radius * 2, radius * 2);
  }
  return {
    draw(ctx, t) {
      ctx.save();
      for (const p of hazeParticles) {
        const q = at(p, t); if (q && q.alpha >= .008) drawHaze(ctx, q);
      }
      drawDust(ctx, t);
      for (const p of detailParticles) {
        const q = at(p, t); if (!q || q.alpha < .008) continue;
        if (p.kind === 'seed') drawSeed(ctx, q); else drawLeaf(ctx, q);
      }
      ctx.restore();
    },
    stats(t) {
      const counts = { dust: 0, seed: 0, leaf: 0, haze: 0, total: 0 };
      let alphaSum = 0;
      for (const p of particles) {
        const q = at(p, t); if (!q || q.alpha < .008) continue;
        counts[p.kind]++; counts.total++; alphaSum += q.alpha;
      }
      return { ...counts, meanOpacity: counts.total ? alphaSum / counts.total : 0 };
    },
  };
}
