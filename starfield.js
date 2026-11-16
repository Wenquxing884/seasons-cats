export function createStarfield() {
  const W = 1020, H = 576;
  const TAU = Math.PI * 2;
  // A tiny deterministic PRNG keeps the same t / frame identical across renders.
  let seed = 0x5ea5015;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let q = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    q ^= q + Math.imul(q ^ (q >>> 7), 61 | q);
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
  const gaussian = () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = W;
  baseCanvas.height = H;
  const base = baseCanvas.getContext('2d');
  base.imageSmoothingEnabled = true;

  // Reference is almost black, with the lightest blue lift behind the galaxy.
  base.fillStyle = '#010507';
  base.fillRect(0, 0, W, H);
  const blackLift = base.createRadialGradient(770, 88, 30, 520, 190, 760);
  blackLift.addColorStop(0, 'rgba(17,27,40,0.22)');
  blackLift.addColorStop(0.48, 'rgba(7,13,22,0.12)');
  blackLift.addColorStop(1, 'rgba(0,0,0,0)');
  base.fillStyle = blackLift;
  base.fillRect(0, 0, W, H);

  // A soft, narrow diagonal Milky Way. The reference band is not a broad nebula:
  // it runs from lower left to upper right and fades to black at both edges.
  const yBand = (x) => 250 - 0.165 * x;
  const bandGlow = base.createLinearGradient(0, 350, W, 55);
  bandGlow.addColorStop(0, 'rgba(28,46,61,0.06)');
  bandGlow.addColorStop(0.28, 'rgba(74,99,124,0.12)');
  bandGlow.addColorStop(0.56, 'rgba(50,73,101,0.15)');
  bandGlow.addColorStop(0.86, 'rgba(20,33,54,0.07)');
  bandGlow.addColorStop(1, 'rgba(0,0,0,0)');
  base.save();
  base.globalCompositeOperation = 'screen';
  base.filter = 'blur(22px)';
  base.beginPath();
  base.moveTo(-80, yBand(-80) + 32);
  base.lineTo(W + 80, yBand(W + 80) + 32);
  base.lineWidth = 108;
  base.strokeStyle = bandGlow;
  base.stroke();
  base.filter = 'none';
  base.restore();

  // Fine fractal luminance inside the diagonal band, rather than smooth circles.
  // Low-frequency structure carries broad smoky strands; small detail supplies dust.
  const fract = (n) => n - Math.floor(n);
  const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7 + 71.9) * 43758.5453);
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let u = x - ix, v = y - iy;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    const a = hash(ix, iy), b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
  const fractal = (x, y) => noise(x, y) * 0.53 + noise(x * 2.1, y * 2.1) * 0.28 + noise(x * 4.4, y * 4.4) * 0.13 + noise(x * 9.3, y * 9.3) * 0.06;
  const cloud = base.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const centre = yBand(x) + 5 * Math.sin(x / 125) + 5 * noise(x / 72, 4);
      const dist = y - centre;
      if (Math.abs(dist) > 100) continue;
      const n = fractal(x / 75, y / 23);
      const broad = Math.exp(-(dist * dist) / (2 * 35 * 35));
      const fine = Math.exp(-(dist * dist) / (2 * 23 * 23));
      const lane = Math.exp(-Math.pow((dist + 5 + 15 * noise(x / 110, 2)) / 9, 2));
      const brightness = Math.max(0, (12 * broad + 31 * fine * (0.24 + n * 1.1)) * (0.56 + 0.44 * noise(x / 205, 3)) * (1 - 0.61 * lane));
      const k = (y * W + x) * 4;
      cloud.data[k] = Math.min(255, cloud.data[k] + brightness * 0.70);
      cloud.data[k + 1] = Math.min(255, cloud.data[k + 1] + brightness * 0.88);
      cloud.data[k + 2] = Math.min(255, cloud.data[k + 2] + brightness * 1.08);
    }
  }
  base.putImageData(cloud, 0, 0);
  // Dark lanes break up the cloud into the fine, photographic-looking band seen in
  // the reference. These are deliberately low-alpha and narrow.
  base.save();
  base.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 12; i++) {
    const yOff = (i - 5.5) * 7 + gaussian() * 2;
    base.beginPath();
    base.moveTo(-40, yBand(-40) + yOff);
    base.bezierCurveTo(230, yBand(230) + yOff + gaussian() * 5,
      560, yBand(560) + yOff + gaussian() * 5,
      1060, yBand(1060) + yOff + gaussian() * 4);
    base.lineWidth = 2 + rand() * 6;
    base.strokeStyle = `rgba(0,4,10,${(0.08 + rand() * 0.12).toFixed(3)})`;
    base.stroke();
  }
  base.restore();

  // Sparse stars over the entire sky. Most are pinpoints; only a few get a soft halo.
  const glints = [];
  base.save();
  base.globalCompositeOperation = 'screen';
  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = rand() * H * 0.95;
    const r = 0.22 + Math.pow(rand(), 2.3) * 1.15;
    const a = 0.18 + rand() * 0.48;
    const warm = rand() < 0.14;
    base.fillStyle = warm
      ? `rgba(219,229,238,${a.toFixed(3)})`
      : `rgba(218,234,255,${a.toFixed(3)})`;
    base.beginPath();
    base.arc(x, y, r, 0, TAU);
    base.fill();
    if (r > 0.9 && rand() < 0.24) glints.push({ x, y, r, a, phase: rand() * TAU });
  }
  base.restore();

  // Dense stars in the galaxy, distributed along the sloping centreline with a
  // gradually changing width. Keep these dim enough that the planet remains the focus.
  base.save();
  base.globalCompositeOperation = 'screen';
  for (let i = 0; i < 1250; i++) {
    const x = rand() * (W + 90) - 45;
    const width = 34 + 21 * Math.sin(Math.PI * (x + 30) / (W + 60));
    const y = yBand(x) + gaussian() * width;
    if (y < -20 || y > H + 15) continue;
    const r = 0.18 + Math.pow(rand(), 2.8) * 1.05;
    const a = 0.10 + rand() * 0.46;
    const warm = rand() < 0.10;
    base.fillStyle = warm
      ? `rgba(199,211,220,${a.toFixed(3)})`
      : `rgba(183,211,244,${a.toFixed(3)})`;
    base.beginPath();
    base.arc(x, y, r, 0, TAU);
    base.fill();
    if (r > 0.92 && rand() < 0.18) glints.push({ x, y, r, a, phase: rand() * TAU });
  }
  base.restore();

  // A low-density dust veil makes the diagonal edge less geometric without reading
  // as a blue cloud. It is baked once, so it has no frame-to-frame noise.
  base.save();
  base.globalCompositeOperation = 'screen';
  for (let i = 0; i < 560; i++) {
    const x = rand() * W;
    const y = yBand(x) + gaussian() * (24 + 12 * Math.sin(Math.PI * x / W));
    const r = 0.15 + rand() * 0.85;
    const a = 0.025 + rand() * 0.10;
    base.fillStyle = `rgba(132,164,202,${a.toFixed(3)})`;
    base.beginPath();
    base.arc(x, y, r, 0, TAU);
    base.fill();
  }
  base.restore();

  return {
    width: W,
    height: H,
    draw(ctx, t = 0) {
      const sx = ctx.canvas.width / W;
      const sy = ctx.canvas.height / H;
      ctx.save();
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(baseCanvas, 0, 0);
      // Tiny, deterministic twinkle on the handful of visible glints. This is only
      // a few pixels and leaves the galaxy essentially still, as in the reference.
      ctx.globalCompositeOperation = 'screen';
      for (const s of glints) {
        const pulse = 0.72 + 0.28 * Math.sin(t * 1.55 + s.phase);
        ctx.fillStyle = `rgba(228,241,255,${(s.a * 0.28 * pulse).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.9 + 0.12 * pulse), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}


