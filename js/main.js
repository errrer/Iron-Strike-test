import { Game, MODES, mpMode } from './game.js';
import { Net, cleanCode, cleanName } from './net.js';
import { watchForEgg } from './easter.js';
import { HUD } from './hud.js';
import { Sound } from './audio.js';
import { WEAPONS, PRIMARIES, SECONDARIES, weaponBars } from './weapons.js';
import { loadModels } from './gunmodels.js';
import { MAP_IDS, MAP_INFO } from './maps.js';

const $ = (id) => document.getElementById(id);

// ---------------- settings (persisted) ----------------
const DEFAULTS = { mode: 'tdm', map: 'warehouse', primary: 'vmp', secondary: 'g18', difficulty: 'normal', sens: 1, fov: 80, vol: 0.55, view: 'first', name: '' };
let cfg = { ...DEFAULTS };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('ironstrike') || '{}')); } catch (e) { /* ignore */ }
if (!MODES[cfg.mode]) cfg.mode = DEFAULTS.mode;
if (!MAP_IDS.includes(cfg.map)) cfg.map = DEFAULTS.map;
if (!PRIMARIES.includes(cfg.primary)) cfg.primary = DEFAULTS.primary;
if (!SECONDARIES.includes(cfg.secondary)) cfg.secondary = DEFAULTS.secondary;
if (!cfg.name) cfg.name = 'Player' + Math.floor(100 + Math.random() * 900);
if (cfg.view !== 'first' && cfg.view !== 'third') cfg.view = 'first';
const save = () => { try { localStorage.setItem('ironstrike', JSON.stringify(cfg)); } catch (e) { /* ignore */ } };

function showFatal(msg) {
  const el = $('loaderr'); el.classList.remove('hidden');
  el.innerHTML = `<div><b>Could not start the game.</b><br>${msg}<br><br><small>If you opened index.html straight from disk, serve the folder instead (e.g. <code>python3 -m http.server</code>) and make sure you are online so Three.js can load.</small></div>`;
}

