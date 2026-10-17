// Collision, ray casting and navigation. Pure maths - no rendering dependencies.

export const STEP_H = 0.55;          // max height a player auto-steps up (stairs)
export const GRAVITY = 22;

// A box "blocks walking" if it sticks up higher than a step and starts below head height.
export const isBlocker = (b) => b.y1 > STEP_H + 0.01 && b.y0 < 1.85;

export class Colliders {
  constructor(boxes) {
    this.boxes = boxes;
    this.blockers = boxes.filter(isBlocker);
  }

  overlaps(x, y, z, hw, h) {
    for (const b of this.boxes) {
      if (y + h > b.y0 && y < b.y1 && x + hw > b.x0 && x - hw < b.x1 && z + hw > b.z0 && z - hw < b.z1) return true;
    }
    return false;
  }

  // Moves an actor (pos, vel, hw, h) by vel*dt with axis-separated AABB resolution.
  move(a, dt) {
    const p = a.pos, v = a.vel, hw = a.hw, h = a.h;
    const boxes = this.boxes;

    // --- X ---
    p.x += v.x * dt;
    if (v.x !== 0) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (p.y + h > b.y0 && p.y < b.y1 && p.x + hw > b.x0 && p.x - hw < b.x1 && p.z + hw > b.z0 && p.z - hw < b.z1) {
          if (b.y1 - p.y <= STEP_H && !this.overlaps(p.x, b.y1, p.z, hw, h)) { p.y = b.y1; continue; }
          p.x = v.x > 0 ? b.x0 - hw - 1e-3 : b.x1 + hw + 1e-3;
          v.x = 0;
        }
      }
    }
    // --- Z ---
    p.z += v.z * dt;
    if (v.z !== 0) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (p.y + h > b.y0 && p.y < b.y1 && p.x + hw > b.x0 && p.x - hw < b.x1 && p.z + hw > b.z0 && p.z - hw < b.z1) {
          if (b.y1 - p.y <= STEP_H && !this.overlaps(p.x, b.y1, p.z, hw, h)) { p.y = b.y1; continue; }
          p.z = v.z > 0 ? b.z0 - hw - 1e-3 : b.z1 + hw + 1e-3;
          v.z = 0;
        }
      }
    }
    // --- Y ---
    const prevY = p.y;
    p.y += v.y * dt;
    a.onGround = false;
    if (p.y <= 0) { p.y = 0; if (v.y < 0) v.y = 0; a.onGround = true; }
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (p.y + h > b.y0 && p.y < b.y1 && p.x + hw > b.x0 && p.x - hw < b.x1 && p.z + hw > b.z0 && p.z - hw < b.z1) {
        if (v.y <= 0 && prevY >= b.y1 - 0.02) { p.y = b.y1; v.y = 0; a.onGround = true; }
        else if (v.y > 0 && prevY + h <= b.y0 + 0.02) { p.y = b.y0 - h - 1e-3; v.y = 0; }
      }
    }
  }

  // Distance along a normalised ray to the first box hit (or maxD).
  ray(ox, oy, oz, dx, dy, dz, maxD) {
    let best = maxD;
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      let t0 = 0, t1 = best;
      if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) continue; }
      else {
        let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx;
        if (a > c) { const t = a; a = c; c = t; }
        if (a > t0) t0 = a; if (c < t1) t1 = c;
        if (t0 > t1) continue;
      }
      if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) continue; }
      else {
        let a = (b.y0 - oy) / dy, c = (b.y1 - oy) / dy;
        if (a > c) { const t = a; a = c; c = t; }
        if (a > t0) t0 = a; if (c < t1) t1 = c;
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) continue; }
      else {
        let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz;
        if (a > c) { const t = a; a = c; c = t; }
        if (a > t0) t0 = a; if (c < t1) t1 = c;
        if (t0 > t1) continue;
      }
      if (t0 < best) best = t0;
    }
    return best;
  }

  // Is the straight 2D path a->b blocked by anything that stops walking? (margin = body radius)
  segBlocked(ax, az, bx, bz, m) {
    const dx = bx - ax, dz = bz - az;
    for (const b of this.blockers) {
      const x0 = b.x0 - m, x1 = b.x1 + m, z0 = b.z0 - m, z1 = b.z1 + m;
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-9) { if (ax < x0 || ax > x1) continue; }
      else {
        let a = (x0 - ax) / dx, c = (x1 - ax) / dx;
        if (a > c) { const t = a; a = c; c = t; }
        if (a > t0) t0 = a; if (c < t1) t1 = c;
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (az < z0 || az > z1) continue; }
      else {
        let a = (z0 - az) / dz, c = (z1 - az) / dz;
        if (a > c) { const t = a; a = c; c = t; }
        if (a > t0) t0 = a; if (c < t1) t1 = c;
        if (t0 > t1) continue;
      }
      return true;
    }
    return false;
  }
}

