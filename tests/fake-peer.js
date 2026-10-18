// In-memory stand-in for PeerJS used by tests/mp-test.py: same event API, JSON-serialised messages, simulated latency.
(() => {
  const B = window.__bus = { peers: new Map(), q: [], now: 0, lat: 0.04, n: 0, sent: new Map(),
    advance(dt) { B.now += dt; B.deliver(); },
    deliver() { B.q.sort((a, b) => a.due - b.due); while (B.q.length && B.q[0].due <= B.now) { const m = B.q.shift(); if (m.to.open) m.to.emit('data', JSON.parse(m.s)); } },
    pump(s) { for (let t = 0; t < s; t += 0.01) B.advance(0.01); },
    pumpAsync(s) { return new Promise((res) => { let t = 0; const step = () => { B.advance(0.01); t += 0.01; if (t >= s) res(); else setTimeout(step, 0); }; step(); }); },
    bytesFrom(id) { return B.sent.get(id) || 0; } };
  performance.now = () => B.now * 1000;
  class Emitter { constructor() { this.h = {}; } on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; } emit(e, ...a) { for (const f of (this.h[e] || []).slice()) f(...a); } }
  class Conn extends Emitter {
    constructor(owner, peerId) { super(); this.owner = owner; this.peer = peerId; this.open = false; this.dataChannel = { bufferedAmount: 0 }; }
    send(m) { if (!this.open) return; const s = JSON.stringify(m); B.sent.set(this.owner.id, (B.sent.get(this.owner.id) || 0) + s.length); B.q.push({ due: B.now + B.lat, to: this.other, s }); }
    close() { if (!this.open) return; this.open = false; const o = this.other; o.open = false; setTimeout(() => { this.emit('close'); o.emit('close'); }, 0); }
  }
  window.Peer = class Peer extends Emitter {
    constructor(id, opts) {
      super(); if (id && typeof id === 'object') { id = null; }
      this.id = id || ('rnd' + (B.n++)); this.conns = [];
      if (B.peers.has(this.id)) { setTimeout(() => this.emit('error', { type: 'unavailable-id' }), 0); return; }
      B.peers.set(this.id, this); setTimeout(() => this.emit('open', this.id), 0);
    }
    connect(id) {
      const target = B.peers.get(id), c1 = new Conn(this, id); this.conns.push(c1);
      if (!target) { setTimeout(() => this.emit('error', { type: 'peer-unavailable' }), 0); return c1; }
      const c2 = new Conn(target, this.id); target.conns.push(c2); c1.other = c2; c2.other = c1;
      setTimeout(() => { c1.open = c2.open = true; target.emit('connection', c2); c1.emit('open'); c2.emit('open'); }, 0);
      return c1;
    }
    reconnect() {}
    destroy() { for (const c of this.conns) c.close(); B.peers.delete(this.id); }
  };
})();
