import * as THREE from 'three';
import { WEAPONS, PRIMARIES, SECONDARIES } from './weapons.js';
import { buildGun } from './gunmodels.js';
import { buildMap } from './maps.js';
import { Colliders, NavGraph, GRAVITY, raySphere, rayAABB } from './physics.js';
import { buildWorld } from './world.js';
import { Bot } from './bots.js';
import { makeRichtofen, richtofenReady } from './easter.js';

const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const MODES = {
  tdm: { id: 'tdm', name: 'Team Deathmatch', team: true, perSide: 5, scoreLimit: 30, time: 420, blurb: '5v5 - first team to 30 kills' },
  '1v1': { id: '1v1', name: '1v1 Duel', team: false, count: 2, scoreLimit: 10, time: 300, blurb: 'You vs one bot - first to 10 kills' },
  ffa: { id: 'ffa', name: 'Free For All', team: false, count: 8, scoreLimit: 20, time: 420, blurb: '8 players, every man for himself - first to 20' },
};

export const MAX_PLAYERS = 18;
// online matches: same modes, scaled for bigger lobbies (every peer derives the same rules from the mode id)
export const MP_OVERRIDES = {
  tdm: { scoreLimit: 50, time: 600, blurb: 'Two teams, auto-balanced - first team to 50' },
  '1v1': { blurb: 'Two players - first to 10 kills', max: 2 },
  ffa: { scoreLimit: 30, time: 600, blurb: 'Up to 18 players - first to 30' },
};
export const mpMode = (id) => ({ ...MODES[id], ...MP_OVERRIDES[id], max: (MP_OVERRIDES[id] || {}).max || MAX_PLAYERS });
const CALLSIGNS = ['Ghost', 'Viper', 'Razor', 'Havoc', 'Nova', 'Falcon', 'Rook', 'Cobra', 'Maverick', 'Reaper', 'Titan', 'Echo', 'Blaze', 'Sable', 'Onyx', 'Wolf'];
const FFA_COLORS = [0xc0392b, 0xd68910, 0x1e8449, 0x7d3c98, 0x148f77, 0xb7950b, 0xa04000, 0x2e86c1];
const TEAM_COLORS = [0x2e6fbd, 0xc0392b];
const BOT_PRIMARY_POOL = ['vmp', 'vmp', 'vmp', 'm4a1', 'm4a1', 'm4a1', 'ak47', 'ak47', 'ak47', 'm680', 'kar98k'];

