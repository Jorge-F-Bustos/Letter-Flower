const canvas = document.querySelector('#artwork');
const ctx = canvas.getContext('2d', { alpha: true });
const flowerCanvas = document.createElement('canvas');
const flowerCtx = flowerCanvas.getContext('2d', { alpha: true });
const discover = document.querySelector('#discover');
const replay = document.querySelector('#replay');
const bouquet = document.querySelector('#bouquet-screen');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const MOTE_STYLES = ['rgb(117 112 190)', 'rgb(175 151 231)', 'rgb(235 157 202)', 'rgb(234 226 255)'];
const TRANSITION_STYLES = ['rgb(197 169 232)', 'rgb(255 241 247)'];
const PIXEL_BUDGET = 20_000_000;
const KEYS = [
  [0, 0, 0, 0, 0, 0, 0], [5, .42, .22, 0, 0, .25, 0], [10, .62, .42, 0, 0, .5, .35],
  [16, .8, .68, .5, 0, .72, .55], [24, 1, 1, 1, 0, 1, 1], [30, 1, 1, 1, 0, 1, 1],
  [39, .98, .85, .55, 1, .92, 0], [45, .98, .85, .55, 1, .9, 0],
];
const LEAF_DEFS = [[.10, 1, 1, .55, -.80], [.16, -1, .90, .50, -.85], [.40, 1, .70, .95, -.70], [.33, -1, .62, .90, -.65]];
const FLOWER = { x: 500, y: 800, scale: 1, angle: 0, cos: 1, sin: 0 };

let width = 0;
let height = 0;
let dpr = 1;
let nativeDpr = 1;
let resolutionScale = 1;
let model;
let data;
let particleCtx = ctx;
let sceneScale = 1;
let yScale = 1;
let centerY = 0;
let sceneTransform = [1, 0, 0, 1, 0, 0];
let motes = [];
let sprigs = [];
let startedAt = 0;
let blooming = false;
let everFullyBloomed = false;
let replayPulseAt = -Infinity;
let transitionAt = 0;
let lastFrame = 0;
let pointer = { x: 0, y: 0 };
let frameInterval = 1000 / 60;
let particleStep = 1;
let slowFrames = 0;
let fastFrames = 0;

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
const smoothstep = (value, a, b) => ease((value - a) / (b - a));
const sinc = value => Math.abs(value) < 1e-8 ? 1 : Math.sin(value) / value;
const rgb = (r, g, b) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
const color = row => `rgb(${row[0]} ${row[1]} ${row[2]})`;

