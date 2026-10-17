// Tiny procedural sound engine (WebAudio) - no audio files needed.
export class Sound {
  constructor() { this.ctx = null; this.master = null; this.noise = null; }

  init() {
    if (this.ctx) { this.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate; // 1s of noise
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  }

  resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { /* ignore */ } }

  _bus(vol, pan) {
    const g = this.ctx.createGain(); g.gain.value = vol;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return g;
  }

  _noise(t, dur, freq, vol, bus, type = 'lowpass') {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.1), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  _tone(t, f0, f1, dur, vol, bus, type = 'sine') {
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }

  shot(w, vol = 1, pan = 0) {
    if (!this.ctx || vol < 0.04) return;
    const t = this.ctx.currentTime, s = w.snd, bus = this._bus(vol, pan);
    this._noise(t, s.len, s.f, 0.9, bus);
    this._tone(t, 160, 45, 0.12, 0.9 * s.thump, bus);
    if (w.cls === 'sniper' || w.cls === 'shotgun') this._noise(t + 0.02, s.len * 2.2, 700, 0.5, bus);
  }
  step(vol = 0.3, pan = 0) {
    if (!this.ctx || vol < 0.03) return;
    const t = this.ctx.currentTime, bus = this._bus(vol, pan);
    this._noise(t, 0.07, 500, 0.7, bus);
  }
  hit(head = false) {
    if (!this.ctx) return; const t = this.ctx.currentTime, bus = this._bus(0.35, 0);
    this._tone(t, head ? 2400 : 1700, head ? 1800 : 1300, 0.05, 0.6, bus, 'square');
  }
  kill() {
    if (!this.ctx) return; const t = this.ctx.currentTime, bus = this._bus(0.4, 0);
    this._tone(t, 900, 700, 0.08, 0.6, bus, 'square'); this._tone(t + 0.09, 1200, 900, 0.12, 0.6, bus, 'square');
  }
  hurt() {
    if (!this.ctx) return; const t = this.ctx.currentTime, bus = this._bus(0.5, 0);
    this._tone(t, 120, 50, 0.15, 0.9, bus); this._noise(t, 0.1, 900, 0.4, bus);
  }
  reload(stage = 0) {
    if (!this.ctx) return; const t = this.ctx.currentTime, bus = this._bus(0.35, 0);
    this._noise(t, 0.05, 3500, 0.8, bus, 'bandpass'); this._tone(t, stage ? 600 : 400, stage ? 500 : 300, 0.05, 0.4, bus, 'square');
  }
  click() {
    if (!this.ctx) return; const t = this.ctx.currentTime, bus = this._bus(0.3, 0);
    this._noise(t, 0.03, 4000, 0.7, bus, 'bandpass');
  }
  switchGun() { this.reload(1); }
  spawn() {
    if (!this.ctx) return; const t = this.ctx.currentTime, bus = this._bus(0.3, 0);
    this._tone(t, 400, 800, 0.15, 0.5, bus, 'triangle');
  }
  beep(high = false) {
    if (!this.ctx) return; const t = this.ctx.currentTime, bus = this._bus(0.3, 0);
    this._tone(t, high ? 1200 : 700, high ? 1200 : 700, 0.18, 0.6, bus, 'sine');
  }
}