// ---- ray helpers for actors --------------------------------------------------------------
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}

export function rayAABB(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [x0, y0, z0], mx = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return Infinity; }
    else {
      let a = (mn[i] - o[i]) / d[i], c = (mx[i] - o[i]) / d[i];
      if (a > c) { const t = a; a = c; c = t; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

// ---- navigation graph --------------------------------------------------------------------
export class NavGraph {
  constructor(col, bounds, step = 3) {
    this.col = col;
    this.nodes = [];   // {x,z}
    this.adj = [];
    const free = (x, z) => {
      for (const b of col.blockers) {
        if (x > b.x0 - 0.8 && x < b.x1 + 0.8 && z > b.z0 - 0.8 && z < b.z1 + 0.8) return false;
      }
      return true;
    };
    const grid = [];
    let gi = 0;
    for (let x = bounds.x0 + 2; x <= bounds.x1 - 2; x += step, gi++) {
      grid[gi] = [];
      let gj = 0;
      for (let z = bounds.z0 + 2; z <= bounds.z1 - 2; z += step, gj++) {
        if (free(x, z)) { grid[gi][gj] = this.nodes.length; this.nodes.push({ x, z }); this.adj.push([]); }
        else grid[gi][gj] = -1;
      }
    }
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        const a = grid[i][j]; if (a < 0) continue;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const row = grid[i + di]; if (!row) continue;
          const b = row[j + dj]; if (b === undefined || b < 0) continue;
          const A = this.nodes[a], B = this.nodes[b];
          if (!col.segBlocked(A.x, A.z, B.x, B.z, 0.45)) this.adj[a].push(b);
        }
      }
    }
    // keep only the largest connected component
    const comp = new Array(this.nodes.length).fill(-1);
    let best = -1, bestSize = 0, cid = 0;
    for (let s = 0; s < this.nodes.length; s++) {
      if (comp[s] >= 0) continue;
      const stack = [s]; comp[s] = cid; let size = 0;
      while (stack.length) { const n = stack.pop(); size++; for (const m of this.adj[n]) if (comp[m] < 0) { comp[m] = cid; stack.push(m); } }
      if (size > bestSize) { bestSize = size; best = cid; }
      cid++;
    }
    this.valid = comp.map((c) => c === best);
    this.validIdx = [];
    for (let i = 0; i < this.nodes.length; i++) if (this.valid[i]) this.validIdx.push(i);
    this.coverage = this.nodes.length ? bestSize / this.nodes.length : 0;
  }

  nearest(x, z) {
    let bi = -1, bd = Infinity;
    for (const i of this.validIdx) {
      const n = this.nodes[i];
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }

  randomNode() { return this.validIdx[Math.floor(Math.random() * this.validIdx.length)]; }

  inRect(r) { return this.validIdx.filter((i) => { const n = this.nodes[i]; return n.x >= r.x0 && n.x <= r.x1 && n.z >= r.z0 && n.z <= r.z1; }); }

  // A* between node ids -> array of node ids (inclusive)
  path(s, g) {
    if (s < 0 || g < 0) return [];
    if (s === g) return [s];
    const N = this.nodes, open = new Set([s]), came = new Map(), gs = new Map([[s, 0]]), fs = new Map();
    const h = (i) => Math.hypot(N[i].x - N[g].x, N[i].z - N[g].z);
    fs.set(s, h(s));
    while (open.size) {
      let cur = -1, cf = Infinity;
      for (const n of open) { const f = fs.get(n); if (f < cf) { cf = f; cur = n; } }
      if (cur === g) {
        const out = [cur];
        while (came.has(cur)) { cur = came.get(cur); out.push(cur); }
        return out.reverse();
      }
      open.delete(cur);
      for (const nb of this.adj[cur]) {
        const t = gs.get(cur) + Math.hypot(N[cur].x - N[nb].x, N[cur].z - N[nb].z);
        if (t < (gs.has(nb) ? gs.get(nb) : Infinity)) {
          came.set(nb, cur); gs.set(nb, t); fs.set(nb, t + h(nb)); open.add(nb);
        }
      }
    }
    return [];
  }
}
