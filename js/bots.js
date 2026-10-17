// Bot AI: spots enemies (field of view + line of sight), reacts, aims, bursts and moves along the nav graph.

export const DIFF = {
  easy:   { react: 0.85, turn: 3.0, err: 0.070, hs: 0.05, sight: 45, speed: 0.85, dmg: 0.75, pauseMul: 1.6 },
  normal: { react: 0.50, turn: 5.0, err: 0.040, hs: 0.15, sight: 60, speed: 1.00, dmg: 0.90, pauseMul: 1.0 },
  hard:   { react: 0.28, turn: 8.0, err: 0.022, hs: 0.30, sight: 85, speed: 1.10, dmg: 1.00, pauseMul: 0.6 },
};

const IDEAL_RANGE = { smg: 9, ar: 17, sniper: 34, shotgun: 5, pistol: 11 };

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Bot {
  constructor(game, actor, diffKey) {
    this.g = game; this.a = actor; this.d = DIFF[diffKey] || DIFF.normal;
    this.path = []; this.pi = 0; this.repathT = 0;
    this.target = null; this.seen = false; this.reactT = 0; this.thinkT = Math.random() * 0.2;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 1;
    this.burst = 3; this.pause = 0.3; this.memPos = null; this.memT = 0;
    this.stuckT = 0; this.lastX = actor.pos.x; this.lastZ = actor.pos.z;
    this.errYaw = 0; this.errPitch = 0; this.errT = 0; this.jumpT = 0; this.wantJump = false;
    this.headAim = false; this.steadyT = 0;
  }

  reset() { this.path = []; this.pi = 0; this.target = null; this.seen = false; this.memPos = null; this.memT = 0; this.reactT = 0.4; this.pause = 0.4; }

  onHurt(attacker) {
    if (!attacker || attacker === this.a || attacker.team === this.a.team) return;
    if (!this.seen) { this.memPos = attacker.pos.clone(); this.memT = 4; this.reactT = Math.min(this.reactT, 0.25); this.target = attacker; }
  }

  scan() {
    const a = this.a, g = this.g;
    let best = null, bd = Infinity;
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    for (const e of g.actors) {
      if (!e.alive || e === a || e.team === a.team) continue;
      const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, dist = Math.hypot(dx, dz);
      if (dist > this.d.sight) continue;
      if (dist > 9 && (dx * fx + dz * fz) / dist < 0.2) continue;       // outside ~160 degree view cone
      if (!g.los(a, e)) continue;
      if (dist < bd) { bd = dist; best = e; }
    }
    if (best) {
      if (!this.seen || this.target !== best) { this.reactT = this.d.react * (0.7 + Math.random() * 0.6); this.headAim = Math.random() < this.d.hs; }
      this.target = best; this.seen = true; this.memPos = best.pos.clone(); this.memT = 3.5;
    } else {
      this.seen = false;
      if (this.memT <= 0) this.target = null;
    }
  }

  chooseGoal() {
    const a = this.a, g = this.g, nav = g.nav;
    let gx, gz;
    if (this.memPos && this.memT > 0) { gx = this.memPos.x; gz = this.memPos.z; }
    else if (Math.random() < 0.65) {
      let bd = Infinity, be = null;
      for (const e of g.actors) { if (!e.alive || e === a || e.team === a.team) continue; const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z); if (d < bd) { bd = d; be = e; } }
      if (be) { gx = be.pos.x; gz = be.pos.z; }
    }
    if (gx === undefined) { const n = nav.nodes[nav.randomNode()]; gx = n.x; gz = n.z; }
    const s = nav.nearest(a.pos.x, a.pos.z), e = nav.nearest(gx, gz);
    this.path = nav.path(s, e); this.pi = this.path.length > 1 ? 1 : 0; this.repathT = 2 + Math.random() * 2;
  }

  followPath(wish) {
    const a = this.a, nav = this.g.nav;
    if (this.pi >= this.path.length) this.chooseGoal();
    if (this.pi >= this.path.length) return false;
    let n = nav.nodes[this.path[this.pi]];
    let dx = n.x - a.pos.x, dz = n.z - a.pos.z, dist = Math.hypot(dx, dz);
    while (dist < 1.2 && this.pi < this.path.length - 1) {
      this.pi++; n = nav.nodes[this.path[this.pi]];
      dx = n.x - a.pos.x; dz = n.z - a.pos.z; dist = Math.hypot(dx, dz);
    }
    if (dist < 1.0 && this.pi >= this.path.length - 1) { this.path = []; return false; }
    wish.x = dx / dist; wish.z = dz / dist;
    return true;
  }

  update(dt) {
    const a = this.a, g = this.g, d = this.d;
    if (!a.alive || g.matchT < 0) return;
    this.thinkT -= dt; this.strafeT -= dt; this.memT -= dt; this.pause -= dt; this.repathT -= dt; this.errT -= dt; this.stuckT += dt;
    if (this.thinkT <= 0) { this.thinkT = 0.14 + Math.random() * 0.1; this.scan(); }
    if (this.seen) this.reactT -= dt;
    if (this.errT <= 0) { this.errT = 0.3; this.errYaw = (Math.random() - 0.5) * 2; this.errPitch = (Math.random() - 0.5) * 2; }

    const w = a.weapon, wish = { x: 0, z: 0 };
    let wantYaw = a.yaw, wantPitch = 0, aim = false, moving = false;
    const t = this.target;
    let dist = 0;

    if (t && t.alive && this.seen) {
      const ex = a.pos.x, ey = a.pos.y + 1.6, ez = a.pos.z;
      const tx = t.pos.x, ty = t.pos.y + (this.headAim ? t.h - 0.2 : t.h * 0.62), tz = t.pos.z;
      const dx = tx - ex, dy = ty - ey, dz = tz - ez;
      dist = Math.hypot(dx, dz);
      wantYaw = Math.atan2(-dx, -dz); wantPitch = Math.atan2(dy, dist); aim = true;
    } else if (this.memPos && this.memT > 0 && !this.seen) {
      wantYaw = Math.atan2(-(this.memPos.x - a.pos.x), -(this.memPos.z - a.pos.z));
    }

    // ----- movement -----
    let speed = 4.6 * d.speed * w.moveMul;
    if (aim) {
      const fx = -Math.sin(wantYaw), fz = -Math.cos(wantYaw);
      const ideal = IDEAL_RANGE[w.cls] || 14;
      let f = 0;
      if (dist > ideal * 1.5) f = 1; else if (dist < ideal * 0.55) f = -1;
      if (this.strafeT <= 0) { this.strafeT = 0.7 + Math.random() * 1.6; if (Math.random() < 0.6) this.strafe *= -1; }
      if (f === 1 && dist > ideal * 2.2) {
        if (!this.followPath(wish)) { wish.x = fx; wish.z = fz; }
      } else {
        const sa = w.cls === 'sniper' ? 0.25 : 0.85;
        wish.x = fx * f + (-fz) * this.strafe * sa; wish.z = fz * f + fx * this.strafe * sa;
      }
      speed *= 0.8; moving = true;
    } else {
      if (this.repathT <= 0 && this.memPos && this.memT > 0) this.chooseGoal();
      moving = this.followPath(wish);
      if (moving) wantYaw = Math.atan2(-wish.x, -wish.z);
    }
    const wl = Math.hypot(wish.x, wish.z);
    if (wl > 0.001) { wish.x /= wl; wish.z /= wl; }

    // ----- stuck detection -----
    if (this.stuckT > 0.7) {
      const moved = Math.hypot(a.pos.x - this.lastX, a.pos.z - this.lastZ);
      if (moving && moved < 0.25) { this.wantJump = true; this.path = []; this.strafe *= -1; this.strafeT = 1; }
      this.lastX = a.pos.x; this.lastZ = a.pos.z; this.stuckT = 0;
    }
    const jump = this.wantJump; this.wantJump = false;
    g.moveActor(a, moving ? wish.x : 0, moving ? wish.z : 0, speed, dt, jump, false);

    // ----- turning -----
    const maxTurn = d.turn * dt * (aim ? 1 : 0.7);
    a.yaw += clamp(angDiff(wantYaw, a.yaw), -maxTurn, maxTurn);
    a.pitch += clamp(wantPitch - a.pitch, -maxTurn, maxTurn);
    if (!aim) a.pitch *= 0.9;

    // ----- shooting / reloading -----
    const ammo = a.ammo[a.cur];
    if (ammo.mag <= 0 || (!aim && ammo.mag < w.mag * 0.3)) g.startReload(a);
    if (aim && this.reactT <= 0 && !a.reloading && ammo.mag > 0) {
      const err = Math.abs(angDiff(wantYaw, a.yaw)) + Math.abs(wantPitch - a.pitch);
      const tol = w.cls === 'sniper' ? 0.025 : 0.1;
      if (err < tol) this.steadyT += dt; else this.steadyT = 0;
      const ready = w.cls === 'sniper' ? this.steadyT > 0.35 : true;
      if (ready && this.pause <= 0 && g.canFire(a)) {
        const spread = (w.cls === 'sniper' ? w.adsSpread : w.spread * 0.7) + d.err * (0.6 + dist / 30);
        g.botFire(a, this.errYaw * spread, this.errPitch * spread, d.dmg);
        if (w.auto) {
          this.burst--;
          if (this.burst <= 0) { this.pause = (0.15 + Math.random() * 0.45) * d.pauseMul; this.burst = 3 + Math.floor(Math.random() * 6); }
        } else {
          this.pause = (60 / w.rpm) * (1 + Math.random() * 0.7) * d.pauseMul + (w.cls === 'sniper' ? 0.5 : 0.08);
        }
        if (w.cls === 'sniper') this.steadyT = 0;
      }
    } else if (!aim) { this.steadyT = 0; }
  }
}