// ---------------- boot ----------------
let game, hud, sound;
try {
  hud = new HUD(); sound = new Sound();
  const settings = { sens: cfg.sens, fov: cfg.fov, view: cfg.view };
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

// each setting has a control in the main menu and one in the pause menu; they stay in sync
function slider(ids, key, fmt, apply) {
  const sync = () => { for (const [id, outId] of ids) { $(id).value = cfg[key]; $(outId).textContent = fmt(cfg[key]); } };
  sync(); apply(cfg[key]);
  for (const [id] of ids) $(id).addEventListener('input', () => { cfg[key] = parseFloat($(id).value); sync(); apply(cfg[key]); save(); });
}
slider([['sens', 'sensOut'], ['sens2', 'sensOut2']], 'sens', (v) => v.toFixed(2), (v) => { game.settings.sens = v; });
slider([['fov', 'fovOut'], ['fov2', 'fovOut2']], 'fov', (v) => String(Math.round(v)), (v) => { game.settings.fov = v; });
slider([['vol', 'volOut'], ['vol2', 'volOut2']], 'vol', (v) => v.toFixed(2), (v) => { sound.volume = v; if (sound.master) sound.master.gain.value = v; });

// camera view toggle (main menu + pause menu + V key in game)
const viewBtns = [];
for (const seg of document.querySelectorAll('.viewseg')) {
  for (const [v, label] of [['first', 'First person'], ['third', 'Third person']]) {
    const b = document.createElement('button'); b.textContent = label; b.dataset.view = v;
    b.addEventListener('click', () => game.toggleView(v));
    seg.appendChild(b); viewBtns.push(b);
  }
}
function showView(v) { cfg.view = v; for (const b of viewBtns) b.classList.toggle('sel', b.dataset.view === v); save(); }
game.onViewChange = showView;
showView(cfg.view);

// ---------------- models ----------------
// Weapons with an `asset` (assets/models/<id>.json, baked from FBX) are loaded before the first match.
const startBtn = $('btnStart');
startBtn.disabled = true; startBtn.textContent = 'LOADING...';
loadModels(WEAPONS).then((ids) => console.log('[models] loaded:', ids.join(', ') || 'none (procedural fallbacks)'))
  .catch(() => {}).finally(() => { startBtn.disabled = false; startBtn.textContent = 'DEPLOY'; });

// ---------------- flow ----------------
function deploy() {
  save(); resetMpUi();
  sound.init();
  if (sound.master) sound.master.gain.value = cfg.vol;
  $('menu').classList.add('hidden'); $('endscreen').classList.add('hidden'); $('pause').classList.add('hidden');
  game.start({ mode: cfg.mode, map: cfg.map, mapName: MAP_INFO[cfg.map].name, primary: cfg.primary, secondary: cfg.secondary, difficulty: cfg.difficulty });
}
function toMenu() {
  if (net) { net.leave(); net = null; resetMpUi(); }
  game.net = null; game.state = 'menu';
  try { document.exitPointerLock(); } catch (e) { /* ignore */ }
  $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('endscreen').classList.add('hidden');
  $('menu').classList.remove('hidden');
}
$('btnStart').addEventListener('click', deploy);
$('btnAgain').addEventListener('click', () => {
  if (!net) return deploy();
  if (net.role === 'host') net.toLobby();
  $('endscreen').classList.add('hidden'); $('hud').classList.add('hidden');
  $('mp').classList.remove('hidden'); mpShow('lobby'); renderLobby(net.lobby);
});
$('btnMenu').addEventListener('click', toMenu);
$('btnQuit').addEventListener('click', toMenu);
$('btnResume').addEventListener('click', () => game.resume());
document.addEventListener('keydown', (e) => { if (e.code === 'Enter' && game.state === 'menu' && !$('menu').classList.contains('hidden') && $('mp').classList.contains('hidden') && !startBtn.disabled) deploy(); });

// ---------------- multiplayer ----------------
let net = null;
const mpShow = (w) => { $('mpHome').classList.toggle('hidden', w !== 'home'); $('mpLobby').classList.toggle('hidden', w !== 'lobby'); };
function mpStatus(id, text, err) { const el = $(id); el.textContent = text || ''; el.classList.toggle('err', !!err); }
function resetMpUi() { $('btnAgain').textContent = 'Play again'; $('pauseTitle').textContent = 'PAUSED'; $('btnQuit').textContent = 'Quit to menu'; }

function fillSelect(id, items) { const el = $(id); for (const [v, label] of items) { const o = document.createElement('option'); o.value = v; o.textContent = label; el.appendChild(o); } }
fillSelect('mpMode', Object.values(MODES).map((m) => [m.id, m.name]));
fillSelect('mpMap', MAP_IDS.map((id) => [id, MAP_INFO[id].name]));
fillSelect('mpPrim', PRIMARIES.map((id) => [id, WEAPONS[id].name]));
fillSelect('mpSec', SECONDARIES.map((id) => [id, WEAPONS[id].name]));
$('mpPrim').value = cfg.primary; $('mpSec').value = cfg.secondary; $('mpName').value = cfg.name;

function renderLobby(st) {
  if (!net || !st) return;
  const host = net.role === 'host';
  $('mpCodeTxt').textContent = net.code;
  $('mpMode').value = st.mode; $('mpMap').value = st.map;
  $('mpMode').disabled = !host; $('mpMap').disabled = !host;
  $('mpCount').textContent = `${st.players.length} / ${st.max}`;
  $('mpInfo').textContent = `${mpMode(st.mode).blurb}${host ? '' : ' (the host picks mode and map)'}`;
  const tbl = $('mpPlayers'); tbl.textContent = '';
  const head = tbl.insertRow(); for (const h of ['Player', 'Team', 'Loadout']) { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); }
  const team = mpMode(st.mode).team;
  for (const p of st.players) {
    const r = tbl.insertRow(); r.className = (team ? 't' + (p.team % 2) : '') + (p.id === net.myId ? ' me' : '');
    r.insertCell().textContent = p.name + (p.id === 0 ? ' (host)' : '') + (p.id === net.myId ? ' (you)' : '');
    r.insertCell().textContent = team ? (p.team % 2 === 0 ? 'Blue' : 'Red') : '-';
    r.insertCell().textContent = `${(WEAPONS[p.prim] || {}).name} / ${(WEAPONS[p.sec] || {}).name}`;
  }
  $('mpStart').classList.toggle('hidden', !host);
  $('mpStart').disabled = st.players.length < 2;
  mpStatus('mpLStatus', host ? (st.players.length < 2 ? 'Waiting for players - share the room code.' : '') : (st.inMatch ? 'A match is in progress...' : 'Waiting for the host to start the match...'));
}

