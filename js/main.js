import { Game, MODES } from './game.js';
import { HUD } from './hud.js';
import { Sound } from './audio.js';
import { WEAPONS, PRIMARIES, SECONDARIES, weaponBars } from './weapons.js';
import { loadModels } from './gunmodels.js';
import { MAP_IDS, MAP_INFO } from './maps.js';

const $ = (id) => document.getElementById(id);

// ---------------- settings (persisted) ----------------
const DEFAULTS = { mode: 'tdm', map: 'warehouse', primary: 'vmp', secondary: 'g18', difficulty: 'normal', sens: 1, fov: 80, vol: 0.55 };
let cfg = { ...DEFAULTS };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('ironstrike') || '{}')); } catch (e) { /* ignore */ }
if (!MODES[cfg.mode]) cfg.mode = DEFAULTS.mode;
if (!MAP_IDS.includes(cfg.map)) cfg.map = DEFAULTS.map;
if (!PRIMARIES.includes(cfg.primary)) cfg.primary = DEFAULTS.primary;
if (!SECONDARIES.includes(cfg.secondary)) cfg.secondary = DEFAULTS.secondary;
const save = () => { try { localStorage.setItem('ironstrike', JSON.stringify(cfg)); } catch (e) { /* ignore */ } };

function showFatal(msg) {
  const el = $('loaderr'); el.classList.remove('hidden');
  el.innerHTML = `<div><b>Could not start the game.</b><br>${msg}<br><br><small>If you opened index.html straight from disk, serve the folder instead (e.g. <code>python3 -m http.server</code>) and make sure you are online so Three.js can load.</small></div>`;
}

// ---------------- boot ----------------
let game, hud, sound;
try {
  hud = new HUD(); sound = new Sound();
  const settings = { sens: cfg.sens, fov: cfg.fov };
  game = new Game($('c'), hud, sound, settings);
  window.__game = game;
} catch (err) {
  console.error(err);
  showFatal(err && err.message ? err.message : String(err));
  throw err;
}

// ---------------- menu cards ----------------
function card(parent, html, selected, onClick) {
  const d = document.createElement('div'); d.className = 'card' + (selected ? ' sel' : ''); d.innerHTML = html;
  d.addEventListener('click', () => { onClick(); for (const c of parent.children) c.classList.remove('sel'); d.classList.add('sel'); save(); });
  parent.appendChild(d);
}

for (const m of Object.values(MODES)) {
  card($('modes'), `<h3>${m.name}</h3><p>${m.blurb}</p>`, cfg.mode === m.id, () => { cfg.mode = m.id; });
}
for (const id of MAP_IDS) {
  const i = MAP_INFO[id];
  card($('maps'), `<div class="thumb" style="background:${i.thumb}"></div><h3>${i.name}</h3><p>${i.desc}</p>`, cfg.map === id, () => { cfg.map = id; });
}
function weaponCard(parent, id, key) {
  const w = WEAPONS[id], bars = weaponBars(w);
  const barsHtml = Object.entries(bars).map(([k, v]) => `<div class="bar"><span>${k}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`).join('');
  card(parent, `<span class="cls">${w.cls}</span><h3>${w.name}</h3><p>${w.desc}</p><div class="bars">${barsHtml}</div>`, cfg[key] === id, () => { cfg[key] = id; });
}
for (const id of PRIMARIES) weaponCard($('primaries'), id, 'primary');
for (const id of SECONDARIES) weaponCard($('secondaries'), id, 'secondary');

for (const d of ['easy', 'normal', 'hard']) {
  const b = document.createElement('button'); b.textContent = d; if (cfg.difficulty === d) b.classList.add('sel');
  b.addEventListener('click', () => { cfg.difficulty = d; for (const c of $('difficulty').children) c.classList.remove('sel'); b.classList.add('sel'); save(); });
  $('difficulty').appendChild(b);
}

function slider(id, outId, key, fmt, apply) {
  const el = $(id), out = $(outId);
  el.value = cfg[key]; out.textContent = fmt(cfg[key]); apply(cfg[key]);
  el.addEventListener('input', () => { cfg[key] = parseFloat(el.value); out.textContent = fmt(cfg[key]); apply(cfg[key]); save(); });
}
slider('sens', 'sensOut', 'sens', (v) => v.toFixed(2), (v) => { game.settings.sens = v; });
slider('fov', 'fovOut', 'fov', (v) => String(Math.round(v)), (v) => { game.settings.fov = v; });
slider('vol', 'volOut', 'vol', (v) => v.toFixed(2), (v) => { sound.volume = v; if (sound.master) sound.master.gain.value = v; });

// ---------------- models ----------------
// Weapons with an `asset` (assets/models/<id>.json, baked from FBX) are loaded before the first match.
const startBtn = $('btnStart');
startBtn.disabled = true; startBtn.textContent = 'LOADING...';
loadModels(WEAPONS).then((ids) => console.log('[models] loaded:', ids.join(', ') || 'none (procedural fallbacks)'))
  .catch(() => {}).finally(() => { startBtn.disabled = false; startBtn.textContent = 'DEPLOY'; });

// ---------------- flow ----------------
function deploy() {
  save();
  sound.init();
  if (sound.master) sound.master.gain.value = cfg.vol;
  $('menu').classList.add('hidden'); $('endscreen').classList.add('hidden'); $('pause').classList.add('hidden');
  game.start({ mode: cfg.mode, map: cfg.map, mapName: MAP_INFO[cfg.map].name, primary: cfg.primary, secondary: cfg.secondary, difficulty: cfg.difficulty });
}
function toMenu() {
  game.state = 'menu';
  try { document.exitPointerLock(); } catch (e) { /* ignore */ }
  $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('endscreen').classList.add('hidden');
  $('menu').classList.remove('hidden');
}
$('btnStart').addEventListener('click', deploy);
$('btnAgain').addEventListener('click', deploy);
$('btnMenu').addEventListener('click', toMenu);
$('btnQuit').addEventListener('click', toMenu);
$('btnResume').addEventListener('click', () => game.resume());
document.addEventListener('keydown', (e) => { if (e.code === 'Enter' && game.state === 'menu' && !$('menu').classList.contains('hidden') && !startBtn.disabled) deploy(); });

// ---------------- loop ----------------
let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000; last = now;
  try { game.frame(dt); } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
