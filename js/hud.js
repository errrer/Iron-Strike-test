const $ = (id) => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'sbL', 'sbR', 'timer', 'radar', 'killfeed', 'crosshair', 'hitmarker', 'dmgind', 'vignette', 'hpfill', 'hptxt',
      'wname', 'mag', 'res', 'wsec', 'msg', 'scope', 'dead', 'deadTxt', 'deadSub', 'scoreboard', 'pause', 'endscreen', 'endTitle', 'endSub', 'endTable', 'modeTag', 'netinfo']) this.el[id] = $(id);
    this.rctx = this.el.radar.getContext('2d');
    this.cache = {};
    this.msgT = 0; this.sbT = 0;
  }

  set(id, text) { if (this.cache[id] !== text) { this.cache[id] = text; this.el[id].textContent = text; } }

  begin(game) {
    this.cache = {};
    this.el.hud.classList.remove('hidden');
    this.el.endscreen.classList.add('hidden'); this.el.pause.classList.add('hidden'); this.el.dead.classList.add('hidden');
    this.el.killfeed.innerHTML = ''; this.el.dmgind.innerHTML = '';
    this.el.modeTag.textContent = `${game.mode.name} - ${game.cfg.mapName}` + (game.net ? ` - ROOM ${game.net.code}` : '');
    // static radar map
    const b = game.map.bounds, S = 4, cv = document.createElement('canvas');
    cv.width = (b.x1 - b.x0) * S; cv.height = (b.z1 - b.z0) * S;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(40,52,64,0.55)'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = 'rgba(190,205,220,0.85)';
    for (const bx of game.map.boxes) {
      if (bx.y1 < 0.9 || bx.y0 > 2.0 || bx.x0 < b.x0 - 1 || bx.x1 > b.x1 + 1 || bx.z0 < b.z0 - 1 || bx.z1 > b.z1 + 1) continue;
      c.fillRect((bx.x0 - b.x0) * S, (bx.z0 - b.z0) * S, (bx.x1 - bx.x0) * S, (bx.z1 - bx.z0) * S);
    }
    this.radarMap = cv;
  }

  center(text, secs = 1.2) { this.el.msg.textContent = text; this.el.msg.classList.add('show'); this.msgT = secs; }

  setScope(on) { if (this.cache.scope !== on) { this.cache.scope = on; this.el.scope.classList.toggle('show', on); } }

  hitmarker(kill, head) {
    const h = this.el.hitmarker;
    h.classList.remove('show', 'kill', 'head'); void h.offsetWidth;
    h.classList.add('show'); if (kill) h.classList.add('kill'); if (head) h.classList.add('head');
  }

  damageFrom(attacker, player) {
    const dx = attacker.pos.x - player.pos.x, dz = attacker.pos.z - player.pos.z;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    const d = document.createElement('div'); d.className = 'dmg'; d.style.transform = `rotate(${ang}rad)`;
    d.innerHTML = '<i></i>'; this.el.dmgind.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }

  feed(k, v, w, head, game) {
    const row = document.createElement('div'); row.className = 'kf';
    const rel = (a) => (game.mode.team ? (a.team === game.player.team ? 'ally' : 'enemy') : (a.isPlayer ? 'ally' : 'enemy'));
    const mk = (a) => { const s = document.createElement('b'); s.className = rel(a); s.textContent = a.name; return s; };
    const mid = document.createElement('span'); mid.className = 'wp'; mid.textContent = ` ${k === v ? 'x' : w.name}${head ? ' (HS)' : ''} `;
    row.appendChild(k === v ? document.createTextNode('') : mk(k)); row.appendChild(mid); row.appendChild(mk(v));
    if (k.isPlayer || v.isPlayer) row.classList.add('mine');
    this.el.killfeed.appendChild(row);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.firstChild.remove();
    setTimeout(() => row.remove(), 6000);
  }

  onDeath(k, w, head) {
    this.el.dead.classList.remove('hidden');
    this.el.deadTxt.textContent = `ELIMINATED BY ${k.name.toUpperCase()}`;
    this.deadWeapon = `${w.name}${head ? ' - headshot' : ''}`;
  }
  onRespawn() { this.el.dead.classList.add('hidden'); }

  showPause(on) { this.el.pause.classList.toggle('hidden', !on); }

  showEnd(game, win) {
    const e = this.el, p = game.player;
    const won = game.mode.team ? win === p.team : win === p.team;
    e.endTitle.textContent = win === null ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT');
    e.endTitle.className = win === null ? 'draw' : (won ? 'win' : 'lose');
    e.endSub.textContent = game.mode.team ? `Allies ${game.teamScore[p.team % 2]} - ${game.teamScore[1 - (p.team % 2)]} Enemy` : `${[...game.actors].sort((a, b) => b.kills - a.kills)[0].name} wins with ${[...game.actors].sort((a, b) => b.kills - a.kills)[0].kills} kills`;
    this.buildTable(game, e.endTable);
    e.endscreen.classList.remove('hidden');
    this.el.dead.classList.add('hidden');
  }

  buildTable(game, table) {
    const rows = [...game.actors].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    let html = '<tr><th>Player</th><th>Kills</th><th>Deaths</th><th>K/D</th></tr>';
    for (const a of rows) {
      const cls = game.mode.team ? (a.team === game.player.team ? 'ally' : 'enemy') : (a.isPlayer ? 'ally' : '');
      html += `<tr class="${cls}${a.isPlayer ? ' me' : ''}"><td>${a.name}${a.isPlayer ? ' (you)' : ''}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${(a.kills / Math.max(1, a.deaths)).toFixed(2)}</td></tr>`;
    }
    table.innerHTML = html;
  }

  update(game) {
    const p = game.player, w = p.weapon, e = this.el;
    // scores + timer
    if (game.mode.team) { this.set('sbL', `ALLIES ${game.teamScore[p.team % 2]}`); this.set('sbR', `${game.teamScore[1 - (p.team % 2)]} ENEMY`); }
    else {
      const sorted = [...game.actors].sort((a, b) => b.kills - a.kills);
      this.set('sbL', `YOU ${p.kills}`);
      const top = sorted[0].isPlayer && sorted[1] ? sorted[1] : sorted[0];
      this.set('sbR', `${top.name.toUpperCase()} ${top.kills}`);
    }
    const tl = Math.ceil(game.timeLeft);
    this.set('timer', `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`);
    // health
    const hp = Math.max(0, Math.ceil(p.hp));
    e.hpfill.style.width = `${hp}%`;
    e.hpfill.style.background = hp > 60 ? '#5fd35f' : hp > 30 ? '#e6b422' : '#e04a3a';
    this.set('hptxt', String(hp));
    e.vignette.style.opacity = String(Math.max(0, (1 - hp / 100) * 0.9 - 0.05));
    // ammo
    const am = p.ammo[p.cur];
    this.set('wname', w.name); this.set('mag', String(am.mag)); this.set('res', `/ ${am.res}`);
    e.mag.classList.toggle('low', am.mag <= Math.ceil(w.mag * 0.25));
    const o = p.weapons[1 - p.cur]; this.set('wsec', `${p.cur === 0 ? '2' : '1'}  ${o.name}  ${p.ammo[1 - p.cur].mag}`);
    // reload / low ammo prompt
    if (this.msgT > 0) { this.msgT -= game.dt || 1 / 60; if (this.msgT <= 0) e.msg.classList.remove('show'); }
    if (p.reloading && !(this.msgT > 0)) { e.msg.textContent = 'RELOADING'; e.msg.classList.add('show'); this.msgT = 0.05; }
    // crosshair
    const moveF = Math.min(1, (p.speed2 || 0) / 6);
    const sp = lerp(w.spread, w.adsSpread, p.ads) * (1 + moveF * 0.9 + p.heat * 0.7 + (p.onGround ? 0 : 2));
    const px = Math.min(80, 4 + sp * (window.innerHeight / 2) / Math.tan((game.camera.fov * Math.PI / 180) / 2));
    e.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    e.crosshair.style.opacity = (p.ads > 0.3 && !game.tp) || !p.alive ? '0' : '1';
    // dead
    if (!p.alive) this.set('deadSub', `${this.deadWeapon || ''}  -  respawning in ${Math.max(0, Math.ceil(p.respawnT))}`);
    // scoreboard
    this.sbT -= game.dt || 1 / 60;
    e.scoreboard.classList.toggle('hidden', !game.showScore);
    if (game.showScore && this.sbT <= 0) { this.sbT = 0.25; this.buildTable(game, e.scoreboard.querySelector('table')); }
    if (game.net) this.set('netinfo', game.net.role === 'host' ? `HOST - ${game.actors.length} players` : `PING ${Math.round(game.net.ping)} ms - ${game.actors.length} players`);
    this.drawRadar(game);
  }

  drawRadar(game) {
    const c = this.rctx, R = 75, S = 2.3, p = game.player, b = game.map.bounds;
    c.clearRect(0, 0, 150, 150);
    c.save(); c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(8,12,16,0.72)'; c.fillRect(0, 0, 150, 150);
    c.translate(R, R); c.rotate(p.yaw); c.scale(S, S); c.translate(-p.pos.x, -p.pos.z);
    c.drawImage(this.radarMap, b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    for (const a of game.actors) {
      if (a === p || !a.alive) continue;
      const ally = game.mode.team && a.team === p.team;
      const pinged = game.time - a.lastShot < 1.6;
      if (!ally && !pinged) continue;
      c.fillStyle = ally ? '#58b4ff' : '#ff5a4a';
      c.beginPath(); c.arc(a.pos.x, a.pos.z, 1.5, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    // player marker + ring
    c.save(); c.translate(R, R); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill(); c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.stroke();
  }
}