const mpUi = {
  lobby: (st) => renderLobby(st),
  started: () => {
    for (const id of ['mp', 'menu', 'endscreen', 'pause']) $(id).classList.add('hidden');
    $('btnAgain').textContent = 'Back to lobby'; $('pauseTitle').textContent = 'MENU'; $('btnQuit').textContent = 'Leave match';
  },
  closed: (why) => {
    net = null; game.net = null; game.state = 'menu'; resetMpUi();
    try { document.exitPointerLock(); } catch (e) { /* ignore */ }
    for (const id of ['hud', 'pause', 'endscreen']) $(id).classList.add('hidden');
    $('menu').classList.remove('hidden'); $('mp').classList.remove('hidden'); mpShow('home'); mpStatus('mpStatus', why, true);
  },
};
const loadout = () => ({ prim: cfg.primary, sec: cfg.secondary });
const myName = () => { cfg.name = cleanName($('mpName').value); $('mpName').value = cfg.name; save(); return cfg.name; };

$('btnMP').addEventListener('click', () => { $('mp').classList.remove('hidden'); mpShow(net ? 'lobby' : 'home'); mpStatus('mpStatus', ''); });
$('mpBack').addEventListener('click', () => $('mp').classList.add('hidden'));
$('mpCode').addEventListener('input', () => { $('mpCode').value = cleanCode($('mpCode').value); });
$('mpCode').addEventListener('keydown', (e) => { if (e.code === 'Enter') $('mpJoinBtn').click(); });
function busy(on) { for (const id of ['mpHostBtn', 'mpJoinBtn']) $(id).disabled = on; }
$('mpHostBtn').addEventListener('click', async () => {
  busy(true); mpStatus('mpStatus', 'Creating room...');
  net = new Net(game, mpUi);
  try { await net.host(myName(), loadout(), cfg.mode, cfg.map); mpShow('lobby'); renderLobby(net.lobby); }
  catch (e) { try { net.leave(); } catch (x) { /* ignore */ } net = null; mpStatus('mpStatus', (e && e.message) || 'Could not create a room.', true); }
  busy(false);
});
$('mpJoinBtn').addEventListener('click', async () => {
  busy(true); mpStatus('mpStatus', 'Connecting...');
  net = new Net(game, mpUi);
  try { await net.join($('mpCode').value, myName(), loadout()); mpStatus('mpStatus', ''); mpShow('lobby'); if (net.lobby) renderLobby(net.lobby); }
  catch (e) { net = null; mpStatus('mpStatus', (e && e.message) || 'Could not join.', true); }
  busy(false);
});
$('mpMode').addEventListener('change', () => { const err = net && net.setMode($('mpMode').value); if (err) { mpStatus('mpLStatus', err, true); renderLobby(net.lobby); } });
$('mpMap').addEventListener('change', () => net && net.setMap($('mpMap').value));
for (const [id, key] of [['mpPrim', 'primary'], ['mpSec', 'secondary']]) $(id).addEventListener('change', () => { cfg[key] = $(id).value; save(); if (net) net.setLoadout(cfg.primary, cfg.secondary); });
$('mpStart').addEventListener('click', () => { const err = net && net.start(); if (err) mpStatus('mpLStatus', err, true); });
$('mpLeave').addEventListener('click', () => { if (net) net.leave(); net = null; mpShow('home'); mpStatus('mpStatus', ''); });
$('mpCopy').addEventListener('click', () => {
  const code = net ? net.code : '';
  const done = () => { $('mpCopy').textContent = 'Copied'; setTimeout(() => { $('mpCopy').textContent = 'Copy'; }, 1500); };
  try { navigator.clipboard.writeText(code).then(done, () => {}); } catch (e) { /* ignore */ }
});
window.addEventListener('beforeunload', () => { if (net) net.leave(); });
window.__mp = { get net() { return net; }, mpUi };

// ---------------- easter egg: type "richtofen" ----------------
function toast(text) {
  let t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = text; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
watchForEgg(() => { game.setRichtofen(!game.richtofen); toast(game.richtofen ? 'EASTER EGG ACTIVATED' : 'EASTER EGG OFF'); });

// ---------------- loop ----------------
let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000; last = now;
  try { game.frame(dt); } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