export class Game {
  constructor(canvas, hud, sound, settings) {
    this.canvas = canvas; this.hud = hud; this.sound = sound; this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;

    this.camera = new THREE.PerspectiveCamera(80, 1, 0.05, 500);
    this.camera.rotation.order = 'YXZ';

    // viewmodel is drawn in its own scene on top of the world (never clips into walls)
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.6));
    const vl = new THREE.DirectionalLight(0xffffff, 2.2); vl.position.set(0.4, 1, 0.8); this.vmScene.add(vl);
    this.vmRoot = new THREE.Group(); this.vmScene.add(this.vmRoot);
    this.flashLight = new THREE.PointLight(0xffc870, 0, 3, 2); this.vmScene.add(this.flashLight);

    this.state = 'menu';
    this.keys = {}; this.fireHeld = false; this.fireEdge = false; this.adsHeld = false; this.showScore = false;
    this.mouseDX = 0; this.swayX = 0; this.swayY = 0;
    this.time = 0; this.matchT = 0;
    this.actors = []; this.player = null; this.world = null; this.scene = null;
    this.tracers = []; this.particles = [];
    this.net = null; this.hist = []; this.richtofen = false;
    this.vmCache = {};
    this.resize();
    this.bindEvents();
  }

  // ------------------------------------------------------------------ input
  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => { this.keys = {}; this.fireHeld = false; this.adsHeld = false; });
    document.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      this.keys[e.code] = true;
      if (e.code === 'Tab') { this.showScore = true; e.preventDefault(); }
      if (e.repeat) return;
      const p = this.player;
      if (!p) return;
      if (e.code === 'KeyR') this.startReload(p);
      if (e.code === 'Digit1') this.switchWeapon(p, 0);
      if (e.code === 'Digit2') this.switchWeapon(p, 1);
      if (e.code === 'KeyQ') this.switchWeapon(p, 1 - p.cur);
      if (e.code === 'KeyV') this.toggleView();
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; if (e.code === 'Tab') { this.showScore = false; e.preventDefault(); } });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (e.button === 0) { this.fireHeld = true; this.fireEdge = true; }
      if (e.button === 2) this.adsHeld = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.adsHeld = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || document.pointerLockElement !== this.canvas) return;
      const p = this.player; if (!p || !p.alive) return;
      const zoomFactor = this.camera.fov / this.settings.fov;
      const s = 0.0021 * this.settings.sens * zoomFactor;
      p.yaw -= e.movementX * s;
      p.pitch = clamp(p.pitch - e.movementY * s, -1.5, 1.5);
      this.mouseDX += e.movementX;
    });
    document.addEventListener('wheel', (e) => { if (this.state === 'playing' && this.player) this.switchWeapon(this.player, 1 - this.player.cur); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && this.state === 'playing') this.pause();
    });
    document.addEventListener('pointerlockerror', () => { if (this.state === 'playing') this.pause(); });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCam.aspect = w / h; this.vmCam.updateProjectionMatrix();
  }

  lock() { try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }

  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.keys = {}; this.fireHeld = false; this.adsHeld = false; this.hud.showPause(true); }
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; this.hud.showPause(false); this.lock(); }

  // ------------------------------------------------------------------ match setup
  start(cfg) {
    this.net = null; this.cfg = cfg;
    this.mode = MODES[cfg.mode];
    this.disposeMatch();
    this.map = buildMap(cfg.map);
    this.col = new Colliders(this.map.boxes);
    this.nav = new NavGraph(this.col, this.map.bounds, 3);
    this.world = buildWorld(this.map);
    this.scene = this.world.scene;
    this.fxGroup = new THREE.Group(); this.scene.add(this.fxGroup);
    this.initFx();

    // actors
    this.actors = [];
    const mode = this.mode;
    const mk = (id, name, team, isPlayer, prim, sec) => this.makeActor(id, name, team, isPlayer, prim, sec);
    const names = CALLSIGNS.slice().sort(() => Math.random() - 0.5);
    this.player = mk(0, 'You', 0, true, cfg.primary, cfg.secondary);
    this.actors.push(this.player);
    if (mode.team) {
      for (let i = 0; i < mode.perSide * 2 - 1; i++) this.actors.push(mk(i + 1, names[i], i < mode.perSide - 1 ? 0 : 1, false));
    } else {
      for (let i = 1; i < mode.count; i++) this.actors.push(mk(i, names[i], i, false));
    }
    for (const a of this.actors) {
      if (a.isPlayer) {
        // visible only in third-person view
        a.mesh = this.makeBotMesh(mode.team ? 0x4aa3ff : 0x27ae60, a.weapons[0], null);
        a.mesh.root.visible = false; this.scene.add(a.mesh.root);
      } else {
        const color = mode.team ? TEAM_COLORS[a.team] : FFA_COLORS[a.team % FFA_COLORS.length];
        a.mesh = this.makeBotMesh(color, a.weapons[0], mode.team && a.team === 0 ? a.name : null);
        this.scene.add(a.mesh.root);
        a.brain = new Bot(this, a, cfg.difficulty);
      }
    }
    this.teamScore = [0, 0];
    this.timeLeft = mode.time; this.matchT = -3.5; this.ended = false;
    this.killer = null; this.deathInfo = '';
    this.lastCountdown = 99;
    this.hud.begin(this);
    for (const a of this.actors) this.spawn(a, true);
    this.setPlayerVm();
    this.state = 'playing';
    this.keys = {}; this.fireHeld = false; this.adsHeld = false;
    this.lock();
    this.sound.init();
  }

  disposeMatch() {
    if (this.world) this.world.dispose();
    this.world = null; this.scene = null;
    this.tracers = []; this.particles = [];
    this.actors = [];
  }

  makeActor(id, name, team, isPlayer, prim, sec) {
    if (!prim) prim = BOT_PRIMARY_POOL[Math.floor(Math.random() * BOT_PRIMARY_POOL.length)];
    if (!sec) sec = SECONDARIES[Math.floor(Math.random() * SECONDARIES.length)];
    const weapons = [WEAPONS[prim], WEAPONS[sec]];
    return {
      id, name, team, isPlayer, pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, hw: 0.35, h: 1.8, eye: 1.65, onGround: true,
      hp: 100, alive: true, kills: 0, deaths: 0, streak: 0, weapons, weapon: weapons[0], cur: 0,
      ammo: weapons.map((w) => ({ mag: w.mag, res: w.reserve })), fireCd: 0, reloading: false, reloadT: 0, switchT: 0,
      lastShot: -99, lastHurt: -99, respawnT: 0, protT: 0, deathT: 0, stepT: 0, heat: 0, recoilDebt: 0, walkPhase: 0, crouch: false,
      ads: 0, mesh: null, brain: null, recoilKick: 0,
    };
  }

  spawn(a, first = false) {
    const nav = this.nav, map = this.map;
    let pool;
    if (this.mode.team) pool = nav.inRect(map.spawns[a.team]);
    else pool = nav.validIdx;
    let best = null, bestScore = -1;
    for (let k = 0; k < 14; k++) {
      const n = nav.nodes[pool[Math.floor(Math.random() * pool.length)]];
      let md = 1e9;
      for (const e of this.actors) {
        if (e === a || !e.alive) continue;
        if (this.mode.team && e.team === a.team) { md = Math.min(md, Math.hypot(e.pos.x - n.x, e.pos.z - n.z) * 3); continue; }
        md = Math.min(md, Math.hypot(e.pos.x - n.x, e.pos.z - n.z));
      }
      // team modes: any free spot in the spawn zone that is not crowded; FFA/duel: furthest from enemies
      const score = this.mode.team ? (md > 4 ? 100 + Math.random() * 10 : md) : md;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    const x = best.x + rand(-0.4, 0.4), z = best.z + rand(-0.4, 0.4);
    this.placeActor(a, x, z, Math.atan2(-(0 - x), -(0 - z)) + rand(-0.3, 0.3), first);
    if (this.net && this.net.role === 'host') { a.sseq = (a.sseq || 0) + 1; this.net.ev(['sp', a.id, +x.toFixed(2), +z.toFixed(2), +a.yaw.toFixed(3), a.sseq]); }
  }

  // put an actor on the map in a fresh state (shared by solo spawns, host spawns and client spawn events)
  placeActor(a, x, z, yaw, first) {
    a.pos.set(x, 0, z); a.tgt = a.remote ? new V3(x, 0, z) : null;
    a.vel.set(0, 0, 0);
    a.yaw = yaw; a.pitch = 0; a.ibuf = [];
    a.hp = 100; a.alive = true; a.reloading = false; a.reloadT = 0; a.switchT = 0.4; a.fireCd = 0.3; a.cur = 0; a.weapon = a.weapons[0];
    a.ammo = a.weapons.map((w) => ({ mag: w.mag, res: w.reserve })); a.crouch = false; a.h = 1.8; a.eye = 1.65; a.heat = 0; a.recoilDebt = 0; a.ads = 0;
    a.protT = first ? 0 : 2; a.deathT = 0; a.lastHurt = -99;
    if (a.brain) a.brain.reset();
    if (a.mesh) { a.mesh.root.visible = !a.isPlayer; a.mesh.body.rotation.x = 0; this.setActorGun(a); }
    if (a.isPlayer) { this.setPlayerVm(); this.hud.onRespawn(); if (!first) this.sound.spawn(); }
  }


  // ------------------------------------------------------------------ online play
  get isClient() { return !!this.net && this.net.role === 'client'; }
  get isHost() { return !!this.net && this.net.role === 'host'; }
  byId(id) { for (const a of this.actors) if (a.id === id) return a; return null; }

  // info: {mode, map, mapName, players:[{id,name,team,prim,sec}], me, mt, ts}
  startNet(net, info) {
    this.net = net; this.cfg = { mode: info.mode, map: info.map, mapName: info.mapName, difficulty: 'normal' };
    this.mode = mpMode(info.mode);
    this.disposeMatch();
    this.map = buildMap(info.map);
    this.col = new Colliders(this.map.boxes);
    this.nav = net.role === 'host' ? new NavGraph(this.col, this.map.bounds, 3) : null;
    this.world = buildWorld(this.map);
    this.scene = this.world.scene;
    this.fxGroup = new THREE.Group(); this.scene.add(this.fxGroup);
    this.initFx();
    this.actors = []; this.player = null; this.hist = [];
    this.myTeam = (info.players.find((p) => p.id === info.me) || { team: 0 }).team;
    for (const p of info.players) this.addNetActor(p, p.id === info.me, true);
    this.teamScore = info.ts ? info.ts.slice() : [0, 0];
    this.timeLeft = this.mode.time; this.matchT = info.mt; this.ended = false;
    this.killer = null; this.lastCountdown = 99; this.clockOff = null; this.snapT = 0; this.stT = 0;
    this.hud.begin(this);
    for (const a of this.actors) { a.alive = false; a.mesh.root.visible = false; }
    if (net.role === 'host') for (const a of this.actors) this.spawn(a, true);
    this.setPlayerVm();
    this.state = 'playing';
    this.keys = {}; this.fireHeld = false; this.adsHeld = false;
    this.lock();
    this.sound.init();
  }

  addNetActor(p, isLocal, batch) {
    const a = this.makeActor(p.id, String(p.name).replace(/[<>&"'`]/g, '').slice(0, 14), p.team, isLocal, p.prim, p.sec);
    a.remote = !isLocal; a.alive = false; a.ibuf = []; a.sseq = 0;
    const team = this.mode.team;
    const color = team ? TEAM_COLORS[p.team % 2] : FFA_COLORS[p.id % FFA_COLORS.length];
    const label = team && !isLocal && p.team === this.myTeam ? p.name : null;
    a.mesh = this.makeBotMesh(color, a.weapons[0], label);
    a.mesh.root.visible = false; this.scene.add(a.mesh.root);
    this.actors.push(a);
    if (isLocal) this.player = a;
    if (!batch && this.net.role === 'host') this.spawn(a, true);
    return a;
  }

  removeNetActor(id) {
    const a = this.byId(id); if (!a || a.isPlayer) return;
    this.scene.remove(a.mesh.root);
    this.actors = this.actors.filter((x) => x !== a);
    if (this.net && this.net.role === 'host') this.net.ev(['rm', id]);
  }

  // host: apply a state message from a remote player
  applyRemoteState(a, m) {
    if (!a.alive || this.ended || m.q !== a.sseq) return;
    if (!a.tgt) a.tgt = new V3();
    a.tgt.set(m.x, m.y, m.z);
    // reject teleports (> 14 m/s average over the gap) by snapping back instead of accepting
    a.yaw = m.yaw; a.pitch = m.pitch; a.vel.set(m.vx, 0, m.vz);
    a.crouch = !!(m.f & 1); a.h = a.crouch ? 1.25 : 1.8; a.reloading = !!(m.f & 2); a.ads = (m.f & 4) ? 1 : 0;
    const cur = (m.f >> 3) & 1;
    if (cur !== a.cur) { a.cur = cur; a.weapon = a.weapons[cur]; this.setActorGun(a); }
  }

  posAt(e, t) {
    const h = this.hist;
    if (!h.length) return { x: e.pos.x, y: e.pos.y, z: e.pos.z, h: e.h };
    let lo = null, hi = null;
    for (let i = h.length - 1; i >= 0; i--) { if (h[i].t <= t) { lo = h[i]; hi = h[i + 1] || h[i]; break; } }
    if (!lo) lo = hi = h[0];
    const A = lo.p.get(e.id), B = hi.p.get(e.id);
    if (!A) return { x: e.pos.x, y: e.pos.y, z: e.pos.z, h: e.h };
    const k = hi.t > lo.t && B ? clamp((t - lo.t) / (hi.t - lo.t), 0, 1) : 0, Bv = B || A;
    return { x: lerp(A.x, Bv.x, k), y: lerp(A.y, Bv.y, k), z: lerp(A.z, Bv.z, k), h: A.h };
  }

  recordHistory() {
    const p = new Map();
    for (const a of this.actors) p.set(a.id, { x: a.pos.x, y: a.pos.y, z: a.pos.z, h: a.h });
    this.hist.push({ t: this.time, p });
    while (this.hist.length > 90 || (this.hist.length && this.time - this.hist[0].t > 1.2)) this.hist.shift();
  }

  // host: a remote player fired. The client sends its eye position and pellet directions; we trace them against
  // where everybody was on the shooter's screen (rt), which keeps hits fair under latency.
  remoteShot(a, m) {
    if (!a.alive || this.matchT < 0 || this.ended) return;
    if (m.cur === 0 || m.cur === 1) { if (m.cur !== a.cur) { a.cur = m.cur; a.weapon = a.weapons[m.cur]; this.setActorGun(a); } }
    const w = a.weapon;
    if (a.fireCd > 0.05) return;
    a.fireCd += 60 / w.rpm; a.lastShot = this.time;
    let ox = m.ox, oy = m.oy, oz = m.oz;
    if (Math.hypot(ox - a.pos.x, oz - a.pos.z) > 3.5 || Math.abs(oy - a.pos.y - 1.5) > 2) { ox = a.pos.x; oy = a.pos.y + 1.6; oz = a.pos.z; }
    const rew = clamp(m.rt, this.time - 0.5, this.time);
    const n = Math.min(w.pellets, Math.floor(m.d.length / 3)), d = new V3(), ends = [];
    for (let i = 0; i < n; i++) {
      d.set(m.d[i * 3], m.d[i * 3 + 1], m.d[i * 3 + 2]); if (d.length() < 0.5) continue; d.normalize();
      ends.push(this.hitscan(a, ox, oy, oz, d, w, 1, rew));
    }
    this.emitShot(a, ox, oy, oz, ends, w);
  }

  emitShot(a, ox, oy, oz, ends, w) {
    const mu = { x: ox, y: oy - 0.18, z: oz };
    for (const e of ends) this.tracer(mu, e);
    if (this.net && this.net.role === 'host') {
      const f = (v) => +v.toFixed(2), ev = ['s', a.id, f(ox), f(oy), f(oz), w.id];
      for (let i = 0; i < Math.min(3, ends.length); i++) ev.push(f(ends[i].x), f(ends[i].y), f(ends[i].z));
      this.net.ev(ev);
    }
    if (!a.isPlayer) {
      const dx = a.pos.x - this.player.pos.x, dz = a.pos.z - this.player.pos.z, dist = Math.hypot(dx, dz);
      this.sound.shot(w, 1.1 / (1 + dist / 9), this.pan(dx, dz, dist));
    }
  }

  // ---- snapshots (host -> clients) ----
  buildSnap(withKd) {
    const r = (v) => Math.round(v * 100);
    const a = this.actors.map((e) => [e.id, r(e.pos.x), r(e.pos.y), r(e.pos.z), Math.round(e.yaw * 1000), Math.round(e.pitch * 1000),
      (e.alive ? 1 : 0) | (e.crouch ? 2 : 0) | (e.reloading ? 4 : 0) | (e.ads > 0.5 ? 8 : 0) | (e.cur << 4) | (e.protT > 0 ? 64 : 0), ...(withKd ? [e.kills, e.deaths] : [])]);
    return { ht: +this.time.toFixed(3), mt: +this.matchT.toFixed(2), ts: this.teamScore, a };
  }

  applySnap(s) {
    const now = performance.now() / 1000, off = s.ht - now;
    this.clockOff = this.clockOff == null || Math.abs(off - this.clockOff) > 1 ? off : this.clockOff + (off - this.clockOff) * 0.1;
    this.matchT = s.mt; this.teamScore = s.ts;
    for (const e of s.a) {
      const a = this.byId(e[0]); if (!a) continue;
      if (e.length > 7) { a.kills = e[7]; a.deaths = e[8]; }
      if (a.isPlayer) continue;
      const f = e[6], alive = !!(f & 1);
      if (alive !== a.alive) { a.alive = alive; a.deathT = 0; if (alive) a.mesh.body.rotation.x = 0; }
      a.crouch = !!(f & 2); a.reloading = !!(f & 4); a.protT = (f & 64) ? 1 : 0;
      const cur = (f >> 4) & 1;
      if (cur !== a.cur) { a.cur = cur; a.weapon = a.weapons[cur]; this.setActorGun(a); }
      a.ibuf.push({ t: s.ht, x: e[1] / 100, y: e[2] / 100, z: e[3] / 100, yaw: e[4] / 1000, pitch: e[5] / 1000 });
      if (a.ibuf.length > 12) a.ibuf.shift();
    }
  }

  // client: interpolate remote players ~100 ms behind the newest snapshot
  updateRemotes(dt) {
    if (this.clockOff == null) return;
    const rt = performance.now() / 1000 + this.clockOff - 0.13;
    this.renderT = rt;
    for (const a of this.actors) {
      if (a.isPlayer || !a.ibuf.length) continue;
      const b = a.ibuf; let i = b.length - 1;
      while (i > 0 && b[i - 1].t > rt) i--;
      const B = b[i], A = b[Math.max(0, i - 1)];
      const k = B.t > A.t ? clamp((rt - A.t) / (B.t - A.t), 0, 1) : 1;
      let dy = B.yaw - A.yaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
      const span = Math.max(0.02, B.t - A.t);
      a.vel.set((B.x - A.x) / span, 0, (B.z - A.z) / span);
      if (k >= 1) a.vel.set(0, 0, 0);
      a.pos.set(lerp(A.x, B.x, k), lerp(A.y, B.y, k), lerp(A.z, B.z, k));
      a.yaw = A.yaw + dy * k; a.pitch = lerp(A.pitch, B.pitch, k);
      a.h = a.crouch ? 1.25 : 1.8;
    }
  }

  // ---- events (host -> clients) ----
  applyEvents(list) {
    for (const e of list) {
      switch (e[0]) {
        case 's': {
          const a = this.byId(e[1]); if (!a || a.isPlayer) break;
          a.lastShot = this.time;
          const w = WEAPONS[e[5]]; if (!w) break;
          const mu = { x: e[2], y: e[3] - 0.18, z: e[4] };
          for (let i = 6; i + 2 < e.length; i += 3) this.tracer(mu, { x: e[i], y: e[i + 1], z: e[i + 2] });
          const dx = a.pos.x - this.player.pos.x, dz = a.pos.z - this.player.pos.z, dist = Math.hypot(dx, dz);
          this.sound.shot(w, 1.1 / (1 + dist / 9), this.pan(dx, dz, dist));
          break;
        }
        case 'sp': {
          const a = this.byId(e[1]); if (!a) break;
          a.sseq = e[5];
          this.placeActor(a, e[2], e[3], e[4], false);
          a.alive = true; a.deathT = 0; a.protT = 2;
          if (!a.isPlayer) a.mesh.root.visible = true;
          break;
        }
        case 'k': this.applyKill(e[1], e[2], e[3], !!e[4]); break;
        case 'h': { const a = this.byId(e[1]); if (a && this.player.alive) { this.hud.damageFrom(a, this.player); this.sound.hurt(); this.player.lastHurt = this.time; } break; }
        case 'hm': this.hud.hitmarker(!!e[1], !!e[2]); this.sound.hit(!!e[2]); break;
        case 'add': if (!this.byId(e[1].id)) this.addNetActor(e[1], false, true); break;
        case 'rm': this.removeNetActor(e[1]); break;
        case 'hp': if (this.player.alive) this.player.hp = e[1]; break;
        case 'end': this.netEnd(e[1], e[2], e[3]); break;
        default: break;
      }
    }
  }

  applyKill(kid, vid, wid, head) {
    const k = this.byId(kid), v = this.byId(vid), w = WEAPONS[wid];
    if (!k || !v || !w) return;
    v.alive = false; v.hp = 0; v.deathT = 0; v.reloading = false; v.respawnT = 3.2; v.deaths++; if (k !== v) k.kills++;
    this.hud.feed(k, v, w, head, this);
    if (v.isPlayer) { this.killer = k; this.hud.onDeath(k, w, head); this.fireHeld = false; this.adsHeld = false; }
    if (k.isPlayer && k !== v) {
      this.sound.kill();
      for (let i = 0; i < 2; i++) { const am = k.ammo[i]; am.res = Math.min(k.weapons[i].reserve, am.res + Math.ceil(k.weapons[i].mag / 2)); }
    }
  }

  netEnd(win, kd, ts) {
    if (this.ended) return;
    for (const r of kd) { const a = this.byId(r[0]); if (a) { a.kills = r[1]; a.deaths = r[2]; } }
    this.teamScore = ts; this.ended = true; this.state = 'ended';
    this.keys = {}; this.fireHeld = false; this.adsHeld = false; this.showScore = false;
    try { document.exitPointerLock(); } catch (e) { /* ignore */ }
    this.hud.showEnd(this, win);
  }

  // ------------------------------------------------------------------ meshes
  makeBotMesh(color, weapon, label) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd2a077, roughness: 0.8 });
    const box = (w, h, d, m, x, y, z, parent = body) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me; };
    box(0.5, 0.62, 0.3, mat, 0, 1.1, 0);
    box(0.52, 0.38, 0.34, dark, 0, 1.2, 0);
    box(0.22, 0.24, 0.22, skin, 0, 1.55, 0);
    box(0.28, 0.13, 0.28, dark, 0, 1.69, 0);
    const legs = [];
    for (const s of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(s * 0.13, 0.8, 0); body.add(piv); box(0.18, 0.8, 0.2, dark, 0, -0.4, 0, piv); legs.push(piv); }
    for (const s of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(s * 0.31, 1.38, 0); piv.rotation.x = 1.3; piv.rotation.y = -s * 0.25; body.add(piv); box(0.12, 0.52, 0.12, mat, 0, -0.26, 0, piv); }
    const parts = [...body.children];            // the blocky soldier (hidden while the easter egg is on)
    const gun = buildGun(weapon); gun.position.set(0.14, 1.24, -0.3); body.add(gun);
    const m = { root, body, legs, gun, gunId: weapon.id, parts, rich: null };
    if (this.richtofen && richtofenReady()) this.applyRich(m, true);
    if (label) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const c = cv.getContext('2d'); c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#5ec2ff'; c.strokeStyle = '#000'; c.lineWidth = 6;
      c.strokeText(label, 128, 44); c.fillText(label, 128, 44);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
      sp.scale.set(1.3, 0.33, 1); sp.position.set(0, 2.15, 0); root.add(sp);
    }
    return m;
  }

  // easter egg: swap an actor's blocky body for the Richtofen model
  applyRich(m, on) {
    if (on && !m.rich) { m.rich = makeRichtofen(); m.body.add(m.rich); }
    if (m.rich) m.rich.visible = on;
    for (const p of m.parts) p.visible = !on;
  }

  setRichtofen(on) {
    this.richtofen = on;
    for (const a of this.actors) if (a.mesh) this.applyRich(a.mesh, on);
  }

  // swap the gun model held by an actor's third-person body
  setActorGun(a) {
    const m = a.mesh; if (!m || m.gunId === a.weapon.id) return;
    const old = m.gun, pos = old.position.clone();
    m.body.remove(old);
    m.gun = buildGun(a.weapon); m.gun.position.copy(pos); m.body.add(m.gun); m.gunId = a.weapon.id;
  }

  toggleView(view) {
    this.settings.view = view || (this.settings.view === 'third' ? 'first' : 'third');
    if (this.state === 'playing') this.hud.center(this.settings.view === 'third' ? 'THIRD PERSON' : 'FIRST PERSON', 0.7);
    if (this.onViewChange) this.onViewChange(this.settings.view);
  }

  // distance to the first thing (world or enemy) hit by a ray - used to aim from the third-person camera
  aimDistance(o, d, self, maxD) {
    let best = this.col.ray(o.x, o.y, o.z, d.x, d.y, d.z, maxD);
    for (const e of this.actors) {
      if (!e.alive || e === self || e.team === self.team) continue;
      const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, e.pos.x, e.pos.y + e.h - 0.2, e.pos.z, 0.21);
      const tb = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, e.pos.x - 0.32, e.pos.y, e.pos.z - 0.32, e.pos.x + 0.32, e.pos.y + e.h - 0.4, e.pos.z + 0.32);
      best = Math.min(best, th, tb);
    }
    return best;
  }

  setPlayerVm() {
    const p = this.player; if (!p) return;
    for (const c of [...this.vmRoot.children]) this.vmRoot.remove(c);
    const w = p.weapon;
    if (!this.vmCache[w.id]) this.vmCache[w.id] = this.buildVm(w);
    this.vm = this.vmCache[w.id];
    this.vmRoot.add(this.vm.root);
  }

  buildVm(w) {
    const root = new THREE.Group(), gun = buildGun(w); root.add(gun);
    const u = gun.userData, G = u.grip, F = u.fore;
    const glove = new THREE.MeshStandardMaterial({ color: 0x2a2f29, roughness: 0.9 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x3b4a3a, roughness: 0.95 });
    const add = (w_, h_, d_, mt, x, y, z, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w_, h_, d_), mt); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); gun.add(me); };
    // trigger hand: palm on the grip, thumb, trigger finger, forearm back towards the camera
    add(0.048, 0.07, 0.055, glove, G.x + 0.004, G.y + 0.005, G.z);
    add(0.014, 0.026, 0.05, glove, G.x - 0.03, G.y + 0.02, G.z - 0.005, 0, 0, 0.2);          // thumb
    add(0.012, 0.012, 0.04, glove, G.x + 0.002, G.y + 0.03, G.z - 0.045);                    // trigger finger
    add(0.07, 0.07, 0.36, sleeve, G.x + 0.045, G.y - 0.07, G.z + 0.24, 0.5, 0.18, 0);
    // support hand
    if (u.pistol) {
      add(0.05, 0.06, 0.05, glove, F.x - 0.004, F.y + 0.01, F.z);
      add(0.07, 0.07, 0.34, sleeve, F.x - 0.09, F.y - 0.08, F.z + 0.22, 0.5, -0.4, 0);
    } else {
      add(0.075, 0.05, 0.1, glove, F.x, F.y - 0.045, F.z);                                    // palm under the handguard
      add(0.016, 0.05, 0.09, glove, F.x + 0.04, F.y - 0.015, F.z, 0, 0, -0.2);               // fingers around the side
      add(0.016, 0.05, 0.07, glove, F.x - 0.04, F.y - 0.015, F.z, 0, 0, 0.2);                // thumb side
      add(0.075, 0.07, 0.42, sleeve, F.x - 0.075, F.y - 0.1, F.z + 0.3, 0.38, -0.28, 0);
    }
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: this.flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    flash.position.copy(u.muzzle); flash.visible = false; gun.add(flash);
    return { root, gun, flash, sightY: u.sightY };
  }

  flashTexture() {
    if (this._flashTex) return this._flashTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 1, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.35, 'rgba(255,190,80,0.8)'); g.addColorStop(1, 'rgba(255,120,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    this._flashTex = new THREE.CanvasTexture(cv);
    return this._flashTex;
  }

  initFx() {
    const tg = new THREE.BoxGeometry(0.025, 0.025, 1);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.9, fog: false }));
      m.visible = false; m.life = 0; this.fxGroup.add(m); this.tracers.push(m);
    }
    const pg = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.visible = false; m.life = 0; m.vel = new V3(); this.fxGroup.add(m); this.particles.push(m);
    }
    this.tracerI = 0; this.partI = 0;
  }

  tracer(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    if (len < 2) return;
    const m = this.tracers[this.tracerI++ % this.tracers.length];
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.lookAt(b.x, b.y, b.z); m.scale.set(1, 1, Math.min(len, 60)); m.life = 0.07; m.visible = true; m.material.opacity = 0.9;
  }

  burst(x, y, z, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const m = this.particles[this.partI++ % this.particles.length];
      m.position.set(x, y, z); m.material.color.setHex(color);
      m.vel.set(rand(-1, 1) * speed, rand(0.2, 1.2) * speed, rand(-1, 1) * speed); m.life = rand(0.25, 0.5); m.visible = true;
    }
  }

  // ------------------------------------------------------------------ main loop
  frame(dt) {
    dt = Math.min(dt, 0.05);
    if (!this.scene) return;
    if (this.state === 'playing' || (this.net && this.state === 'paused')) this.update(dt);
    this.render(dt);
  }

  update(dt) {
    this.dt = dt;
    this.time += dt;
    this.matchT += dt;
    const p = this.player;
    // countdown
    if (this.matchT < 0) {
      const c = Math.ceil(-this.matchT);
      if (c !== this.lastCountdown) { this.lastCountdown = c; this.hud.center(String(c), 1.1); this.sound.beep(false); }
    } else if (this.lastCountdown !== 0) { this.lastCountdown = 0; this.hud.center('FIGHT!', 1.2); this.sound.beep(true); }
    else if (!this.ended) this.timeLeft = Math.max(0, this.mode.time - this.matchT);

    const client = this.isClient;
    this.updatePlayer(dt);
    if (client) this.updateRemotes(dt);
    for (const a of this.actors) {
      if (a.isPlayer) continue;
      if (client) { if (!a.alive) a.deathT += dt; continue; }
      if (a.alive) {
        if (a.brain) a.brain.update(dt);
        a.protT = Math.max(0, a.protT - dt);
        if (a.tgt) { a.pos.lerp(a.tgt, 1 - Math.exp(-22 * dt)); a.pos.y = a.tgt.y; }
      } else {
        a.deathT += dt; a.respawnT -= dt;
        if (a.respawnT <= 0 && !this.ended) this.spawn(a);
      }
    }
    for (const a of this.actors) {
      if (!a.alive) continue;
      a.fireCd -= dt; a.switchT -= dt;
      if (a.remote && a.fireCd < -0.25) a.fireCd = -0.25;
      if (a.reloading && !a.remote) { a.reloadT -= dt; if (a.reloadT <= 0) this.finishReload(a); }
      if (a.heat > 0) a.heat = Math.max(0, a.heat - dt * 3);
      if (!client && this.time - a.lastHurt > 5 && a.hp < 100) a.hp = Math.min(100, a.hp + dt * 25);
      this.stepSounds(a, dt);
      if (a.mesh) this.syncMesh(a, dt);
    }
    for (const a of this.actors) if (!a.alive && a.mesh) this.syncMesh(a, dt);
    this.updateFx(dt);

    if (!client && !this.ended) this.checkEnd();
    if (this.net) this.net.tick(dt);
    this.hud.update(this);
  }

  stepSounds(a, dt) {
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (!a.onGround || sp < 1.5 || (a.isPlayer && a.crouch)) { return; }
    a.stepT += sp * dt;
    if (a.stepT > 2.4) {
      a.stepT = 0;
      if (a.isPlayer) { this.sound.step(sp > 6 ? 0.22 : 0.12, 0); return; }
      const dx = a.pos.x - this.player.pos.x, dz = a.pos.z - this.player.pos.z, d = Math.hypot(dx, dz);
      if (d < 26) this.sound.step(0.5 / (1 + d / 4), this.pan(dx, dz, d));
    }
  }

  pan(dx, dz, d) { const y = this.player.yaw; return d > 0.1 ? (dx * Math.cos(y) - dz * Math.sin(y)) / d : 0; }

  // ------------------------------------------------------------------ actors: movement + weapons
  moveActor(a, wx, wz, speed, dt, jump, crouch) {
    const accel = a.onGround ? 11 : 2.2, k = Math.min(1, accel * dt);
    a.vel.x += (wx * speed - a.vel.x) * k;
    a.vel.z += (wz * speed - a.vel.z) * k;
    a.vel.y -= GRAVITY * dt;
    if (jump && a.onGround) { a.vel.y = 7.2; a.onGround = false; }
    if (crouch) a.h = 1.25;
    else if (a.h < 1.8 && !this.col.overlaps(a.pos.x, a.pos.y, a.pos.z, a.hw, 1.8)) a.h = 1.8;
    this.col.move(a, dt);
    a.crouch = a.h < 1.8;
  }

  canFire(a) { return a.alive && this.matchT >= 0 && a.switchT <= 0 && !a.reloading && a.fireCd <= 0 && a.ammo[a.cur].mag > 0; }

  startReload(a) {
    const am = a.ammo[a.cur], w = a.weapon;
    if (!a.alive || a.reloading || am.mag >= w.mag || (am.res <= 0 && !a.brain) || a.switchT > 0) return;
    a.reloading = true; a.reloadT = w.reload;
    if (a.isPlayer) this.sound.reload(0);
  }
  finishReload(a) {
    const am = a.ammo[a.cur], w = a.weapon;
    a.reloading = false;
    const need = w.mag - am.mag;
    if (a.brain) { am.mag = w.mag; return; }           // bots never run dry
    const take = Math.min(need, am.res); am.mag += take; am.res -= take;
    if (a.isPlayer) this.sound.reload(1);
  }
  switchWeapon(a, idx) {
    if (!a.alive || idx === a.cur || a.switchT > 0.1) return;
    a.cur = idx; a.weapon = a.weapons[idx]; a.reloading = false; a.switchT = 0.38; a.ads = 0;
    if (a.isPlayer) { this.setPlayerVm(); this.setActorGun(a); this.sound.switchGun(); }
  }

  los(a, e) {
    const ox = a.pos.x, oy = a.pos.y + 1.6, oz = a.pos.z;
    const dx = e.pos.x - ox, dy = e.pos.y + e.h * 0.62 - oy, dz = e.pos.z - oz, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.col.ray(ox, oy, oz, dx / d, dy / d, dz / d, d) >= d - 0.35;
  }

  dirFrom(yaw, pitch, out) {
    const cp = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  spreadDir(dir, s, out) {
    if (s <= 0) return out.copy(dir);
    const up = Math.abs(dir.y) > 0.95 ? new V3(1, 0, 0) : new V3(0, 1, 0);
    const r = new V3().crossVectors(dir, up).normalize(), u = new V3().crossVectors(r, dir);
    const rad = s * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
    return out.copy(dir).addScaledVector(r, Math.cos(th) * rad).addScaledVector(u, Math.sin(th) * rad).normalize();
  }

  botFire(a, errYaw, errPitch, dmgMul) {
    const dir = this.dirFrom(a.yaw + errYaw, a.pitch + errPitch, new V3());
    const w = a.weapon;
    this.fireShot(a, dir, w.cls === 'shotgun' ? w.spread : w.spread * 0.3, dmgMul);
  }

  fireShot(a, dir, spread, dmgMul = 1) {
    const w = a.weapon, am = a.ammo[a.cur];
    am.mag--; a.fireCd = 60 / w.rpm; a.lastShot = this.time;
    const eyeH = a.isPlayer ? a.eye : 1.6;
    const ox = a.pos.x, oy = a.pos.y + eyeH, oz = a.pos.z;
    const rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
    const mu = { x: ox + dir.x * 0.8 + rx * 0.2, y: oy - 0.18 + dir.y * 0.8, z: oz + dir.z * 0.8 + rz * 0.2 };
    const d = new V3(), ends = [], dirs = [];
    for (let i = 0; i < w.pellets; i++) {
      this.spreadDir(dir, spread, d);
      const end = this.hitscan(a, ox, oy, oz, d, w, dmgMul);
      this.tracer(mu, end); ends.push(end); dirs.push(+d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4));
    }
    if (this.isClient) this.net.sendShot(ox, oy, oz, dirs, a.cur, this.renderT || 0);
    else if (this.isHost) {
      const f = (v) => +v.toFixed(2), ev = ['s', a.id, f(ox), f(oy), f(oz), w.id];
      for (let i = 0; i < Math.min(3, ends.length); i++) ev.push(f(ends[i].x), f(ends[i].y), f(ends[i].z));
      this.net.ev(ev);
    }
    // sound
    if (a.isPlayer) this.sound.shot(w, 1, 0);
    else {
      const dx = a.pos.x - this.player.pos.x, dz = a.pos.z - this.player.pos.z, dist = Math.hypot(dx, dz);
      this.sound.shot(w, 1.1 / (1 + dist / 9), this.pan(dx, dz, dist));
    }
    if (am.mag <= 0 && a.isPlayer) this.hud.center('RELOAD', 0.8);
  }

  hitscan(a, ox, oy, oz, d, w, mul, rew = 0) {
    const MAXD = 160;
    let best = this.col.ray(ox, oy, oz, d.x, d.y, d.z, MAXD), victim = null, head = false;
    for (const e of this.actors) {
      if (!e.alive || e === a || e.team === a.team) continue;
      const ep = rew ? this.posAt(e, rew) : { x: e.pos.x, y: e.pos.y, z: e.pos.z, h: e.h };
      const th = raySphere(ox, oy, oz, d.x, d.y, d.z, ep.x, ep.y + ep.h - 0.2, ep.z, 0.21);
      const tb = rayAABB(ox, oy, oz, d.x, d.y, d.z, ep.x - 0.32, ep.y, ep.z - 0.32, ep.x + 0.32, ep.y + ep.h - 0.4, ep.z + 0.32);
      let t = tb, hd = false;
      if (th < tb) { t = th; hd = true; }
      if (t < best) { best = t; victim = e; head = hd; }
    }
    const px = ox + d.x * best, py = oy + d.y * best, pz = oz + d.z * best;
    if (victim) {
      const r0 = w.range[0], r1 = w.range[1];
      const f = best <= r0 ? 1 : best >= r1 ? w.minMul : lerp(1, w.minMul, (best - r0) / (r1 - r0));
      this.burst(px, py, pz, 0xb01010, 4, 2.5);
      if (!this.isClient) this.damage(victim, a, w.dmg * mul * f * (head ? w.hs : 1), w, head);
    } else if (best < MAXD) {
      this.burst(px - d.x * 0.05, py - d.y * 0.05, pz - d.z * 0.05, py < 0.08 ? this.map.impact : 0xd8d2c4, 4, 2.2);
    }
    return { x: px, y: py, z: pz };
  }

  damage(v, attacker, amount, w, head) {
    if (!v.alive || v.protT > 0 || this.ended) return;
    v.hp -= amount; v.lastHurt = this.time;
    if (v.isPlayer) { this.hud.damageFrom(attacker, this.player); this.sound.hurt(); }
    if (v.remote && this.net) this.net.evTo(v.id, ['h', attacker.id]);
    if (attacker.isPlayer) { this.hud.hitmarker(v.hp <= 0, head); this.sound.hit(head); }
    else if (attacker.remote && this.net) this.net.evTo(attacker.id, ['hm', v.hp <= 0 ? 1 : 0, head ? 1 : 0]);
    if (v.brain) v.brain.onHurt(attacker);
    if (v.hp <= 0) this.kill(v, attacker, w, head);
  }

  kill(v, k, w, head) {
    v.alive = false; v.hp = 0; v.deaths++; v.deathT = 0; v.reloading = false; v.respawnT = v.isPlayer ? 3.2 : 3;
    if (k !== v) { k.kills++; k.streak++; if (this.mode.team) this.teamScore[k.team]++; }
    v.streak = 0;
    this.hud.feed(k, v, w, head, this);
    if (this.net) this.net.ev(['k', k.id, v.id, w.id, head ? 1 : 0]);
    if (v.isPlayer) { this.killer = k; this.hud.onDeath(k, w, head); this.fireHeld = false; this.adsHeld = false; }
    if (k.isPlayer && k !== v) {
      this.sound.kill();
      for (let i = 0; i < 2; i++) { const am = k.ammo[i]; am.res = Math.min(k.weapons[i].reserve, am.res + Math.ceil(k.weapons[i].mag / 2)); }
    }
  }

  checkEnd() {
    const m = this.mode;
    let over = false;
    if (m.team) over = this.teamScore[0] >= m.scoreLimit || this.teamScore[1] >= m.scoreLimit;
    else over = this.actors.some((a) => a.kills >= m.scoreLimit);
    if (this.timeLeft <= 0 && this.matchT >= 0) over = true;
    if (over) this.endMatch();
  }

  endMatch() {
    if (this.ended) return;
    this.ended = true; this.state = 'ended';
    this.keys = {}; this.fireHeld = false; this.adsHeld = false; this.showScore = false;
    let win;
    if (this.mode.team) win = this.teamScore[0] === this.teamScore[1] ? null : (this.teamScore[0] > this.teamScore[1] ? 0 : 1);
    else {
      const sorted = [...this.actors].sort((a, b) => b.kills - a.kills);
      win = sorted.length > 1 && sorted[0].kills === sorted[1].kills ? null : sorted[0].team;
    }
    if (this.isHost) this.net.ev(['end', win, this.actors.map((a) => [a.id, a.kills, a.deaths]), this.teamScore]);
    try { document.exitPointerLock(); } catch (e) { /* ignore */ }
    this.hud.showEnd(this, win);
  }

  // ------------------------------------------------------------------ player
  updatePlayer(dt) {
    const p = this.player, k = this.keys;
    if (!p.alive) {
      p.deathT += dt; p.respawnT -= dt;
      if (p.respawnT <= 0 && !this.ended && !this.isClient) this.spawn(p);
      return;
    }
    p.protT = Math.max(0, p.protT - dt);
    const frozen = this.matchT < 0;
    const fwd = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), str = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const w = p.weapon;
    const wantCrouch = !!(k.KeyC || k.ControlLeft);
    const ads = this.adsHeld && !frozen && p.switchT <= 0 && !p.reloading;
    const sprint = !!k.ShiftLeft && fwd > 0 && !ads && !wantCrouch && !this.fireHeld;
    let speed = (sprint ? 8.0 : wantCrouch ? 2.6 : 5.2) * w.moveMul * (ads ? 0.62 : 1);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    let wx = fx * fwd + rx * str, wz = fz * fwd + rz * str;
    const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
    if (frozen) { wx = 0; wz = 0; }
    this.moveActor(p, wx, wz, speed, dt, !!k.Space && !frozen, wantCrouch);
    p.eye += ((p.crouch ? 1.12 : 1.65) - p.eye) * Math.min(1, dt * 12);
    p.ads += ((ads ? 1 : 0) - p.ads) * Math.min(1, dt * 11);
    p.sprint = sprint;
    p.speed2 = Math.hypot(p.vel.x, p.vel.z);

    // recoil recovery
    const firing = this.fireHeld && p.fireCd > -0.05;
    if (!firing && p.recoilDebt > 0) { const rec = Math.min(p.recoilDebt, dt * (0.1 + p.recoilDebt * 4)); p.pitch -= rec; p.recoilDebt -= rec; }

    // firing
    if (!frozen) {
      const want = w.auto ? this.fireHeld : this.fireEdge;
      if (want && !sprint) {
        if (p.ammo[p.cur].mag <= 0) { if (this.fireEdge) { this.sound.click(); } this.startReload(p); }
        else if (this.canFire(p)) this.playerShoot(p, ads);
      }
    }
    this.fireEdge = false;
  }

  playerShoot(p, ads) {
    const w = p.weapon;
    const moveF = clamp(p.speed2 / 6, 0, 1);
    let spread = lerp(w.spread, w.adsSpread, p.ads);
    spread *= 1 + moveF * 0.9 * (1 - p.ads * 0.5) + (p.onGround ? 0 : 2) + p.heat * 0.7;
    if (p.crouch) spread *= 0.75;
    let dir = this.dirFrom(p.yaw, p.pitch, new V3());
    if (this.tp) {
      // third person: bullets leave the player's eye but must land where the (offset) camera crosshair points
      const cp = this.camera.position, t = this.aimDistance(cp, dir, p, 150);
      const ex = p.pos.x, ey = p.pos.y + p.eye, ez = p.pos.z;
      dir = new V3(cp.x + dir.x * t - ex, cp.y + dir.y * t - ey, cp.z + dir.z * t - ez).normalize();
    }
    this.fireShot(p, dir, spread, 1);
    p.heat = Math.min(1, p.heat + 0.12);
    const kick = w.recoil * (0.8 + Math.random() * 0.4) * (1 - p.ads * 0.3);
    p.pitch = clamp(p.pitch + kick, -1.5, 1.5); p.recoilDebt += kick * 0.85;
    p.yaw += (Math.random() - 0.5) * 2 * w.recoilYaw * (1 - p.ads * 0.3);
    this.vmKick = Math.min(1.5, (this.vmKick || 0) + (w.cls === 'sniper' ? 1.5 : w.cls === 'shotgun' ? 1.2 : 0.55));
    if (this.vm) { this.vm.flash.visible = true; this.vm.flash.rotation.z = Math.random() * 6.28; const s = 0.7 + Math.random() * 0.6; this.vm.flash.scale.set(s, s, 1); }
    this.flashLight.intensity = 6; this.flashT = 0.045;
  }

  // ------------------------------------------------------------------ visuals
  syncMesh(a, dt) {
    const m = a.mesh;
    m.root.position.set(a.pos.x, a.pos.y, a.pos.z);
    m.root.rotation.y = a.yaw;
    if (a.alive) {
      const sp = Math.hypot(a.vel.x, a.vel.z);
      a.walkPhase += sp * dt * 2.2;
      const sw = sp > 0.5 ? Math.sin(a.walkPhase) * 0.8 : 0;
      m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
      if (m.rich) m.rich.position.y = sp > 0.5 ? Math.abs(Math.sin(a.walkPhase)) * 0.05 : 0;
      m.body.rotation.x = 0; m.gun.rotation.x = a.isPlayer ? 0 : a.pitch * 0.7;
      m.root.visible = true;
      if (a.protT > 0) m.root.visible = Math.floor(this.time * 12) % 2 === 0;
    } else {
      m.body.rotation.x = Math.min(1, a.deathT * 3) * (Math.PI / 2);
      m.root.visible = a.deathT < 2.6;
    }
  }

  updateFx(dt) {
    for (const t of this.tracers) { if (!t.visible) continue; t.life -= dt; if (t.life <= 0) t.visible = false; else t.material.opacity = t.life / 0.07 * 0.9; }
    for (const q of this.particles) {
      if (!q.visible) continue;
      q.life -= dt; if (q.life <= 0) { q.visible = false; continue; }
      q.vel.y -= 9 * dt; q.position.addScaledVector(q.vel, dt);
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { if (this.vm) this.vm.flash.visible = false; this.flashLight.intensity = 0; } }
  }

  render(dt) {
    const p = this.player, cam = this.camera;
    let bob = 0, roll = 0, eye = p.eye;
    if (!p.alive) { eye = Math.max(0.35, p.eye - p.deathT * 1.6); roll = Math.min(0.9, p.deathT * 2); }
    else if (p.onGround) { p.bobT = (p.bobT || 0) + (p.speed2 || 0) * dt * 1.5; bob = Math.sin(p.bobT) * 0.018 * Math.min(1, (p.speed2 || 0) / 5) * (1 - p.ads); }
    const w = p.weapon;
    const scoped = w.scope && p.ads > 0.88 && p.alive;
    this.tp = this.settings.view === 'third' && !scoped;
    cam.position.set(p.pos.x, p.pos.y + eye + bob, p.pos.z);
    if (this.tp) {
      // over-the-shoulder camera, pulled in when a wall is in the way
      const cp = Math.cos(p.pitch), fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const back = lerp(3.0, 1.9, p.ads), side = lerp(0.6, 0.45, p.ads), up = 0.25;
      const ox = p.pos.x, oy = p.pos.y + eye, oz = p.pos.z;
      let dx = -fx * back + rx * side, dy = -fy * back + up, dz = -fz * back + rz * side;
      const len = Math.hypot(dx, dy, dz); dx /= len; dy /= len; dz /= len;
      const hit = this.col.ray(ox, oy, oz, dx, dy, dz, len);
      const dist = hit < len ? Math.max(0.25, hit - 0.3) : len;
      cam.position.set(ox + dx * dist, Math.max(0.15, oy + dy * dist), oz + dz * dist);
    }
    cam.rotation.set(p.pitch, p.yaw, roll, 'YXZ');
    if (p.mesh) p.mesh.root.visible = this.tp && p.mesh.root.visible;
    const zoom = lerp(1, this.tp ? Math.min(w.zoom, 1.25) : w.zoom, p.ads);
    const fov = this.settings.fov / zoom;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.world.update(dt, cam.position);
    this.updateViewmodel(dt);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
    if (this.vmRoot.visible) { this.renderer.clearDepth(); this.renderer.render(this.vmScene, this.vmCam); }
  }

  updateViewmodel(dt) {
    const p = this.player, vm = this.vm, w = p.weapon;
    if (!vm) return;
    const scoped = w.scope && p.ads > 0.88 && p.alive;
    this.vmRoot.visible = p.alive && !scoped && !this.tp;
    this.hud.setScope(scoped);
    // kick decay, look sway
    this.vmKick = Math.max(0, (this.vmKick || 0) - dt * 9);
    this.swayX += ((-this.mouseDX * 0.0006) - this.swayX) * Math.min(1, dt * 8); this.mouseDX = 0;
    const a = p.ads;
    const hip = [0.17, -0.19, -0.45], adsP = [0, -vm.sightY, -0.38 + (w.cls === 'pistol' ? 0.06 : 0)];
    let x = lerp(hip[0], adsP[0], a), y = lerp(hip[1], adsP[1], a), z = lerp(hip[2], adsP[2], a);
    let rx = 0, ry = 0, rz = 0;
    const sp = p.speed2 || 0, t = this.time;
    if (p.onGround && sp > 0.5) { const f = Math.min(1, sp / 5) * (1 - a * 0.8) * (p.sprint ? 1.4 : 1); x += Math.sin(t * (p.sprint ? 12 : 8)) * 0.006 * f; y += Math.abs(Math.cos(t * (p.sprint ? 12 : 8))) * 0.008 * f; }
    else { y += Math.sin(t * 1.6) * 0.0015; }   // idle breathing
    z += this.vmKick * 0.035; rx += this.vmKick * 0.045 + 0;
    x += this.swayX * (1 - a * 0.6); ry += this.swayX * 0.8;
    if (p.sprint) { y -= 0.05; rx -= 0.25; ry += 0.55; x += 0.03; }
    if (p.reloading) { const ph = 1 - p.reloadT / w.reload, s = Math.sin(clamp(ph, 0, 1) * Math.PI); y -= s * 0.16; rx -= s * 0.55; rz += s * 0.35; x -= s * 0.04; }
    if (p.switchT > 0) { const s = clamp(p.switchT / 0.38, 0, 1); y -= s * 0.3; rx -= s * 0.6; }
    this.vmRoot.position.set(x, y, z); this.vmRoot.rotation.set(rx, ry, rz);
  }
}
