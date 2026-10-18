"""Headless logic smoke test.  Three.js is replaced by tests/three-stub.js (no GPU/network needed),
so this checks game logic, bots, HUD and UI flow for runtime errors - not the visuals.
Usage: python3 tests/smoke.py"""
import http.server, socketserver, threading, os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), Q); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
stub = open('tests/three-stub.js').read()

errors = []
SIM = """
async ([mode, map, prim, sec, seconds, diff, view]) => {
  const g = window.__game; g.settings.view = view || 'first';
  g.start({mode, map, mapName: map, primary: prim, secondary: sec, difficulty: diff});
  g.state = 'playing'; document.getElementById('pause').classList.add('hidden');
  const dt = 1/60; const p = g.player; const out = {errors: []};
  let shots = 0, switched = 0, reloads = 0;
  const startPos = g.actors.filter(a => !a.isPlayer).map(a => [a.pos.x, a.pos.z]);
  for (let i = 0; i < seconds * 60; i++) {
    // scripted player: wander, strafe, shoot at nearest enemy
    const t = i / 60;
    g.keys.KeyW = Math.sin(t * 0.7) > -0.3; g.keys.KeyA = Math.sin(t * 1.3) > 0.5; g.keys.KeyD = Math.sin(t * 1.3) < -0.5;
    g.keys.ShiftLeft = (Math.floor(t / 6) % 3 === 0); g.keys.Space = (i % 200 === 0); g.keys.KeyC = (Math.floor(t / 9) % 4 === 3);
    g.adsHeld = (Math.floor(t / 5) % 3 === 1);
    let best = null, bd = 1e9;
    for (const a of g.actors) if (a.alive && a !== p && a.team !== p.team) { const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z); if (d < bd) { bd = d; best = a; } }
    if (best && p.alive) { p.yaw = Math.atan2(-(best.pos.x - p.pos.x), -(best.pos.z - p.pos.z)); p.pitch = Math.atan2(best.pos.y + 1.2 - (p.pos.y + p.eye), bd); }
    g.fireHeld = !!best && (i % 90) < 45; if (g.fireHeld && i % 7 === 0) g.fireEdge = true;
    if (i % 500 === 250) { g.switchWeapon(p, 1 - p.cur); switched++; }
    if (i % 400 === 399) { g.startReload(p); reloads++; }
    if (i % 600 === 0) { g.showScore = !g.showScore; }
    try { g.frame(dt); } catch (e) { out.errors.push(String(e.stack || e)); break; }
    if (g.state === 'ended') break;
  }
  const moved = g.actors.filter(a => !a.isPlayer).map((a, i) => Math.hypot(a.pos.x - startPos[i][0], a.pos.z - startPos[i][1]));
  out.state = g.state; out.time = g.matchT; out.score = g.teamScore;
  out.kills = g.actors.map(a => [a.name, a.kills, a.deaths]);
  out.minMoved = Math.min(...moved).toFixed(1); out.maxMoved = Math.max(...moved).toFixed(1);
  out.playerAlive = p.alive; out.nanPos = g.actors.some(a => !isFinite(a.pos.x + a.pos.y + a.pos.z));
  out.feed = document.getElementById('killfeed').children.length;
  out.endShown = !document.getElementById('endscreen').classList.contains('hidden');
  out.outOfBounds = g.actors.some(a => Math.abs(a.pos.x) > 41 || Math.abs(a.pos.z) > 29 || a.pos.y < -0.1 || a.pos.y > 12);
  return out;
}
"""

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(body=stub, content_type='application/javascript'))
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_timeout(500)
    # menu sanity
    counts = pg.evaluate("() => ({modes: document.querySelectorAll('#modes .card').length, maps: document.querySelectorAll('#maps .card').length, prim: document.querySelectorAll('#primaries .card').length, sec: document.querySelectorAll('#secondaries .card').length})")
    print('menu cards:', counts)
    assert counts == {'modes': 3, 'maps': 4, 'prim': 5, 'sec': 3}, counts
    # UI flow: click DEPLOY via the real button
    pg.click('#btnStart'); pg.wait_for_timeout(300)
    print('after deploy: hud visible =', pg.evaluate("() => !document.getElementById('hud').classList.contains('hidden')"), 'state =', pg.evaluate('() => window.__game.state'))
    runs = [('tdm','warehouse','vmp','g18',150,'normal'), ('1v1','dust','m4a1','m1911',120,'hard'), ('ffa','skyline','ak47','magnum',150,'normal'),
            ('tdm','frostbite','kar98k','g18',120,'easy'), ('ffa','warehouse','m680','m1911',100,'hard'), ('1v1','frostbite','vmp','g18',90,'normal'), ('tdm','dust','ak47','magnum',100,'hard'), ('ffa','frostbite','m4a1','g18',100,'normal'), ('tdm','skyline','m680','m1911',100,'normal'),
            ('tdm','warehouse','vmp','g18',100,'normal','third'), ('ffa','dust','kar98k','magnum',100,'normal','third'), ('1v1','frostbite','m680','g18',80,'hard','third')]
    for r in runs:
        res = pg.evaluate(SIM, list(r))
        bad = res['errors'] or res['nanPos'] or res['outOfBounds']
        print(('FAIL ' if bad else 'OK   ') + '/'.join(map(str, r[:4])), json.dumps({k: res[k] for k in ('state','time','score','minMoved','maxMoved','playerAlive','feed','endShown','nanPos','outOfBounds')}))
        print('      kills:', res['kills'])
        for e in res['errors']: print('      ERROR', e[:600])
        if bad: errors.append('sim failed ' + str(r))
    # force a match end and check the end screen + play again
    pg.evaluate("() => { const g = window.__game; g.matchT = g.mode.time + 1; g.update(1/60); }")
    print('forced end ->', pg.evaluate("() => ({state: window.__game.state, title: document.getElementById('endTitle').textContent, rows: document.querySelectorAll('#endTable tr').length})"))
    pg.click('#btnAgain'); pg.wait_for_timeout(200)
    print('play again state =', pg.evaluate('() => window.__game.state'))
    # toggle controls: pause-menu button + V key
    pg.evaluate("() => { window.__game.state = 'playing'; }")
    pg.keyboard.press('KeyV'); pg.wait_for_timeout(100)
    print('after V key view =', pg.evaluate('() => window.__game.settings.view'), 'buttons sel =', pg.evaluate("() => [...document.querySelectorAll('.viewseg .sel')].map(b => b.dataset.view)"))
    pg.evaluate("() => document.querySelectorAll('.viewseg button[data-view=first]')[1].click()")
    print('after pause-menu click view =', pg.evaluate('() => window.__game.settings.view'), 'saved =', pg.evaluate("() => JSON.parse(localStorage.getItem('ironstrike')).view"))
    # easter egg: type "richtofen"
    pg.evaluate("() => { const g = window.__game; g.start({mode:'tdm',map:'dust',mapName:'Dust',primary:'vmp',secondary:'g18',difficulty:'normal'}); g.state='playing'; }")
    pg.keyboard.type('richtofen', delay=20); pg.wait_for_timeout(800)
    egg = pg.evaluate("() => { const g = window.__game; return {on: g.richtofen, rich: g.actors.filter(a => a.mesh.rich && a.mesh.rich.visible).length, hidden: g.actors.every(a => a.mesh.parts.every(p => !p.visible)), n: g.actors.length, toast: document.getElementById('toast').textContent}; }")
    print('easter egg on:', egg); assert egg['on'] and egg['rich'] == egg['n'] and egg['hidden'], egg
    pg.evaluate("() => { const g = window.__game; for (let i = 0; i < 120; i++) g.frame(1/60); g.start({mode:'ffa',map:'dust',mapName:'Dust',primary:'vmp',secondary:'g18',difficulty:'normal'}); }")
    print('new match keeps it:', pg.evaluate("() => window.__game.actors.every(a => a.mesh.rich && a.mesh.rich.visible)"))
    pg.keyboard.type('richtofen', delay=20); pg.wait_for_timeout(300)
    print('toggled off:', pg.evaluate("() => window.__game.richtofen === false && window.__game.actors.every(a => !a.mesh.rich.visible && a.mesh.parts.every(p => p.visible))"))
    b.close()
print('\nRUNTIME ERRORS:', errors if errors else 'none')
sys.exit(1 if errors else 0)