function resize() {
  const nextWidth = window.innerWidth;
  const nextHeight = window.innerHeight;
  const pixels = Math.max(1, nextWidth * nextHeight);
  const deviceDpr = window.devicePixelRatio || 1;
  if (deviceDpr !== nativeDpr) {
    nativeDpr = deviceDpr;
    resolutionScale = 1;
    particleStep = 1;
    frameInterval = 1000 / 60;
    slowFrames = fastFrames = 0;
  }
  const nextDpr = Math.max(1, Math.min(deviceDpr * resolutionScale, 3, Math.sqrt(PIXEL_BUDGET / pixels)));
  if (nextWidth === width && nextHeight === height && nextDpr === dpr) return;
  const sizeChanged = nextWidth !== width || nextHeight !== height;
  width = nextWidth;
  height = nextHeight;
  dpr = nextDpr;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sceneScale = Math.min(width / (width < 600 ? 900 : 1000), height / (width < 600 ? 740 : 1000));
  yScale = sceneScale * (width < 600 ? 1.05 : 1);
  centerY = height * (width < 600 ? .52 : .56);
  sceneTransform = [dpr * sceneScale, 0, 0, dpr * yScale, dpr * (width / 2 - 500 * sceneScale), dpr * (centerY - 500 * yScale)];
  const flowerDpr = Math.max(1, Math.min(3, dpr * sceneScale));
  flowerCanvas.width = Math.round(1000 * flowerDpr);
  flowerCanvas.height = Math.round(1000 * flowerDpr);
  lastFrame = 0;
  if (sizeChanged) {
    const count = Math.min(width < 700 ? 72 : 130, Math.round(width * height / 10000));
    motes = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * width, y: Math.random() * height, phase: Math.random() * 6.28,
      speed: .12 + Math.random() * .24, size: .7 + Math.random() * 1.4, hue: i % 4,
    }));
    sprigs = [];
    for (const side of [1, -1]) {
      const baseX = side === 1 ? width * .025 : width * .975;
      const baseY = side === 1 ? height * .73 : height * .27;
      const rise = side === 1 ? -1 : 1;
      const branch = t => [baseX - side * width * .12 * t, baseY + rise * height * .2 * t];
      for (let i = 0; i <= 48; i++) {
        const [x, y] = branch(i / 48);
        sprigs.push([x, y, 'rgb(85 117 91)', .8 + (i % 3) * .25]);
      }
      for (let leaf = 0; leaf < 7; leaf++) {
        const [x, y] = branch(.12 + leaf * .12);
        const direction = (leaf % 2 ? 1 : -1) * -side;
        const length = Math.min(width, height) * (.035 + leaf % 3 * .006);
        for (let i = 0; i <= 10; i++) {
          const u = i / 10;
          const curve = Math.sin(Math.PI * u);
          sprigs.push([x + direction * length * u - side * length * .22 * u,
            y - length * .58 * u + curve * length * .2,
            i % 4 === 0 ? 'rgb(197 155 185)' : 'rgb(120 145 116)', .45 + curve * .4]);
        }
      }
    }
  }
}

