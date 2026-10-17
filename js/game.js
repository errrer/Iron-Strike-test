import * as THREE from 'three';
import { WEAPONS, buildGun, PRIMARIES, SECONDARIES } from './weapons.js';
import { buildMap } from './maps.js';
import { Colliders, NavGraph, GRAVITY, raySphere, rayAABB } from './physics.js';
import { buildWorld } from './world.js';
import { Bot } from './bots.js';

const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const MODES = {
  tdm: { id: 'tdm', name: 'Team Deathmatch', team: true, perSide: 5, scoreLimit: 30, time: 420, blurb: '5v5 - first team to 30 kills' },
  '1v1': { id: '1v1', name: '1v1 Duel', team: false, count: 2, scoreLimit: 10, time: 300, blurb: 'You vs one bot - first to 10 kills' },
  ffa: { id: 'ffa', name: 'Free For All', team: false, count: 8, scoreLimit: 20, time: 420, blurb: '8 players, every man for himself - first to 20' },
};

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
    this.cfg = cfg;
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
      if (!a.isPlayer) {
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
    a.pos.set(best.x + rand(-0.4, 0.4), 0, best.z + rand(-0.4, 0.4));
    a.vel.set(0, 0, 0);
    a.yaw = Math.atan2(-(0 - a.pos.x), -(0 - a.pos.z)) + rand(-0.3, 0.3); a.pitch = 0;
    a.hp = 100; a.alive = true; a.reloading = false; a.reloadT = 0; a.switchT = 0.4; a.fireCd = 0.3; a.cur = 0; a.weapon = a.weapons[0];
    a.ammo = a.weapons.map((w) => ({ mag: w.mag, res: w.reserve })); a.crouch = false; a.h = 1.8; a.eye = 1.65; a.heat = 0; a.recoilDebt = 0; a.ads = 0;
    a.protT = first ? 0 : 2; a.deathT = 0; a.lastHurt = -99;
    if (a.brain) { a.brain.reset(); a.mesh.root.visible = true; a.mesh.body.rotation.x = 0; }
    if (a.isPlayer) { this.setPlayerVm(); this.hud.onRespawn(); if (!first) this.sound.spawn(); }
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
    const gun = buildGun(weapon); gun.position.set(0.14, 1.24, -0.3); body.add(gun);
    if (label) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const c = cv.getContext('2d'); c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#5ec2ff'; c.strokeStyle = '#000'; c.lineWidth = 6;
      c.strokeText(label, 128, 44); c.fillText(label, 128, 44);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
      sp.scale.set(1.3, 0.33, 1); sp.position.set(0, 2.15, 0); root.add(sp);
    }
    return { root, body, legs };
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
    const glove = new THREE.MeshStandardMaterial({ color: 0x2b3028, roughness: 0.9 }), sleeve = new THREE.MeshStandardMaterial({ color: 0x3b4a3a, roughness: 0.95 });
    const m = w.model;
    const add = (geo, mat, x, y, z, rx = 0, ry = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.rotation.set(rx, ry, 0); gun.add(me); };
    const lz = m.pistol ? 0.05 : -(m.bodyL / 2 + (m.hand || 0.1) * 0.5) + 0.03;
    // support hand + forearm
    if (m.pistol) { add(new THREE.BoxGeometry(0.06, 0.07, 0.09), glove, -0.03, -0.075, 0.07); add(new THREE.BoxGeometry(0.07, 0.07, 0.3), sleeve, -0.1, -0.14, 0.22, 0.2, -0.35); }
    else { add(new THREE.BoxGeometry(0.075, 0.075, 0.12), glove, -0.012, -m.bodyH / 2 - 0.035, lz); add(new THREE.BoxGeometry(0.075, 0.075, 0.38), sleeve, -0.1, -m.bodyH / 2 - 0.1, lz + 0.26, 0.3, -0.3); }
    // trigger hand + forearm
    add(new THREE.BoxGeometry(0.065, 0.09, 0.075), glove, 0.005, -m.bodyH / 2 - m.gripH * 0.5, m.bodyL * 0.28 + 0.01);
    add(new THREE.BoxGeometry(0.075, 0.075, 0.38), sleeve, 0.07, -m.bodyH / 2 - m.gripH - 0.04, m.bodyL * 0.28 + 0.26, 0.45, 0.2);
    const tex = this.flashTexture();
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    flash.position.copy(gun.userData.muzzle); flash.visible = false; gun.add(flash);
    return { root, gun, flash, sightY: gun.userData.sightY };
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
    if (this.state === 'playing') this.update(dt);
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

    this.updatePlayer(dt);
    for (const a of this.actors) {
      if (a.isPlayer) continue;
      if (a.alive) {
        a.brain.update(dt);
        a.protT = Math.max(0, a.protT - dt);
      } else {
        a.deathT += dt; a.respawnT -= dt;
        if (a.respawnT <= 0 && !this.ended) this.spawn(a);
      }
    }
    for (const a of this.actors) {
      if (!a.alive) continue;
      a.fireCd -= dt; a.switchT -= dt;
      if (a.reloading) { a.reloadT -= dt; if (a.reloadT <= 0) this.finishReload(a); }
      if (a.heat > 0) a.heat = Math.max(0, a.heat - dt * 3);
      if (this.time - a.lastHurt > 5 && a.hp < 100) a.hp = Math.min(100, a.hp + dt * 25);
      this.stepSounds(a, dt);
      if (a.mesh) this.syncMesh(a, dt);
    }
    for (const a of this.actors) if (!a.alive && a.mesh) this.syncMesh(a, dt);
    this.updateFx(dt);

    if (!this.ended) this.checkEnd();
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
    if (a.isPlayer) { this.setPlayerVm(); this.sound.switchGun(); }
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
    const d = new V3();
    for (let i = 0; i < w.pellets; i++) {
      this.spreadDir(dir, spread, d);
      const end = this.hitscan(a, ox, oy, oz, d, w, dmgMul);
      this.tracer(mu, end);
    }
    // sound
    if (a.isPlayer) this.sound.shot(w, 1, 0);
    else {
      const dx = a.pos.x - this.player.pos.x, dz = a.pos.z - this.player.pos.z, dist = Math.hypot(dx, dz);
      this.sound.shot(w, 1.1 / (1 + dist / 9), this.pan(dx, dz, dist));
    }
    if (am.mag <= 0 && a.isPlayer) this.hud.center('RELOAD', 0.8);
  }

  hitscan(a, ox, oy, oz, d, w, mul) {
    const MAXD = 160;
    let best = this.col.ray(ox, oy, oz, d.x, d.y, d.z, MAXD), victim = null, head = false;
    for (const e of this.actors) {
      if (!e.alive || e === a || e.team === a.team) continue;
      const th = raySphere(ox, oy, oz, d.x, d.y, d.z, e.pos.x, e.pos.y + e.h - 0.2, e.pos.z, 0.21);
      const tb = rayAABB(ox, oy, oz, d.x, d.y, d.z, e.pos.x - 0.32, e.pos.y, e.pos.z - 0.32, e.pos.x + 0.32, e.pos.y + e.h - 0.4, e.pos.z + 0.32);
      let t = tb, hd = false;
      if (th < tb) { t = th; hd = true; }
      if (t < best) { best = t; victim = e; head = hd; }
    }
    const px = ox + d.x * best, py = oy + d.y * best, pz = oz + d.z * best;
    if (victim) {
      const r0 = w.range[0], r1 = w.range[1];
      const f = best <= r0 ? 1 : best >= r1 ? w.minMul : lerp(1, w.minMul, (best - r0) / (r1 - r0));
      this.burst(px, py, pz, 0xb01010, 4, 2.5);
      this.damage(victim, a, w.dmg * mul * f * (head ? w.hs : 1), w, head);
    } else if (best < MAXD) {
      this.burst(px - d.x * 0.05, py - d.y * 0.05, pz - d.z * 0.05, py < 0.08 ? this.map.impact : 0xd8d2c4, 4, 2.2);
    }
    return { x: px, y: py, z: pz };
  }

  damage(v, attacker, amount, w, head) {
    if (!v.alive || v.protT > 0 || this.ended) return;
    v.hp -= amount; v.lastHurt = this.time;
    if (v.isPlayer) { this.hud.damageFrom(attacker, this.player); this.sound.hurt(); }
    if (attacker.isPlayer) { this.hud.hitmarker(v.hp <= 0, head); this.sound.hit(head); }
    if (v.brain) v.brain.onHurt(attacker);
    if (v.hp <= 0) this.kill(v, attacker, w, head);
  }

  kill(v, k, w, head) {
    v.alive = false; v.hp = 0; v.deaths++; v.deathT = 0; v.reloading = false; v.respawnT = v.isPlayer ? 3.2 : 3;
    if (k !== v) { k.kills++; k.streak++; if (this.mode.team) this.teamScore[k.team]++; }
    v.streak = 0;
    this.hud.feed(k, v, w, head, this);
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
      win = sorted[0].kills === sorted[1].kills ? null : sorted[0].team;
    }
    try { document.exitPointerLock(); } catch (e) { /* ignore */ }
    this.hud.showEnd(this, win);
  }

  // ------------------------------------------------------------------ player
  updatePlayer(dt) {
    const p = this.player, k = this.keys;
    if (!p.alive) {
      p.deathT += dt; p.respawnT -= dt;
      if (p.respawnT <= 0 && !this.ended) this.spawn(p);
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
    const dir = this.dirFrom(p.yaw, p.pitch, new V3());
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
      m.body.rotation.x = 0;
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
    cam.position.set(p.pos.x, p.pos.y + eye + bob, p.pos.z);
    cam.rotation.set(p.pitch, p.yaw, roll, 'YXZ');
    const w = p.weapon;
    const zoom = lerp(1, w.zoom, p.ads);
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
    this.vmRoot.visible = p.alive && !scoped;
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
