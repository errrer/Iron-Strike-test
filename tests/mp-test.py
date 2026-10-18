"""Multiplayer logic test. Runs a host + several clients inside one headless page, connected through a fake
in-memory PeerJS (tests/fake-peer.js) with simulated latency, driving everything with scripted players.
Usage: python3 tests/mp-test.py"""
import http.server, socketserver, threading, os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), Q); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
stub = open('tests/three-stub.js').read()
fake = open('tests/fake-peer.js').read()
errors = []

HELPERS = """
window.H = {
  async mods() { const G = await import('/js/game.js'), N = await import('/js/net.js'); return {G, N}; },
  stubHud() { return new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { if (k === 'showEnd') t._ended = true; if (k === 'feed') t._feeds = (t._feeds || 0) + 1; }) }); },
  mkClient(M, closedLog) {
    const g = new M.G.Game(document.createElement('canvas'), H.stubHud(), new Proxy({}, { get: () => () => {} }), { sens: 1, fov: 80, view: 'first' });
    const ui = { lobby() {}, started() {}, closed: (w) => closedLog.push(w) };
    g.netObj = new M.N.Net(g, ui); g.ui = ui; return g;
  },
  drive(g, t, i) {
    const p = g.player; if (!p) return;
    if (g.state === 'paused') g.state = 'playing';
    const ph = i * 0.37;
    g.keys.KeyW = Math.sin(t * 0.7 + ph) > -0.4; g.keys.KeyA = Math.sin(t * 1.3 + ph) > 0.5; g.keys.KeyD = Math.sin(t * 1.3 + ph) < -0.5;
    g.keys.ShiftLeft = false; g.keys.Space = (Math.floor(t * 60) % 240 === i); g.adsHeld = false;
    let best = null, bd = 1e9;
    for (const a of g.actors) if (a.alive && a !== p && a.team !== p.team) { const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z); if (d < bd) { bd = d; best = a; } }
    if (best && p.alive) { p.yaw = Math.atan2(-(best.pos.x - p.pos.x), -(best.pos.z - p.pos.z)); p.pitch = Math.atan2(best.pos.y + 1.2 - (p.pos.y + p.eye), bd); }
    g.fireHeld = !!best && (Math.floor(t * 2) % 2 === 0); if (g.fireHeld && Math.floor(t * 60) % 9 === 0) g.fireEdge = true;
    if (p.alive && p.ammo[p.cur].mag < 3) g.startReload(p);
  },
  async run(games, secs, errs) {   // games[0] = host
    const B = window.__bus, dt = 1 / 60;
    for (let f = 0; f < secs * 60; f++) {
      const t = B.now;
      games.forEach((g, i) => { if (g.state === 'ended' || !g.scene) return; H.drive(g, t, i); try { g.frame(dt); } catch (e) { errs.push(String(e.stack || e)); } });
      B.advance(dt);
    }
  },
};
"""

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.route('**/cdn.jsdelivr.net/npm/three@**', lambda r: r.fulfill(body=stub, content_type='application/javascript'))
    pg.add_init_script(fake)
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_timeout(500)
    pg.evaluate(HELPERS)

    # ---- host through the real UI
    pg.click('#btnMP'); pg.fill('#mpName', 'HostMan'); pg.click('#mpHostBtn')
    pg.evaluate("() => window.__bus.pump(0.3)"); pg.wait_for_timeout(100)
    code = pg.inner_text('#mpCodeTxt')
    print('room code:', code); assert len(code) == 6 and code.isalpha() and code.isupper(), code
    assert pg.evaluate("() => !document.getElementById('mpLobby').classList.contains('hidden')")

    R = pg.evaluate("""async (code) => {
      const M = await H.mods(), out = {}, closed = [], errs = [];
      const host = window.__game, hostNet = window.__mp.net;
      // bad code
      const bad = H.mkClient(M, closed); try { await Promise.all([bad.netObj.join('ZZZZZZ', 'x', {prim:'vmp', sec:'g18'}), window.__bus.pumpAsync(1)]); out.badCode = 'no error'; } catch (e) { out.badCode = e.message; }
      // 3 clients join
      const clients = [];
      const specs = [['m4a1','g18'], ['ak47','magnum'], ['kar98k','m1911']];
      for (let i = 0; i < 3; i++) { const c = H.mkClient(M, closed); await Promise.all([c.netObj.join(code, 'Joiner' + i, {prim: specs[i][0], sec: specs[i][1]}), window.__bus.pumpAsync(1)]); clients.push(c); }
      await window.__bus.pumpAsync(0.5);
      out.lobbyPlayers = hostNet.lobby.players.map(p => p.name + ':' + p.team);
      out.lobbyRows = document.querySelectorAll('#mpPlayers tr').length;
      out.clientSees = clients.map(c => c.netObj.lobby.players.length);
      // host picks TDM / Frostbite and starts with the real button
      document.getElementById('mpMode').value = 'tdm'; document.getElementById('mpMode').dispatchEvent(new Event('change'));
      document.getElementById('mpMap').value = 'frostbite'; document.getElementById('mpMap').dispatchEvent(new Event('change'));
      await window.__bus.pumpAsync(0.3);
      out.clientLobbyMap = clients.map(c => c.netObj.lobby.map);
      document.getElementById('mpStart').click();
      await window.__bus.pumpAsync(0.3);
      const games = [host, ...clients];
      out.states = games.map(g => g.state); out.actorCounts = games.map(g => g.actors.length);
      out.teams = host.actors.map(a => a.team);
      out.mpHidden = document.getElementById('mp').classList.contains('hidden');
      window.__T = { games, clients, closed, errs, hostNet, M };
      return out;
    }""", code)
    print(json.dumps(R))
    assert 'No room' in R['badCode'], R['badCode']
    assert R['lobbyRows'] == 5 and R['clientSees'] == [4, 4, 4] and R['clientLobbyMap'] == ['frostbite'] * 3, R
    assert all(x in ('playing','paused') for x in R['states']) and R['actorCounts'] == [4] * 4 and sorted(R['teams']) == [0, 0, 1, 1], R

    S = pg.evaluate("""async () => {
      const {games, errs} = window.__T, host = games[0];
      await H.run(games, 45, errs);
      await window.__bus.pumpAsync(0.4);
      const o = { errs, t: host.matchT, scores: host.teamScore };
      o.kd = host.actors.map(a => [a.name, a.kills, a.deaths]);
      o.kdMatch = games.slice(1).map(g => g.actors.every(a => { const h = host.byId(a.id); return h.kills === a.kills && h.deaths === a.deaths; }));
      o.scoreMatch = games.slice(1).map(g => JSON.stringify(g.teamScore) === JSON.stringify(host.teamScore));
      // position sync: how far is each client's view of every remote player from the host's truth
      let maxd = 0;
      for (const g of games.slice(1)) for (const a of g.actors) { const h = host.byId(a.id); if (a.isPlayer || !h.alive || !a.alive) continue; maxd = Math.max(maxd, Math.hypot(a.pos.x - h.pos.x, a.pos.z - h.pos.z)); }
      o.maxViewErr = +maxd.toFixed(2);
      o.hpMatch = games.slice(1).map(g => Math.abs(g.player.hp - host.byId(g.player.id).hp) < 26);
      o.aliveMatch = games.slice(1).map(g => g.actors.every(a => a.isPlayer || a.alive === host.byId(a.id).alive));
      o.hostAliveSeen = games.slice(1).map(g => g.player.alive === host.byId(g.player.id).alive);
      o.clientNoNaN = games.every(g => g.actors.every(a => isFinite(a.pos.x + a.pos.y + a.pos.z)));
      o.ping = games.slice(1).map(g => Math.round(g.net.ping));
      o.clientShooterKills = games.slice(1).map(g => g.player.kills);
      o.feeds = games.map(g => g.hud._feeds || 0);
      return o;
    }""")
    print(json.dumps(S))
    if S['errs']: errors += S['errs']
    assert all(S['kdMatch']) and all(S['scoreMatch']), S
    assert sum(k for _, k, _ in S['kd']) > 0, 'nobody got a kill'
    assert S['maxViewErr'] < 1.6, S['maxViewErr']
    assert all(S['hpMatch']) and all(S['aliveMatch']) and all(S['hostAliveSeen']) and S['clientNoNaN'], S
    assert sum(S['clientShooterKills']) > 0, 'clients never scored a kill (client shots not working)'

    L = pg.evaluate("""async () => {
      const {games, clients, closed, errs, M} = window.__T, host = games[0], o = {};
      // late join
      const c = H.mkClient(M, closed);
      await Promise.all([c.netObj.join(window.__mp.net.code, 'Late', {prim:'vmp', sec:'g18'}), window.__bus.pumpAsync(1)]);
      await window.__bus.pumpAsync(0.5);
      games.push(c); clients.push(c);
      o.lateState = 'playing'; o.lateActors = c.actors.length; o.hostActors = host.actors.length;
      o.othersSeeLate = games.slice(0, -1).map(g => !!g.byId(c.player.id));
      o.lateTeam = c.player.team; o.teamCounts = [0,1].map(t => host.actors.filter(a => a.team === t).length);
      await H.run(games, 8, errs); await window.__bus.pumpAsync(0.3);
      o.lateAlive = c.player.alive; o.lateSeenAlive = host.byId(c.player.id).alive; o.latePos = [c.player.pos.x, c.player.pos.z];
      // a client leaves
      const gone = clients[0], goneId = gone.player.id;
      gone.netObj.leave(); await window.__bus.pumpAsync(0.5);
      games.splice(games.indexOf(gone), 1); clients.splice(0, 1);
      o.afterLeave = games.map(g => !!g.byId(goneId));
      o.hostPlayers = host.net.players.size;
      await H.run(games, 3, errs);
      return o;
    }""")
    print(json.dumps(L))
    assert L['lateState'] == 'playing' and L['lateActors'] == L['hostActors'] == 5 and all(L['othersSeeLate']), L
    assert L['lateAlive'] and L['lateSeenAlive'] and not any(L['afterLeave']) and L['hostPlayers'] == 4, L
    assert sorted(L['teamCounts']) == [2, 3], L['teamCounts']

    E = pg.evaluate("""async () => {
      const {games, clients, closed, errs} = window.__T, host = games[0], o = {};
      host.matchT = host.mode.time + 1;
      await H.run(games, 0.5, errs); await window.__bus.pumpAsync(0.5);
      o.states = games.map(g => g.state); o.endShown = games.map(g => g.hud._ended === true || !document.getElementById('endscreen').classList.contains('hidden'));
      o.endRows = document.querySelectorAll('#endTable tr').length;
      document.getElementById('btnAgain').click();            // host -> back to lobby
      await window.__bus.pumpAsync(0.5);
      o.hostLobby = !document.getElementById('mpLobby').classList.contains('hidden');
      o.hostLobbyState = host.state; o.inMatchFlag = host.net.lobby.inMatch;
      // second match: FFA on Dust
      document.getElementById('mpMode').value = 'ffa'; document.getElementById('mpMode').dispatchEvent(new Event('change'));
      document.getElementById('mpMap').value = 'dust'; document.getElementById('mpMap').dispatchEvent(new Event('change'));
      await window.__bus.pumpAsync(0.3);
      document.getElementById('mpStart').click(); await window.__bus.pumpAsync(0.3);
      o.states2 = games.map(g => g.state); o.mode2 = games.map(g => g.mode.id);
      await H.run(games, 15, errs); await window.__bus.pumpAsync(0.3);
      o.ffaKd = host.actors.map(a => a.kills + '/' + a.deaths);
      o.ffaKdMatch = games.slice(1).map(g => g.actors.every(a => { const h = host.byId(a.id); return h.kills === a.kills; }));
      // host leaves -> clients get kicked to the menu
      document.getElementById('btnQuit').click();
      await window.__bus.pumpAsync(1);
      o.closed = closed.slice(-3); o.clientNetNull = games.slice(1).map(g => g.net === null);
      return o;
    }""")
    print(json.dumps(E))
    if E.get('errors'): errors += E['errors']
    assert all(s == 'ended' for s in E['states']) and E['endRows'] >= 5, E
    assert E['hostLobby'] and E['hostLobbyState'] == 'menu' and E['inMatchFlag'] is False, E
    assert all(x in ('playing','paused') for x in E['states2']) and E['mode2'] == ['ffa'] * 4 and all(E['ffaKdMatch']), E
    assert len(E['closed']) >= 3 and all('host' in c.lower() for c in E['closed']) and all(E['clientNetNull']), E

    # ---- full lobby: 18 players, the 19th is refused; duel capacity
    F = pg.evaluate("""async () => {
      const M = await H.mods(), o = {}, closed = [], errs = [];
      // new host through the real UI again
      document.getElementById('menu').classList.remove('hidden');
      document.getElementById('btnMP').click(); document.getElementById('mpHostBtn').click();
      await window.__bus.pumpAsync(0.5);
      const code = document.getElementById('mpCodeTxt').textContent, host = window.__game, hostNet = window.__mp.net;
      const clients = [];
      for (let i = 0; i < 17; i++) { const c = H.mkClient(M, closed); await Promise.all([c.netObj.join(code, 'P' + i, {prim:'vmp', sec:'g18'}), window.__bus.pumpAsync(0.3)]); clients.push(c); }
      o.count = hostNet.players.size;
      const extra = H.mkClient(M, closed);
      try { await Promise.all([extra.netObj.join(code, 'Extra', {prim:'vmp', sec:'g18'}), window.__bus.pumpAsync(1)]); o.extra = 'joined?!'; } catch (e) { o.extra = e.message; }
      o.dupNames = new Set(hostNet.lobby.players.map(p => p.name)).size === 18;
      o.duelBlocked = hostNet.setMode('1v1');
      hostNet.setMode('tdm');
      const games = [host, ...clients];
      hostNet.start(); await window.__bus.pumpAsync(0.5);
      o.states = games.map(g => g.state).every(s => s === 'playing' || s === 'paused');
      o.teamSizes = [0,1].map(t => host.actors.filter(a => a.team === t).length);
      window.__bus.bytes = 0;
      await H.run(games, 12, errs); await window.__bus.pumpAsync(0.3);
      o.hostKBps = +(window.__bus.bytesFrom(hostNet.peer.id) / 1024 / 12).toFixed(1);
      o.errs = errs;
      o.kdMatch = games.slice(1).every(g => g.actors.every(a => { const h = host.byId(a.id); return h.kills === a.kills; }));
      o.totalKills = host.actors.reduce((s, a) => s + a.kills, 0);
      return o;
    }""")
    print(json.dumps(F))
    errors += F['errs']
    assert F['count'] == 18 and 'full' in F['extra'].lower() and F['dupNames'] and F['duelBlocked'] and F['states'] and F['teamSizes'] == [9, 9] and F['kdMatch'], F
    b.close()
print('\nRUNTIME ERRORS:', errors if errors else 'none')
sys.exit(1 if errors else 0)