function drawMotes(time) {
  for (const mote of motes) {
    const drift = Math.sin(time * mote.speed + mote.phase) * 5;
    const dx = pointer.x ? (pointer.x - mote.x) * .0008 : 0;
    const x = (mote.x + drift + dx + width) % width;
    const y = (mote.y - time * mote.speed * 2 + height * 2) % height;
    ctx.fillStyle = MOTE_STYLES[mote.hue];
    ctx.globalAlpha = .22 + .30 * (.5 + .5 * Math.sin(time * .7 + mote.phase));
    ctx.fillRect(x, y, mote.size, mote.size);
  }
  for (const [x, y, style, size] of sprigs) {
    ctx.fillStyle = style;
    ctx.globalAlpha = .38;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function prepareData(json) {
  model = json.model;
  model.stemStyles = model.stem.map(p => color(p.slice(2, 5)));
  model.leafStyles = model.leaves.map(p => color(p.slice(3, 6)));
  model.stamenStyles = model.stamens.map(p => color(p.slice(4, 7)));
  model.headOrder = new Uint32Array(model.head.length);
  model.headX = new Float32Array(model.head.length);
  model.headY = new Float32Array(model.head.length);
  model.headZ = new Float32Array(model.head.length);
  return json;
}

function flowerState(time) {
  const t = Math.min(Math.max(time, 0), 30); // Stay before the original's wilt and decay keys.
  let i = 0;
  while (i < KEYS.length - 2 && t >= KEYS[i + 1][0]) i++;
  const u = (t - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]);
  const p0 = KEYS[Math.max(i - 1, 0)].slice(1);
  const p1 = KEYS[i].slice(1);
  const p2 = KEYS[i + 1].slice(1);
  const p3 = KEYS[Math.min(i + 2, KEYS.length - 1)].slice(1);
  return p1.map((_, j) => clamp(.5 * (2 * p1[j] + (p2[j] - p0[j]) * u
    + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u * u
    + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * u ** 3)));
}

function bezier(points, t) {
  const [p0, p1, p2, p3] = points;
  const q = 1 - t;
  return [
    q ** 3 * p0[0] + 3 * q * q * t * p1[0] + 3 * q * t * t * p2[0] + t ** 3 * p3[0],
    q ** 3 * p0[1] + 3 * q * q * t * p1[1] + 3 * q * t * t * p2[1] + t ** 3 * p3[1],
    3 * q * q * (p1[0] - p0[0]) + 6 * q * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * q * q * (p1[1] - p0[1]) + 6 * q * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
  ];
}

function drawPoint(flower, x, y, style, size, alpha = 1) {
  const dx = x - 500, dy = y - 800;
  const px = flower.x + (dx * flower.cos - dy * flower.sin) * flower.scale;
  const py = flower.y + (dx * flower.sin + dy * flower.cos) * flower.scale;
  const radius = Math.max(.65, size * flower.scale);
  particleCtx.fillStyle = style;
  particleCtx.globalAlpha = alpha;
  particleCtx.fillRect(px - radius * .5, py - radius * .5, radius, radius);
}

function stemCurve(values, time) {
  const [stem] = values;
  const L = 380 * stem;
  const sway = 12 * Math.sin(time * .9) * stem;
  return [[500, 804], [500 - .06 * L, 800 - .33 * L],
    [500 + .05 * L + sway * .5, 800 - .74 * L], [500 + sway, 800 - L]];
}

function drawStemAndLeaves(flower, values, time, P) {
  const [stem, , , , , leaf] = values;
  if (stem > .01) {
    const S = model.stem;
    const count = Math.floor(S.length * clamp(stem));
    for (let i = 0; i < count; i += particleStep) {
      const p = S[i], [x, y, dx, dy] = bezier(P, p[0]);
      const normal = Math.hypot(dx, dy) + 1e-6;
      const width = 8.5 * (1 - .3 * p[0]) * Math.max(.4, Math.min(1, .4 + stem * 1.2));
      const lat = p[1] * width;
      drawPoint(flower, x - dy / normal * lat, y + dx / normal * lat, model.stemStyles[i], p[5]);
    }
  }
  if (leaf > .02 && stem > .05) {
    const S = model.leaves;
    const count = Math.floor(S.length * clamp(leaf, .15, 1));
    const anchors = LEAF_DEFS.map(def => bezier(P, def[0]));
    for (let i = 0; i < count; i += particleStep) {
      const p = S[i], [anchor, side, factor, angle, bend] = LEAF_DEFS[p[0] | 0];
      const [ax, ay] = anchors[p[0] | 0];
      const u = p[1], v = p[2], length = 190 * factor * leaf;
      const a = angle + bend * u * .5, al = angle + bend * u;
      const sc = sinc(bend * u * .5);
      const lat = v * .27 * length * Math.sin(Math.PI * u ** .75) ** .85;
      const x = ax + length * u * side * Math.cos(a) * sc - lat * Math.sin(al);
      const yup = length * u * Math.sin(a) * sc + lat * side * Math.cos(al);
      drawPoint(flower, x, ay - yup, model.leafStyles[i], p[6]);
    }
  }
  return { P, hx: P[3][0], hy: P[3][1] };
}

function flowerProjection(flower, state, time, headLength) {
  const [, size, bloom] = state;
  const phi = .035 * Math.sin(time * .9 + 1);
  const tau = .20 + .36 * bloom;
  const cphi = Math.cos(phi), sphi = Math.sin(phi), ct = Math.cos(tau), st = Math.sin(tau);
  const project = (xl, yl, zl, hx, hy) => {
    const yp = yl * ct - zl * st;
    const zp = yl * st + zl * ct;
    return [hx + xl * cphi + yp * sphi, hy - (-xl * sphi + yp * cphi), zp];
  };
  return { phi, tau, cphi, sphi, ct, st, project, size, bloom, headLength };
}

function drawEffectsBack(flower, state, time, hx, hy, projection) {
  const glow = smoothstep(state[2], .12, .92);
  if (!glow) return;
  const flare = 1 + .35 * Math.exp(-Math.max(0, time - replayPulseAt) * 2.2);
  const axisX = Math.sin(projection.phi), axisY = -Math.cos(projection.phi);
  const cx = hx + axisX * .5 * projection.headLength;
  const cy = hy + axisY * .5 * projection.headLength;
  const haloCount = Math.floor(model.halo.length * glow);
  for (let i = 0; i < haloCount; i += particleStep) {
    const [a, radius, brightness, phase] = model.halo[i];
    const pulse = brightness * glow * flare * (.85 + .3 * Math.sin(time * 1.3 + phase * 6.28));
    drawPoint(flower, cx + Math.cos(a) * radius * projection.headLength * 1.1,
      cy + Math.sin(a) * radius * projection.headLength * 1.1,
      rgb(150 * pulse, 70 * pulse, 240 * pulse), 1);
  }
  const ringCount = Math.floor(model.ring.length * glow);
  const ringSize = projection.headLength * 1.25;
  for (let i = 0; i < ringCount; i += particleStep) {
    const [cf, cj, rho, a0, phase] = model.ring[i];
    const angle = 2 * Math.PI * cj / 6 + time * .15, a = a0 + time * .05;
    const pulse = flare * (.4 + .6 * glow) * (.65 + .35 * Math.sin(time * 2 + phase * 20));
    drawPoint(flower, cx + ringSize * (cf * Math.cos(angle) + rho * Math.cos(a)),
      cy + ringSize * (cf * Math.sin(angle) + rho * Math.sin(a)),
      rgb(210 * pulse, 145 * pulse, 255 * pulse), 1);
  }
}

function drawHead(flower, state, time, hx, hy) {
  const [, size, bloom] = state;
  if (size <= .05) return;
  const pr = flowerProjection(flower, state, time, 235 * size);
  const H = model.head;
  const count = Math.floor(H.length * Math.max(.2, Math.min(1, size * size * 1.15)));
  const frames = model.headOrder, xs = model.headX, ys = model.headY, zs = model.headZ;
  for (let i = 0; i < count; i++) {
    const p = H[i], u = p[4], v = p[5];
    const a0 = p[6] + (p[7] - p[6]) * bloom + p[1];
    const k = p[8] + (p[9] - p[8]) * bloom;
    const lp = pr.headLength * p[10];
    const am = a0 + k * u * .5, sc = sinc(k * u * .5);
    let rr = lp * u * Math.sin(am) * sc;
    const hh = lp * u * Math.cos(am) * sc;
    const lat = v * (p[11] + (p[12] - p[11]) * bloom) * lp * p[18];
    rr += .025 * pr.headLength - .5 * lat * lat / (lp + 1);
    const theta = p[0], projected = pr.project(Math.cos(theta) * rr - Math.sin(theta) * lat,
      hh, Math.sin(theta) * rr + Math.cos(theta) * lat, hx, hy);
    xs[i] = projected[0]; ys[i] = projected[1]; zs[i] = projected[2]; frames[i] = i;
  }
  const order = frames.subarray(0, count);
  order.sort((a, b) => zs[a] - zs[b]);
  const delta = .035 * Math.sin(time * .9 + 1), c = Math.cos(delta), s = Math.sin(delta);
  const sway = Math.sin(time * .72 + flower.x * .005) * .4;
  for (let n = 0; n < count; n += particleStep) {
    const i = order[n], p = H[i];
    const localX = xs[i] - hx, localY = ys[i] - hy;
    const x = hx + localX * c - localY * s + sway;
    const y = hy + localX * s + localY * c;
    const am = p[6] + (p[7] - p[6]) * bloom + p[1] + (p[8] + (p[9] - p[8]) * bloom) * p[4] * .5;
    const hh = pr.headLength * p[10] * p[4] * Math.cos(am) * sinc((p[8] + (p[9] - p[8]) * bloom) * p[4] * .5);
    const lit = Math.max(.5, Math.min(1.2, .72 + .28 * clamp(zs[i] / pr.headLength * .5 + .5) + .12 * hh / pr.headLength));
    drawPoint(flower, x, y, rgb(p[13] * lit, p[14] * lit, p[15] * lit), p[17]);
  }
}

function drawStamens(flower, state, time, hx, hy) {
  const [, size, bloom] = state;
  const reveal = smoothstep(bloom, .30, .85);
  if (reveal <= 0) return;
  const phi = .035 * Math.sin(time * .9 + 1), cphi = Math.cos(phi), sphi = Math.sin(phi);
  const tau = .20 + .36 * bloom, ct = Math.cos(tau), st = Math.sin(tau);
  const headLength = 235 * size;
  const count = Math.floor(model.stamens.length * Math.max(.25, Math.min(1, size * size)));
  for (let i = 0; i < count; i += particleStep) {
    const p = model.stamens[i], ell = headLength * reveal * p[2];
    const beta = p[1] * (.6 + .4 * bloom);
    const radius = ell * p[3] * Math.sin(beta) + .02 * headLength;
    const yl = .05 * headLength + ell * p[3] * Math.cos(beta);
    const localX = Math.cos(p[0]) * radius, localZ = Math.sin(p[0]) * radius;
    const yp = yl * ct - localZ * st;
    const x = hx + localX * cphi + yp * sphi;
    const y = hy - (-localX * sphi + yp * cphi);
    const pulse = .84 + .16 * Math.sin(time * 2.2 + p[3] * 8);
    drawPoint(flower, x, y, model.stamenStyles[i], p[7], pulse);
  }
}

function drawEffectsFront(flower, state, time, hx, hy, projection) {
  const glow = smoothstep(state[2], .12, .92);
  if (!glow) return;
  const flare = 1 + .35 * Math.exp(-Math.max(0, time - replayPulseAt) * 2.2);
  const axisX = Math.sin(projection.phi), axisY = -Math.cos(projection.phi);
  const cx = hx + axisX * .5 * projection.headLength;
  const cy = hy + axisY * .5 * projection.headLength;
  for (let i = 0; i < model.spark.length; i += particleStep) {
    const [a, rho, phase, speed, size, hue] = model.spark[i];
    const life = (time * .1 * speed + phase) % 1;
    const radius = (.25 + 1.15 * rho) * projection.headLength * (.6 + .6 * life);
    const alpha = Math.sin(Math.PI * life) ** .8 * glow * flare;
    drawPoint(flower, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius - life * .25 * projection.headLength,
      hue < .5 ? rgb(255 * alpha, 215 * alpha, 255 * alpha) : rgb(255 * alpha, 150 * alpha, 235 * alpha), size);
  }
  const ringSize = projection.headLength * 1.25;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * i / 3 + time * .15;
    drawPoint(flower, cx + ringSize * Math.cos(a), cy + ringSize * Math.sin(a),
      rgb(255 * glow * flare, 215 * glow * flare, 255 * glow * flare), 3);
  }
}

