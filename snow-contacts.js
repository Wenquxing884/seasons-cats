// Contact marks are baked from the actors' deterministic paw trajectories.
// Rendering at t never advances the simulation: reverse/random seeking is safe.
const DURATION = 721 / 30;
const STEP = 1 / 120;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const hash = n => {
  let v = Math.imul(n + 913, 1597334677);
  v = Math.imul(v ^ (v >>> 16), 2246822519);
  return ((v ^ (v >>> 13)) >>> 0) / 4294967296;
};

function bakeContacts(cats) {
  const marks = [], landings = [], active = new Map(), previous = new Map();
  for (let frame = 0; frame <= Math.ceil(DURATION / STEP); frame++) {
    const t = Math.min(DURATION, frame * STEP), present = new Set();
    for (const cat of cats.sample(t)) {
      const before = previous.get(cat.name);
      if (before && before.air > .35 && cat.air <= .35 && t > .2) {
        landings.push({ t, x: cat.x, y: cat.y, name: cat.name,
          impulse: clamp(cat.landingImpulse || .65, .35, 1), vx: cat.vx || 0 });
      }
      previous.set(cat.name, { air: cat.air || 0 });
      for (const paw of cat.paws || cat.contacts || []) {
        const key = cat.name + ':' + paw.id;
        if (!paw.planted || paw.load <= .035 || (paw.z || 0) > .8 || cat.air > 1) continue;
        present.add(key);
        const old = active.get(key);
        // A new footprint begins at contact, or when the paw is re-planted.
        if (old && Math.hypot(paw.x - old.x, (paw.y - old.y) * 1.8) < 1.25) {
          old.end = t;
          old.load = Math.max(old.load, paw.load);
        } else {
          const mark = { x: paw.x, y: paw.y, start: t, end: t,
            load: paw.load, facing: cat.facing || -1, name: cat.name,
            seed: marks.length + 1, id: key };
          marks.push(mark); active.set(key, mark);
        }
      }
    }
    for (const key of active.keys()) if (!present.has(key)) active.delete(key);
  }
  return { marks, landings };
}

// Winter advances monotonically in this scene. Solve its arrival at a planted
// paw, so a cat already sitting when the snow reaches it leaves a depression too.
function snowStart(mark, now, isSnow) {
  const end = Math.min(mark.end, now);
  if (end < mark.start || !isSnow(mark.x, mark.y, end)) return null;
  if (isSnow(mark.x, mark.y, mark.start)) return mark.start;
  let a = mark.start, b = end;
  for (let i = 0; i < 10; i++) {
    const mid = (a + b) / 2;
    if (isSnow(mark.x, mark.y, mid)) b = mid; else a = mid;
  }
  return b;
}

function drawMark(ctx, mark, depth, age) {
  const rx = 2.25 + Math.min(1, mark.load) * 1.0;
  const ry = 1.35 + Math.min(1, mark.load) * .45;
  ctx.save(); ctx.translate(mark.x, mark.y); ctx.rotate(mark.facing * -.12);
  // Broad pressure, then the blue-grey hollow and the displaced sunlit lip.
  const ambient = ctx.createRadialGradient(0, .4, .5, 0, .4, rx * 2.8);
  ambient.addColorStop(0, `rgba(73,100,136,${.14 * depth})`);
  ambient.addColorStop(1, 'rgba(73,100,136,0)');
  ctx.fillStyle = ambient;
  ctx.beginPath();ctx.ellipse(0,.5,rx*2.8,ry*2.4,0,0,Math.PI*2);ctx.fill();
  const hollow = ctx.createLinearGradient(0, -ry, 0, ry * 1.3);
  hollow.addColorStop(0, `rgba(67,94,131,${.48 * depth})`);
  hollow.addColorStop(.6, `rgba(116,143,176,${.39 * depth})`);
  hollow.addColorStop(1, `rgba(170,194,218,${.12 * depth})`);
  ctx.fillStyle = hollow;
  ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=`rgba(248,252,255,${.67*depth})`;ctx.lineWidth=.7;
  ctx.beginPath();ctx.ellipse(0,.35,rx+.4,ry+.2,0,.18,Math.PI-.12);ctx.stroke();
  // Four toe pads are subtle at full-frame scale, readable in a close-up.
  if (age < 6) {
    ctx.fillStyle=`rgba(74,105,143,${.26*depth})`;
    for (let i=0;i<4;i++) {
      ctx.beginPath();ctx.ellipse(-2.1+i*1.3,-ry-.3-Math.sin((i+1)/5*Math.PI)*.55,.62,.47,0,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.restore();
}

function drawPowder(ctx, event, t) {
  const age = t - event.t;
  if (age <= 0 || age > .72) return;
  const intensity = (1-smooth(age/.72))*event.impulse;
  for (let i=0;i<32;i++) {
    const a=hash(event.t*120+i*11|0)*Math.PI*2;
    const speed=10+hash(i*19+event.t*120|0)*28;
    const lift=14+hash(i*7+91)*29;
    const x=event.x+Math.cos(a)*speed*age+event.vx*.035*age;
    const y=event.y+Math.sin(a)*speed*age*.32-lift*age+48*age*age;
    if(y>event.y+7)continue;
    const size=.35+hash(i*13+3)*.95;
    ctx.fillStyle=`rgba(246,250,255,${intensity*(.35+hash(i)*.5)})`;
    ctx.beginPath();ctx.ellipse(x,y,size,size*.65,0,0,Math.PI*2);ctx.fill();
  }
}

export function createSnowContacts(cats) {
  const baked = bakeContacts(cats);
  return {
    events: baked,
    draw(ctx, t, { isSnow }) {
      ctx.save();
      for (const mark of baked.marks) {
        if (mark.start>t || t-mark.end>11 || !isSnow(mark.x,mark.y,t)) continue;
        const birth=snowStart(mark,t,isSnow);if(birth===null)continue;
        const age=t-birth, departed=Math.max(0,t-mark.end);
        const depth=(.65+.35*smooth(age/.32))*Math.exp(-departed/5.8)*clamp(.7+mark.load*.6);
        if(depth>.05)drawMark(ctx,mark,depth,age);
      }
      for(const cat of cats.sample(t)) {
        if(!cat.grounded || !isSnow(cat.x,cat.y,t))continue;
        const resting=cat.state==='lie'||cat.state==='sit';
        if(resting) {
          const rx=cat.state==='lie'?23:12,ry=cat.state==='lie'?5:6;
          const g=ctx.createRadialGradient(cat.x,cat.y,1,cat.x,cat.y,rx);
          g.addColorStop(0,'rgba(87,111,148,.19)');g.addColorStop(1,'rgba(87,111,148,0)');
          ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(cat.x,cat.y,rx,ry,0,0,Math.PI*2);ctx.fill();
        }
      }
      for(const event of baked.landings)if(isSnow(event.x,event.y,event.t))drawPowder(ctx,event,t);
      ctx.restore();
    }
  };
}
