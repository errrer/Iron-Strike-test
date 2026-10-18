// Peer-to-peer multiplayer (WebRTC via PeerJS). No game server is needed, so it works on GitHub Pages.
//
//   HOST   = the player who creates the room. Runs the match (bullets, damage, kills, scores, spawns) and
//            streams snapshots (20/s) and events to everybody. Room code = the PeerJS id suffix.
//   CLIENT = everyone else. Moves locally (instant controls), sends its state (30/s) and shots to the host,
//            and renders the other players interpolated ~100 ms in the past from host snapshots.
//
// Hits are resolved by the host with lag compensation (targets are rewound to what the shooter saw).
// Movement is client-trusted, so this is meant for playing with friends, not for ranked play.
import { MODES, MAX_PLAYERS, mpMode } from './game.js';
import { MAP_IDS, MAP_INFO } from './maps.js';

const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'ironstrike-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';           // 6-letter room codes (no I / O so they cannot be misread)
const PROTOCOL = 1;

export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
export const cleanName = (s) => (String(s || '').replace(/[<>&"'`]/g, '').trim().slice(0, 14)) || 'Player';
const genCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

export function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = PEER_URL; s.async = true;
    s.onload = () => (window.Peer ? res() : rej(new Error('PeerJS did not load')));
    s.onerror = () => rej(new Error('Could not load the networking library. Are you online?'));
    document.head.appendChild(s);
  });
}

function openPeer(id) {
  return new Promise((res, rej) => {
    let done = false;
    const p = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
    const t = setTimeout(() => { if (!done) { done = true; try { p.destroy(); } catch (e) { /* ignore */ } rej(new Error('Could not reach the matchmaking server.')); } }, 15000);
    p.on('open', () => { if (!done) { done = true; clearTimeout(t); res(p); } });
    p.on('error', (e) => { if (!done) { done = true; clearTimeout(t); try { p.destroy(); } catch (x) { /* ignore */ } rej(e); } });
  });
}

export class Net {
  constructor(game, ui) {
    this.game = game; this.ui = ui;
    this.role = null; this.code = ''; this.ping = 0;
    this.peer = null; this.conn = null; this.conns = new Map(); this.players = new Map();
    this.mode = 'tdm'; this.map = MAP_IDS[0]; this.lobby = null;
    this.evAll = []; this.evMap = new Map(); this.nextId = 1; this.snapAcc = 0; this.stAcc = 0; this.pingAcc = 0;
  }

  get active() { return !!this.role; }
  live() { return this.game.net === this && (this.game.state === 'playing' || this.game.state === 'paused'); }

  // ================================================================== HOST
  async host(name, loadout, mode, map) {
    await loadPeerLib();
    let code = '', peer = null;
    for (let i = 0; i < 8 && !peer; i++) {
      code = genCode();
      try { peer = await openPeer(PREFIX + code); } catch (e) { if (!e || e.type !== 'unavailable-id') throw e; }
    }
    if (!peer) throw new Error('Could not reserve a room code, try again.');
    this.role = 'host'; this.code = code; this.peer = peer; this.mode = mode; this.map = map;
    this.players.set(0, { id: 0, name: cleanName(name), prim: loadout.prim, sec: loadout.sec, team: 0 });
    peer.on('connection', (c) => this.hostConn(c));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    peer.on('error', (e) => console.warn('[net] peer error', e && e.type));
    this.assignTeams(); this.pushLobby();
    return code;
  }

  assignTeams() {
    const m = mpMode(this.mode); let i = 0;
    for (const p of this.players.values()) { p.team = m.team ? (i % 2) : p.id; i++; }
  }