function drawRibbon(time, bloom) {
  const loopReveal = smoothstep(bloom, .04, .62);
  const knotReveal = smoothstep(bloom, .40, .72);
  const tailReveal = smoothstep(bloom, .56, 1);
  const tones = [[244, 169, 200], [247, 198, 220], [233, 141, 184], [255, 229, 240]];
  const bowY = 690;
  const motion = Math.sin(time * .72) * 2;

  const pointOnStroke = (path, u, index, width, phase = 0) => {
    const p = path(u);
    const before = path(Math.max(0, u - .002));
    const after = path(Math.min(1, u + .002));
    const dx = after[0] - before[0], dy = after[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    const band = ((index * 17 + phase) % 29) / 28 - .5;
    const x = p[0] - dy / length * band * width;
    const y = p[1] + dx / length * band * width;
    const tone = tones[(index * 7 + phase) % tones.length];
    const shimmer = .92 + .08 * Math.sin(time * 1.35 + index * .06 + phase);
    drawPoint(FLOWER, x, y, rgb(tone[0] * shimmer, tone[1] * shimmer, tone[2] * shimmer),
      1.3 + (index % 9 === 0 ? .9 : 0), .92 + .08 * Math.sin(time * 1.1 + phase));
  };

  const drawStroke = (path, total, reveal, width, phase) => {
    const count = Math.floor(total * clamp(reveal));
    for (let i = 0; i < count; i += particleStep) pointOnStroke(path, i / Math.max(1, total - 1), i, width, phase);
  };

  // Each loop is a pointed teardrop strip, leaving a hollow center like folded satin.
  drawStroke(u => {
    const a = u * Math.PI * 2;
    const fullness = .55 + .45 * Math.abs(Math.sin(a / 2));
    return [500 - 108 * Math.sin(a / 2), bowY + motion + 42 * fullness * Math.sin(a)];
  }, 900, loopReveal, 16, 0);
  drawStroke(u => {
    const a = u * Math.PI * 2;
    const fullness = .55 + .45 * Math.abs(Math.sin(a / 2));
    return [500 + 108 * Math.sin(a / 2), bowY + motion + 42 * fullness * Math.sin(a)];
  }, 900, loopReveal, 16, 1);

  // A rounded, shaded knot overlaps both loop tips.
  const knotCount = Math.floor(440 * knotReveal);
  for (let i = 0; i < knotCount; i += particleStep) {
    const a = i / 440 * Math.PI * 2;
    const radius = ((i * 19) % 47) / 47;
    const radiusX = (22 - 4 * Math.abs(Math.sin(a))) * radius;
    const radiusY = (17 - 3 * Math.abs(Math.cos(a))) * radius;
    const tone = tones[(i * 3) % tones.length];
    drawPoint(FLOWER, 500 + Math.cos(a) * radiusX, bowY + motion + Math.sin(a) * radiusY,
      rgb(tone[0], tone[1], tone[2]), 2, .96);
  }

  // The left strip descends and curls under into a physical J hook.
  drawStroke(u => {
    if (u < .72) return [466 + Math.sin(u * Math.PI * 2) * 2 + Math.sin(time * .62) * 2, bowY + 17 + u * (105 / .72)];
    const v = (u - .72) / .28;
    return [466 - 72 * Math.sin(v * Math.PI / 2) + Math.sin(time * .62) * 2,
      bowY + 122 + 28 * (1 - Math.cos(v * Math.PI / 2))];
  }, 760, tailReveal, 20, 2);

  // The right strip folds down, meets at the base, then rises to make a soft V.
  drawStroke(u => {
    if (u < .5) return [531 + 46 * (u * 2) + Math.sin(time * .68 + 1) * 2, bowY + 17 + 105 * (u * 2)];
    const v = (u - .5) * 2;
    return [577 + 54 * v + Math.sin(time * .68 + 1) * 2, bowY + 122 - 84 * v];
  }, 760, tailReveal, 20, 3);
}

function drawTransition(time) {
  if (!transitionAt) return;
  const elapsed = time - transitionAt;
  if (elapsed > 1.25) { transitionAt = 0; return; }
  const radius = 20 + elapsed * Math.min(width, height) * 1.1;
  const progress = 1 - elapsed / 1.25;
  const count = width < 700 ? 120 : 220;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996;
    const spread = radius * (.35 + ((i * 37) % count) / count);
    ctx.fillStyle = TRANSITION_STYLES[i % 4 ? 0 : 1];
    ctx.globalAlpha = Math.max(0, progress * (.2 + .58 * (i % 5) / 5));
    ctx.fillRect(width * .5 + Math.cos(angle) * spread, height * .5 + Math.sin(angle) * spread * .62,
      1 + (i % 3) * .45, 1 + (i % 3) * .45);
  }
  ctx.globalAlpha = 1;
}

