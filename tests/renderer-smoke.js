const fs = require('node:fs');
const vm = require('node:vm');

const data = JSON.parse(fs.readFileSync('assets/generated/flowers.json', 'utf8'));
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const model = data.model;
if (data.version !== 3 || model.head.length !== 20620 || model.stem.length !== 3600 || model.leaves.length !== 3600) {
  throw Error('Expected the original flower.py particle model');
}
if ('ground' in data || 'fall' in model) throw Error('Unexpected ground or decay layer');
if (!html.includes('>˗ˋˏ♡ˎˊ˗</button>') || !html.includes('Para mi niña chikita jodida')
  || !html.includes('Cada mes te amo, cada mes te pienso') || !html.includes('Te amo muchísimo amorcito &gt;u&lt; ♡')
  || !html.includes('>ʚ♡ɞ</button>')
  || !html.includes('⋆˚｡⋆୨ TE AMO₊˚୨♡୧˚₊TE QUIERO₊˚୨♡୧˚₊TE ADORO ୧⋆˚｡⋆')
  || !css.includes('@keyframes button-pulse')) {
  throw Error('Exact letter content or pulse animation missing');
}

let draws = 0;
let flowerCopies = 0;
let raf;
let clock = 10_000;
const transforms = [];
const context = {
  setTransform(...values) { transforms.push(values); }, clearRect() {}, save() {}, restore() {}, translate() {}, scale() {},
  fillRect(...args) {
    if (args.some(value => !Number.isFinite(value)) || args[2] <= 0 || args[3] <= 0) throw Error('Invalid particle coordinates');
    draws++;
  },
  drawImage() { flowerCopies++; }, rotate() {},
};
const listeners = {};
const windowListeners = {};
const element = () => ({
  style: {}, tabIndex: -1,
  addEventListener(type, callback) { (listeners[this.name] ??= {})[type] = callback; },
  focus() {}, setAttribute() {}, getContext() { return context; },
});
const elements = Object.fromEntries(['#artwork', '#discover', '#replay', '#bouquet-screen', '.letter'].map(name => {
  const node = element(); node.name = name; return [name, node];
}));
const classes = new Set();
const document = {
  querySelector: selector => elements[selector],
  createElement: () => element(),
  body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } },
  addEventListener() {},
};
const window = { innerWidth: 1280, innerHeight: 900, devicePixelRatio: 2,
  addEventListener: (name, callback) => { windowListeners[name] = callback; }, setTimeout: callback => callback() };
const app = {
  document, window, performance: { now: () => clock }, matchMedia: () => ({ matches: false }),
  requestAnimationFrame: callback => { raf = callback; },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(data) }), console,
};

vm.runInNewContext(fs.readFileSync('js/main.js', 'utf8'), app);
if (elements['#artwork'].width !== 2560 || elements['#artwork'].height !== 1800
  || elements['#artwork'].style.width !== '1280px' || transforms.at(-1)[0] !== 2) {
  throw Error('Desktop DPR backing dimensions are incorrect');
}

(async () => {
  await new Promise(setImmediate);
  listeners['#discover'].click();
  const beforeOpening = draws;
  raf(18_000); // The original's intermediate closed-to-open stage.
  const openingDraws = draws - beforeOpening;
  if (openingDraws < 5_000) throw Error('The original staged bloom did not render its intermediate growth');

  const beforeFullBloom = draws;
  raf(34_000); // The source reaches full bloom at 24 seconds.
  const fullBloomDraws = draws - beforeFullBloom;
  if (fullBloomDraws <= openingDraws || fullBloomDraws < 10_000 || flowerCopies !== 2) {
    throw Error(`Expected one copy of the fully bloomed original particle flower; drew ${fullBloomDraws} particles`);
  }

  const beforeHold = draws;
  raf(100_000);
  if (draws - beforeHold !== fullBloomDraws || flowerCopies !== 3) throw Error('The full-blossom flower changed or decayed over time');

  clock = 100_000;
  listeners['#replay'].click();
  const beforeReplay = draws;
  raf(101_000);
  const replayOpening = draws - beforeReplay;
  if (replayOpening <= 0 || replayOpening >= fullBloomDraws || flowerCopies !== 4) throw Error('Replay did not progressively reform the flower and ribbon');
  raf(130_000);
  if (draws - beforeReplay <= replayOpening || flowerCopies !== 5) throw Error('Replay did not reach the permanent full blossom');

  window.innerWidth = 390;
  window.innerHeight = 844;
  window.devicePixelRatio = 3;
  windowListeners.resize();
  if (elements['#artwork'].width !== 1170 || elements['#artwork'].height !== 2532
    || elements['#artwork'].style.width !== '390px' || transforms.at(-1)[0] !== 3) {
    throw Error('Mobile DPR backing dimensions are incorrect');
  }
  const beforeMobile = draws;
  raf(130_040);
  if (draws - beforeMobile < 10_000 || flowerCopies !== 6) throw Error('Mobile resize did not render the permanent flower');
  console.log(`Original flower.py bloom OK: ${openingDraws} opening / ${fullBloomDraws} full particles; one flower persists on replay and resize.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