  lobbyState() {
    return { mode: this.mode, map: this.map, max: mpMode(this.mode).max, inMatch: this.live(), code: this.code,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, prim: p.prim, sec: p.sec })) };
  }

  pushLobby() {
    this.lobby = this.lobbyState();
    for (const c of this.conns.values()) this.sendTo(c, { t: 'lobby', lobby: this.lobby });
    this.ui.lobby(this.lobby);
  }

  sendTo(c, m) { try { if (c.open) c.send(m); } catch (e) { /* ignore */ } }

  hostConn(c) {
    c.on('data', (m) => { try { this.hostData(c, m); } catch (e) { console.error('[net] host data', e); } });
    c.on('close', () => this.hostDrop(c));
    c.on('error', () => this.hostDrop(c));
  }

  hostData(c, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      if (c.pid != null) return;
      if (m.v !== PROTOCOL) { this.sendTo(c, { t: 'deny', why: 'Version mismatch - refresh the page.' }); setTimeout(() => c.close(), 300); return; }
      const mode = mpMode(this.mode);
      if (this.players.size >= mode.max) { this.sendTo(c, { t: 'deny', why: this.mode === '1v1' ? 'Duel is full (2 players).' : 'Room is full.' }); setTimeout(() => c.close(), 300); return; }
      const id = this.nextId++;
      const p = { id, name: this.uniqueName(cleanName(m.name)), prim: m.prim, sec: m.sec, team: 0 };
      c.pid = id; this.conns.set(id, c); this.players.set(id, p);
      this.validate(p);
      const g = this.game;
      if (this.live()) {
        // late join: put them on the smaller team and drop them straight into the running match
        if (mode.team) { const n = [0, 0]; for (const q of this.players.values()) if (q !== p) n[q.team]++; p.team = n[0] <= n[1] ? 0 : 1; } else p.team = id;
        const info = { id: p.id, name: p.name, team: p.team, prim: p.prim, sec: p.sec };
        this.ev(['add', info]);
        this.sendTo(c, { t: 'welcome', id });
        this.sendTo(c, { t: 'begin', ...this.beginInfo(id) });
        g.addNetActor(info, false, false);
      } else {
        this.assignTeams();
        this.sendTo(c, { t: 'welcome', id });
      }
      this.pushLobby();
      return;
    }
    const id = c.pid; if (id == null) return;
    const g = this.game;
    switch (m.t) {
      case 'ld': { const p = this.players.get(id); if (p && !this.live()) { p.prim = m.prim; p.sec = m.sec; this.validate(p); this.pushLobby(); } break; }
      case 'st': { const a = g.byId(id); if (a && this.live()) g.applyRemoteState(a, m); break; }
      case 'shot': { const a = g.byId(id); if (a && this.live()) g.remoteShot(a, m); break; }
      case 'ping': this.sendTo(c, { t: 'pong', n: m.n }); break;
      case 'bye': this.hostDrop(c); break;
      default: break;
    }
  }

  validate(p) { // never trust loadout ids from the wire
    p.prim = ['vmp', 'm4a1', 'ak47', 'kar98k', 'm680'].includes(p.prim) ? p.prim : 'vmp';
    p.sec = ['g18', 'm1911', 'magnum'].includes(p.sec) ? p.sec : 'g18';
  }

  uniqueName(n) {
    const used = new Set([...this.players.values()].map((p) => p.name)); let out = n, i = 2;
    while (used.has(out)) out = `${n.slice(0, 11)}${i++}`;
    return out;
  }

  hostDrop(c) {
    const id = c.pid; if (id == null || !this.players.has(id)) return;
    this.players.delete(id); this.conns.delete(id); this.evMap.delete(id);
    try { c.close(); } catch (e) { /* ignore */ }
    if (this.game.net === this && this.game.scene) this.game.removeNetActor(id);
    if (!this.live()) this.assignTeams();
    this.pushLobby();
  }

  beginInfo(me) {
    const g = this.game, live = this.live();
    return { mode: this.mode, map: this.map, mapName: MAP_INFO[this.map].name, me, mt: live ? g.matchT : -3.5, ts: live ? g.teamScore : [0, 0],
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, prim: p.prim, sec: p.sec })) };
  }

  // ---- host UI actions ----
  setLoadout(prim, sec) {
    if (this.role === 'host') { const p = this.players.get(0); p.prim = prim; p.sec = sec; this.pushLobby(); } else if (this.conn) this.sendTo(this.conn, { t: 'ld', prim, sec });
  }
  setMode(mode) {
    if (this.role !== 'host' || !MODES[mode]) return null;
    if (this.players.size > mpMode(mode).max) return `Too many players for ${MODES[mode].name} (max ${mpMode(mode).max}).`;
    this.mode = mode; this.assignTeams(); this.pushLobby(); return null;
  }
  setMap(map) { if (this.role === 'host' && MAP_IDS.includes(map)) { this.map = map; this.pushLobby(); } }
  start() {
    if (this.role !== 'host') return 'Only the host can start the match.';
    if (this.players.size < 2) return 'Need at least 2 players to start.';
    this.assignTeams();
    for (const c of this.conns.values()) this.sendTo(c, { t: 'begin', ...this.beginInfo(c.pid) });
    this.evAll = []; this.evMap.clear();
    this.game.startNet(this, this.beginInfo(0));
    this.ui.started();
    return null;
  }
  toLobby() { if (this.role === 'host') { this.game.state = 'menu'; this.pushLobby(); } }

  // ---- events ----
  ev(e) { this.evAll.push(e); }
  evTo(id, e) { let a = this.evMap.get(id); if (!a) this.evMap.set(id, a = []); a.push(e); }

  // ================================================================== CLIENT
  async join(code, name, loadout) {
    code = cleanCode(code);
    if (code.length !== 6) throw new Error('Enter the 6-letter room code.');
    await loadPeerLib();
    const peer = await openPeer(null);
    this.peer = peer; this.role = 'client'; this.code = code;
    const conn = await new Promise((res, rej) => {
      const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      const t = setTimeout(() => rej(new Error('Connection timed out. The host may be behind a strict firewall.')), 20000);
      peer.on('error', (e) => { clearTimeout(t); rej(e && e.type === 'peer-unavailable' ? new Error('No room with that code.') : new Error((e && e.message) || 'Connection failed.')); });
      c.on('open', () => { clearTimeout(t); res(c); });
      c.on('error', () => { clearTimeout(t); rej(new Error('Connection failed.')); });
    }).catch((e) => { this.cleanup(); throw e; });
    this.conn = conn;
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('The host did not answer.')), 10000);
      this.onWelcome = () => { clearTimeout(t); res(); };
      this.onDeny = (why) => { clearTimeout(t); rej(new Error(why)); };
      conn.on('data', (m) => { try { this.clientData(m); } catch (e) { console.error('[net] client data', e); } });
      conn.on('close', () => this.clientClosed('Disconnected from the host.'));
      conn.send({ t: 'join', v: PROTOCOL, name: cleanName(name), prim: loadout.prim, sec: loadout.sec });
    }).catch((e) => { this.cleanup(); throw e; });
    this.peer.on('error', (e) => console.warn('[net] peer error', e && e.type));
    return code;
  }

  clientData(m) {
    if (!m || typeof m !== 'object') return;
    const g = this.game;
    switch (m.t) {
      case 'welcome': this.myId = m.id; if (this.onWelcome) this.onWelcome(); break;
      case 'deny': if (this.onDeny) this.onDeny(m.why); break;
      case 'lobby': this.lobby = m.lobby; this.ui.lobby(m.lobby); break;
      case 'begin': g.startNet(this, m); this.ui.started(); break;
      case 'snap': if (g.net === this && g.scene && (g.state === 'playing' || g.state === 'paused')) g.applySnap(m); break;
      case 'ev': if (g.net === this && g.scene && g.state !== 'menu') g.applyEvents(m.e); break;
      case 'pong': this.ping = this.ping ? this.ping * 0.7 + (performance.now() - m.n) * 0.3 : performance.now() - m.n; break;
      case 'bye': this.clientClosed('The host closed the room.'); break;
      default: break;
    }
  }

  clientClosed(why) {
    if (!this.role) return;
    this.cleanup(); this.ui.closed(why);
  }

  sendShot(ox, oy, oz, d, cur, rt) {
    if (this.conn) this.sendTo(this.conn, { t: 'shot', ox: +ox.toFixed(2), oy: +oy.toFixed(2), oz: +oz.toFixed(2), d, cur, rt: +rt.toFixed(3) });
  }

  // ================================================================== shared
  leave() {
    if (this.role === 'host') for (const c of this.conns.values()) this.sendTo(c, { t: 'bye' });
    else if (this.conn) this.sendTo(this.conn, { t: 'bye' });
    const peer = this.peer;
    setTimeout(() => { try { if (peer) peer.destroy(); } catch (e) { /* ignore */ } }, 250);   // let the bye message out first
    this.role = null; this.peer = null; this.conn = null; this.conns.clear(); this.players.clear();
    if (this.game.net === this) this.game.net = null;
  }
  cleanup() { this.leave(); }

  // called by Game.update() every frame while a match is running
  tick(dt) {
    const g = this.game;
    if (this.role === 'host') {
      g.recordHistory();
      this.snapAcc += dt;
      if (this.snapAcc >= 1 / 15) {
        this.snapAcc = 0; this.snapN = (this.snapN || 0) + 1;
        const snap = { t: 'snap', ...g.buildSnap(this.snapN % 15 === 1) };
        for (const [id, c] of this.conns) {
          const a = g.byId(id); if (a) this.evTo(id, ['hp', Math.max(0, Math.ceil(a.hp))]);
          const buf = c.dataChannel ? c.dataChannel.bufferedAmount : 0;
          if (buf < 96 * 1024) this.sendTo(c, snap);
        }
      }
      if (this.evAll.length || this.evMap.size) {
        for (const [id, c] of this.conns) {
          const own = this.evMap.get(id);
          const list = own ? this.evAll.concat(own) : this.evAll;
          if (list.length) this.sendTo(c, { t: 'ev', e: list });
        }
        this.evAll = []; this.evMap.clear();
      }
    } else if (this.role === 'client' && this.conn) {
      this.stAcc += dt; this.pingAcc += dt;
      const p = g.player;
      if (this.stAcc >= 1 / 30 && p && p.alive) {
        this.stAcc = 0;
        const f = (v) => +v.toFixed(2);
        this.sendTo(this.conn, { t: 'st', q: p.sseq, x: f(p.pos.x), y: f(p.pos.y), z: f(p.pos.z), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
          vx: f(p.vel.x), vz: f(p.vel.z), f: (p.crouch ? 1 : 0) | (p.reloading ? 2 : 0) | (p.ads > 0.5 ? 4 : 0) | (p.cur << 3) });
      }
      if (this.pingAcc >= 2) { this.pingAcc = 0; this.sendTo(this.conn, { t: 'ping', n: performance.now() }); }
    }
  }
}

export { MAX_PLAYERS };