function draw(time) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);
  drawMotes(time);
  if (data && blooming) {
    const elapsed = reduceMotion.matches ? 30 : Math.max(0, time - startedAt);
    const values = flowerState(elapsed);
    if (values[2] >= 1) everFullyBloomed = true;
    const flower = FLOWER;
    const P = stemCurve(values, time);
    const [hx, hy] = P[3];
    flowerCtx.setTransform(flowerCanvas.width / 1000, 0, 0, flowerCanvas.height / 1000, 0, 0);
    flowerCtx.globalAlpha = 1;
    flowerCtx.clearRect(0, 0, 1000, 1000);
    particleCtx = flowerCtx;
    const projection = flowerProjection(flower, values, time, 235 * values[1]);
    drawEffectsBack(flower, values, time, hx, hy, projection);
    drawStemAndLeaves(flower, values, time, P);
    drawHead(flower, values, time, hx, hy);
    drawStamens(flower, values, time, hx, hy);
    drawRibbon(time, values[2]);
    drawEffectsFront(flower, values, time, hx, hy, projection);
    flowerCtx.globalAlpha = 1;

    ctx.setTransform(...sceneTransform);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    const flowerZoom = width < 600 ? 1.12 : 1.3;
    ctx.translate(500, 460);
    ctx.scale(flowerZoom, flowerZoom);
    ctx.translate(-500, -500);
    ctx.drawImage(flowerCanvas, 0, 0, 1000, 1000);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
    particleCtx = ctx;
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTransition(time);
}

function frame(now) {
  const frameGap = lastFrame === 0 ? 0 : now - lastFrame;
  if (lastFrame === 0 || (!reduceMotion.matches && frameGap >= frameInterval)) {
    lastFrame = now;
    const frameStart = performance.now();
    draw(reduceMotion.matches ? 0 : now / 1000);
    const cost = performance.now() - frameStart;
    if (cost > 24 || frameGap > frameInterval * 1.35) {
      slowFrames++;
      fastFrames = 0;
      if (slowFrames >= 3) {
        slowFrames = 0;
        if (dpr > 1 && resolutionScale > .6) {
          resolutionScale = Math.max(.6, resolutionScale - .2);
          resize();
        } else if (particleStep === 1) particleStep = 2;
        else frameInterval = 1000 / 30;
      }
    } else if (cost < 15 && frameGap < frameInterval * 1.2) {
      fastFrames++;
      slowFrames = 0;
      if (fastFrames >= 90) {
        particleStep = 1;
        frameInterval = 1000 / 60;
        fastFrames = 0;
      }
    }
  }
  requestAnimationFrame(frame);
}

function reveal() {
  if (document.body.classList.contains('revealed')) return;
  document.body.classList.add('is-transitioning');
  transitionAt = reduceMotion.matches ? 0 : performance.now() / 1000;
  window.setTimeout(() => {
    document.body.classList.add('revealed');
    document.body.classList.remove('is-transitioning');
    bouquet.setAttribute('aria-hidden', 'false');
    replay.tabIndex = 0;
    blooming = true;
    startedAt = performance.now() / 1000 - (reduceMotion.matches ? 30 : 0);
    lastFrame = 0;
    replay.focus({ preventScroll: true });
  }, reduceMotion.matches ? 10 : 640);
}

function replayBloom() {
  startedAt = performance.now() / 1000;
  everFullyBloomed = false;
  replayPulseAt = -Infinity;
  blooming = true;
  lastFrame = 0;
}

discover.addEventListener('click', reveal);
replay.addEventListener('click', replayBloom);
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY }; }, { passive: true });
document.addEventListener('visibilitychange', () => { lastFrame = 0; });

resize();
fetch('assets/generated/flowers.json')
  .then(response => { if (!response.ok) throw new Error(`Flower data unavailable (${response.status})`); return response.json(); })
  .then(json => { data = prepareData(json); lastFrame = 0; })
  .catch(error => { console.error(error); document.querySelector('.letter').setAttribute('data-art-error', 'true'); });
requestAnimationFrame(frame);
