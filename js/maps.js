// Map definitions. Pure data + geometry helpers (no rendering code) so they can be unit-tested in Node.
// Coordinates: x = east/west, z = north/south, y = up. Every map is 80 x 56 metres: x in [-40,40], z in [-28,28].

export const BOUNDS = { x0: -40, x1: 40, z0: -28, z1: 28 };

class Builder {
  constructor() { this.boxes = []; this.visuals = []; }

  // Solid box (collides + renders). Centre x,z; size w(x) d(z) h(y); starts at y0.
  box(x, z, w, d, h, o = {}) {
    const y0 = o.y0 || 0;
    if (o.collide !== false) this.boxes.push({ x0: x - w / 2, x1: x + w / 2, y0, y1: y0 + h, z0: z - d / 2, z1: z + d / 2 });
    this.visuals.push({ shape: 'box', x, z, y0, w, h, d, tex: o.tex || 'concrete', color: o.color ?? 0x888888, tile: o.tile || 4, emissive: o.emissive, cast: o.cast, opacity: o.opacity });
  }
  // Visual only (no collision)
  deco(x, z, w, d, h, o = {}) { this.box(x, z, w, d, h, { ...o, collide: false }); }
  // Cylinder (collides as a square box)
  cyl(x, z, r, h, o = {}) {
    const y0 = o.y0 || 0;
    if (o.collide !== false) this.boxes.push({ x0: x - r, x1: x + r, y0, y1: y0 + h, z0: z - r, z1: z + r });
    this.visuals.push({ shape: 'cyl', x, z, y0, r, h, tex: o.tex || 'metal', color: o.color ?? 0x888888, tile: o.tile || 3, emissive: o.emissive });
  }
  cone(x, z, r, h, o = {}) { this.visuals.push({ shape: 'cone', x, z, y0: o.y0 || 0, r, h, tex: 'plain', color: o.color ?? 0x244a2c, tile: 3 }); }
  disc(x, z, r, o = {}) { this.visuals.push({ shape: 'disc', x, z, y0: o.y0 || 0.01, r, h: 0.04, tex: o.tex || 'plain', color: o.color ?? 0x556677, tile: 4 }); }

  // Axis-aligned wall from (x0,z0) to (x1,z1) with openings: {at: distance from start, w, type:'door'|'window'}
  wall(x0, z0, x1, z1, t, h, o = {}, openings = []) {
    const horiz = z0 === z1;
    const start = horiz ? Math.min(x0, x1) : Math.min(z0, z1);
    const len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const seg = (a, b, ya, yb) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      const c = start + (a + b) / 2, l = b - a;
      if (horiz) this.box(c, z0, l, t, yb - ya, { ...o, y0: ya });
      else this.box(x0, c, t, l, yb - ya, { ...o, y0: ya });
    };
    let cur = 0;
    for (const op of [...openings].sort((a, b) => a.at - b.at)) {
      const s = op.at - op.w / 2, e = op.at + op.w / 2;
      if (s > cur) seg(cur, s, 0, h);
      if (op.type === 'window') { seg(s, e, 0, 0.95); seg(s, e, 2.15, h); }
      cur = e;
    }
    if (cur < len) seg(cur, len, 0, h);
  }

  // Hollow building. doors: array of sides 'px','nx','pz','nz'. windows: sides that get a window.
  building(cx, cz, w, d, h, o = {}) {
    const t = 0.5, doors = o.doors || [], wins = o.windows || [];
    const sides = {
      nz: [cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2, w],
      pz: [cx - w / 2, cz + d / 2, cx + w / 2, cz + d / 2, w],
      nx: [cx - w / 2, cz - d / 2, cx - w / 2, cz + d / 2, d],
      px: [cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2, d],
    };
    for (const k of Object.keys(sides)) {
      const [a, b, c, e, len] = sides[k];
      const ops = [];
      if (doors.includes(k)) ops.push({ at: len / 2, w: 2.6, type: 'door' });
      if (wins.includes(k)) { ops.push({ at: len * 0.2, w: 1.6, type: 'window' }); ops.push({ at: len * 0.8, w: 1.6, type: 'window' }); }
      this.wall(a, b, c, e, t, h, o, ops);
    }
    this.box(cx, cz, w + 0.8, d + 0.8, 0.3, { ...o, y0: h, tex: o.roofTex || 'concrete', color: o.roofColor ?? 0x6b6258 });
  }

  // Stairs rising from (x,z) in direction dir ('px','nx','pz','nz')
  stairs(x, z, dir, n, width, rise, run, o = {}) {
    for (let i = 0; i < n; i++) {
      const off = (i + 0.5) * run, top = (i + 1) * rise;
      if (dir === 'nx') this.box(x - off, z, run, width, top, o);
      else if (dir === 'px') this.box(x + off, z, run, width, top, o);
      else if (dir === 'nz') this.box(x, z - off, width, run, top, o);
      else this.box(x, z + off, width, run, top, o);
    }
  }

  outerWalls(h, o = {}) {
    const B = BOUNDS, t = 2;
    this.box(0, B.z0 - t / 2, (B.x1 - B.x0) + t * 2, t, h, o);
    this.box(0, B.z1 + t / 2, (B.x1 - B.x0) + t * 2, t, h, o);
    this.box(B.x0 - t / 2, 0, t, (B.z1 - B.z0), h, o);
    this.box(B.x1 + t / 2, 0, t, (B.z1 - B.z0), h, o);
  }
}

// seeded RNG so decorations are identical every load
function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

const SPAWNS = { 0: { x0: -37, x1: -29, z0: -24, z1: 24 }, 1: { x0: 29, x1: 37, z0: -24, z1: 24 } };

// ------------------------------------------------------------------------------------------
// 1. WAREHOUSE - indoor, containers + central catwalk
// ------------------------------------------------------------------------------------------
function warehouse() {
  const b = new Builder();
  b.outerWalls(12, { tex: 'metal', color: 0x59616b, tile: 6 });
  b.box(0, 0, 90, 66, 0.5, { y0: 12, tex: 'metal', color: 0x2d3238, collide: true, cast: false });  // roof
  const cols = [0xb23a2f, 0x2f5fa6, 0x3f8a4a, 0xc7842b, 0x7a4a9b, 0x2f8a8a];
  let ci = 0;
  const cont = (x, z, w, d, y0 = 0) => b.box(x, z, w, d, 2.6, { y0, tex: 'metal', color: cols[ci++ % cols.length], tile: 3 });
  // two long rows of containers (gaps are lanes)
  for (const z of [-12, 12]) for (const x of [-26, -10, 10, 26]) cont(x, z, 12, 2.6);
  cont(-10, -12, 12, 2.6, 2.6); cont(26, 12, 12, 2.6, 2.6);   // stacked
  // perpendicular containers near spawns
  cont(-32, -3, 2.6, 8); cont(32, 3, 2.6, 8);
  // central catwalk (reached by stairs both ends)
  b.box(0, 0, 20, 6, 0.4, { y0: 2.8, tex: 'metal', color: 0x3c4046, tile: 2 });
  b.stairs(16.4, 0, 'nx', 8, 3, 0.4, 0.8, { tex: 'metal', color: 0x4b5058, tile: 2 });
  b.stairs(-16.4, 0, 'px', 8, 3, 0.4, 0.8, { tex: 'metal', color: 0x4b5058, tile: 2 });
  b.box(0, 2.85, 20, 0.3, 1.0, { y0: 3.2, tex: 'metal', color: 0xd9a11a, tile: 2 });
  b.box(0, -2.85, 20, 0.3, 1.0, { y0: 3.2, tex: 'metal', color: 0xd9a11a, tile: 2 });
  for (const sx of [-9.7, 9.7]) for (const sz of [-2.8, 2.8]) b.box(sx, sz, 0.6, 0.6, 2.8, { tex: 'metal', color: 0xd9a11a });
  // pillars
  for (const x of [-22, 22]) b.box(x, 0, 1.4, 1.4, 12, { tex: 'concrete', color: 0x6e7379 });
  // crates and pallets in the side lanes
  const crate = (x, z, s = 2, h = 2) => b.box(x, z, s, s, h, { tex: 'crate', color: 0xa07040, tile: 2 });
  crate(-8, -22); crate(-5.5, -22, 2, 1.2); crate(8, -21.5); crate(0, -18, 3, 1.2); crate(18, -22, 2.4, 2.4); crate(-18, -23, 2.4, 1.2);
  crate(8, 22); crate(5.5, 22, 2, 1.2); crate(-8, 21.5); crate(0, 18, 3, 1.2); crate(-18, 22, 2.4, 2.4); crate(18, 23, 2.4, 1.2);
  crate(-30, 16, 2, 1.2); crate(-30, -16, 2, 1.2); crate(30, 16, 2, 1.2); crate(30, -16, 2, 1.2);
  crate(-3, -6, 1.6, 1.0); crate(3, 6, 1.6, 1.0);
  // barrels
  for (const [x, z] of [[-14, -6], [-14, 6], [14, -6], [14, 6], [-24, 0], [24, 0]]) b.cyl(x, z, 0.5, 1.1, { tex: 'metal', color: 0x2e6aa8 });
  // ceiling lights (decor)
  for (const x of [-30, -15, 0, 15, 30]) for (const z of [-20, -7, 7, 20]) b.deco(x, z, 6, 0.8, 0.2, { y0: 11.6, tex: 'plain', color: 0xffffff, emissive: 0xfff2d0 });
  return finish(b, {
    id: 'warehouse',
    indoor: true,
    sky: [0x1b1e24, 0x2b2f36], fog: [0x23262c, 30, 85],
    hemi: [0xbfc8d6, 0x2a2a2e, 0.9], sun: null,
    lights: [[-22, 9, -14], [22, 9, -14], [-22, 9, 14], [22, 9, 14], [0, 9, 0]],
    ground: { tex: 'concrete', color: 0x5a5d62, tile: 6 },
    impact: 0xd8d0c0,
  });
}

// ------------------------------------------------------------------------------------------
// 2. DUST - desert village
// ------------------------------------------------------------------------------------------
function dust() {
  const b = new Builder();
  b.outerWalls(7, { tex: 'brick', color: 0xb98f5f, tile: 3 });
  const mud = { tex: 'brick', color: 0xc49a66, tile: 3, roofColor: 0x8b6a45 };
  b.building(-24, -13, 10, 8, 3.6, { ...mud, doors: ['px'], windows: ['nz', 'pz'] });
  b.building(-24, 13, 10, 8, 3.6, { ...mud, doors: ['px'], windows: ['nz', 'pz'] });
  b.building(24, -13, 10, 8, 3.6, { ...mud, doors: ['nx'], windows: ['nz', 'pz'] });
  b.building(24, 13, 10, 8, 3.6, { ...mud, doors: ['nx'], windows: ['nz', 'pz'] });
  b.building(-9, -21, 8, 6, 3.4, { ...mud, color: 0xd0a46c, doors: ['pz'], windows: ['px'] });
  b.building(9, 21, 8, 6, 3.4, { ...mud, color: 0xd0a46c, doors: ['nz'], windows: ['nx'] });
  b.building(9, -20, 6, 6, 3.4, { ...mud, doors: ['nx'], windows: ['pz'] });
  b.building(-9, 20, 6, 6, 3.4, { ...mud, doors: ['px'], windows: ['nz'] });
  // plaza with a well and low walls
  b.cyl(0, 0, 1.6, 1.1, { tex: 'brick', color: 0x9c8466 });
  b.box(-6, -5, 7, 0.8, 1.1, { tex: 'brick', color: 0xb08a58 }); b.box(6, 5, 7, 0.8, 1.1, { tex: 'brick', color: 0xb08a58 });
  b.box(-6, 5, 0.8, 5, 1.1, { tex: 'brick', color: 0xb08a58 }); b.box(6, -5, 0.8, 5, 1.1, { tex: 'brick', color: 0xb08a58 });
  // silos
  b.cyl(0, 22, 3, 7.5, { tex: 'brick', color: 0xcdb48a }); b.cyl(0, -22, 3, 7.5, { tex: 'brick', color: 0xcdb48a });
  // market stalls (awning sits above head height)
  for (const [x, z] of [[-14, 0], [14, 0]]) {
    b.box(x, z, 4, 1.6, 1.0, { tex: 'wood', color: 0x8a5a2b, tile: 2 });
    b.deco(x, z, 5, 3, 0.15, { y0: 2.6, tex: 'plain', color: 0xb23a2f });
    for (const dx of [-2.2, 2.2]) b.deco(x + dx, z + 1.4, 0.15, 0.15, 2.6, { tex: 'wood', color: 0x5a3a1b });
  }
  // sandbags near spawns
  b.box(-32, -8, 1.2, 7, 1.2, { tex: 'sand', color: 0x9b8a62 }); b.box(-32, 8, 1.2, 7, 1.2, { tex: 'sand', color: 0x9b8a62 });
  b.box(32, -8, 1.2, 7, 1.2, { tex: 'sand', color: 0x9b8a62 }); b.box(32, 8, 1.2, 7, 1.2, { tex: 'sand', color: 0x9b8a62 });
  // crates + barrels
  const crate = (x, z, s = 1.6, h = 1.6) => b.box(x, z, s, s, h, { tex: 'crate', color: 0x9a6c3c, tile: 2 });
  crate(-17, -2); crate(-17, 2, 1.6, 1.0); crate(17, -2, 1.6, 1.0); crate(17, 2); crate(-2, 11, 2.2, 1.2); crate(2, -11, 2.2, 1.2);
  crate(-14, -24); crate(14, 24); crate(-33, 0, 2, 1.2); crate(33, 0, 2, 1.2);
  for (const [x, z] of [[-3, -3], [3, 3], [-20, 25], [20, -25], [-12, 12], [12, -12]]) b.cyl(x, z, 0.45, 1.0, { tex: 'metal', color: 0x7a4a2a });
  // burnt-out car (a long low box + cabin)
  b.box(-1, 17, 4.2, 1.8, 0.9, { tex: 'metal', color: 0x6e5d4b }); b.box(-1, 17, 2, 1.7, 0.6, { y0: 0.9, tex: 'metal', color: 0x4b4034 });
  b.box(1, -17, 4.2, 1.8, 0.9, { tex: 'metal', color: 0x4b5a6b }); b.box(1, -17, 2, 1.7, 0.6, { y0: 0.9, tex: 'metal', color: 0x333d47 });
  return finish(b, {
    id: 'dust',
    sky: [0x5f9fd6, 0xf1d9a8], fog: [0xe6cfa0, 50, 160],
    hemi: [0xfff0d0, 0xb08a5a, 1.0], sun: { color: 0xfff1d0, intensity: 3.2, pos: [-30, 40, 20] },
    ground: { tex: 'sand', color: 0xd2b27c, tile: 8 },
    impact: 0xcdb48a,
  });
}

// ------------------------------------------------------------------------------------------
// 3. SKYLINE - rooftop at dusk
// ------------------------------------------------------------------------------------------
function skyline() {
  const b = new Builder();
  // low visible parapet + tall invisible-ish boundary (so nobody can leave)
  b.outerWalls(1.3, { tex: 'concrete', color: 0x8a8d92, tile: 3 });
  const B = BOUNDS, t = 2, H = 10;
  const inv = { tex: 'plain', color: 0x88aacc, opacity: 0.0, cast: false };
  b.box(0, B.z0 - t / 2 - 2, 90, t, H, inv); b.box(0, B.z1 + t / 2 + 2, 90, t, H, inv);
  b.box(B.x0 - t / 2 - 2, 0, t, 60, H, inv); b.box(B.x1 + t / 2 + 2, 0, t, 60, H, inv);
  const hvac = (x, z, w, d, h = 2.4) => { b.box(x, z, w, d, h, { tex: 'metal', color: 0xb9bec4, tile: 2 }); b.deco(x, z, w * 0.6, d * 0.6, 0.15, { y0: h, tex: 'metal', color: 0x4c5056 }); };
  hvac(-14, -8, 5, 3); hvac(14, 8, 5, 3); hvac(-20, 10, 4, 3, 2.2); hvac(20, -10, 4, 3, 2.2); hvac(0, -19, 7, 3, 2.6); hvac(0, 19, 7, 3, 2.6);
  hvac(-10, 20, 3, 3, 2); hvac(10, -20, 3, 3, 2);
  // stair huts
  const hut = { tex: 'concrete', color: 0xa39d92, roofColor: 0x57595e };
  b.building(-30, 0, 7, 8, 3.4, { ...hut, doors: ['px', 'nz'] });
  b.building(30, 0, 7, 8, 3.4, { ...hut, doors: ['nx', 'pz'] });
  // water tank on legs (high enough to walk beneath)
  b.cyl(0, 0, 2.3, 3.2, { y0: 2.4, tex: 'wood', color: 0x7d5a3a });
  for (const dx of [-1.6, 1.6]) for (const dz of [-1.6, 1.6]) b.box(dx, dz, 0.4, 0.4, 2.4, { tex: 'metal', color: 0x444a50 });
  // solar panel rows (jump-over cover)
  for (const [x, z] of [[-9, -19], [9, 19], [-26, -20], [26, 20], [-26, 20], [26, -20]]) b.box(x, z, 6, 1.6, 1.0, { tex: 'metal', color: 0x23395b, tile: 2 });
  // vent stacks, low pipes
  for (const [x, z] of [[-5, 8], [5, -8], [-17, -17], [17, 17]]) b.cyl(x, z, 0.6, 2.2, { tex: 'metal', color: 0x8f959c });
  b.box(-12, 0, 0.5, 14, 0.5, { tex: 'metal', color: 0x5d6168, collide: true });
  b.box(12, 0, 0.5, 14, 0.5, { tex: 'metal', color: 0x5d6168 });
  // cover blocks
  const blk = (x, z, w, d, h) => b.box(x, z, w, d, h, { tex: 'concrete', color: 0x7e8187 });
  blk(-6, -12, 3, 1.2, 1.2); blk(6, 12, 3, 1.2, 1.2); blk(-6, 12, 1.2, 3, 1.2); blk(6, -12, 1.2, 3, 1.2);
  blk(-34, -18, 3, 3, 2); blk(34, 18, 3, 3, 2); blk(-34, 18, 3, 3, 2); blk(34, -18, 3, 3, 2);
  // helipad (decor)
  b.disc(0, -8.5, 3.6, { color: 0x30343a }); b.disc(0, -8.5, 2.6, { y0: 0.03, color: 0xe6c53a });
  // distant skyline (decor, outside the arena)
  const r = rng(7);
  for (let i = 0; i < 46; i++) {
    const ang = (i / 46) * Math.PI * 2, rad = 75 + r() * 70;
    const w = 12 + r() * 20, h = 25 + r() * 90;
    b.deco(Math.cos(ang) * rad * 1.35, Math.sin(ang) * rad, w, w, h, { y0: -2, tex: 'windows', color: 0xffffff, tile: 10, cast: false });
  }
  return finish(b, {
    id: 'skyline',
    sky: [0x2b2f5a, 0xf0956a], fog: [0xd88a78, 60, 230],
    hemi: [0xffc9a8, 0x4a3f55, 0.95], sun: { color: 0xffb27a, intensity: 2.6, pos: [40, 22, -30] },
    ground: { tex: 'tile', color: 0x8a8d92, tile: 6 },
    impact: 0xb8b8b8,
  });
}

// ------------------------------------------------------------------------------------------
// 4. FROSTBITE - snow compound with watchtowers
// ------------------------------------------------------------------------------------------
function frostbite() {
  const b = new Builder();
  b.outerWalls(6, { tex: 'wood', color: 0x6b5238, tile: 3 });
  const cabin = { tex: 'wood', color: 0x8a6a45, roofColor: 0xdfe6ee, roofTex: 'snow' };
  b.building(-22, -12, 9, 7, 3.2, { ...cabin, doors: ['px'], windows: ['nz', 'pz'] });
  b.building(22, 12, 9, 7, 3.2, { ...cabin, doors: ['nx'], windows: ['nz', 'pz'] });
  b.building(-22, 14, 7, 7, 3.2, { ...cabin, doors: ['nz'], windows: ['px'] });
  b.building(22, -14, 7, 7, 3.2, { ...cabin, doors: ['pz'], windows: ['nx'] });
  // watchtowers (sniper perches), reached by stairs
  const tower = (pz) => {
    const c = pz < 0 ? 1 : -1;                 // direction from the tower towards the map centre
    const edge = pz + c * 2.5;                 // platform edge that faces the centre
    b.box(0, pz, 5, 5, 0.3, { y0: 4.2, tex: 'wood', color: 0x7a5a38, tile: 2 });
    for (const dx of [-2.2, 2.2]) for (const dz of [-2.2, 2.2]) b.box(dx, pz + dz, 0.5, 0.5, 4.2, { tex: 'wood', color: 0x5c4129 });
    b.box(-2.4, pz, 0.2, 5, 1.0, { y0: 4.5, tex: 'wood', color: 0x6a4d30 });
    b.box(2.4, pz, 0.2, 5, 1.0, { y0: 4.5, tex: 'wood', color: 0x6a4d30 });
    b.box(0, pz - c * 2.4, 5, 0.2, 1.0, { y0: 4.5, tex: 'wood', color: 0x6a4d30 });
    // 10 steps x 0.45 rise, 0.8 run: climbs away from the centre and ends flush with the platform
    b.stairs(0, edge + c * 8, c > 0 ? 'nz' : 'pz', 10, 3, 0.45, 0.8, { tex: 'wood', color: 0x7a5a38, tile: 2 });
  };
  tower(-16);   // platform z in [-18.5,-13.5]; stairs start at z=-5.5
  tower(16);
  // rocks
  const rock = (x, z, w, d, h, c = 0x6f757b) => b.box(x, z, w, d, h, { tex: 'concrete', color: c, tile: 3 });
  rock(-9, 0, 4, 3, 2.4); rock(-8, 1.6, 2.4, 2.4, 3.4); rock(-10.5, -1.8, 2, 2, 1.4);
  rock(9, 0, 4, 3, 2.4); rock(8, -1.6, 2.4, 2.4, 3.4); rock(10.5, 1.8, 2, 2, 1.4);
  // sandbag lines & barriers
  b.box(-14, -4, 6, 0.9, 1.15, { tex: 'sand', color: 0x9a9680 }); b.box(14, 4, 6, 0.9, 1.15, { tex: 'sand', color: 0x9a9680 });
  b.box(-31, -10, 1, 6, 1.15, { tex: 'sand', color: 0x9a9680 }); b.box(31, 10, 1, 6, 1.15, { tex: 'sand', color: 0x9a9680 });
  b.box(-31, 10, 1, 6, 1.15, { tex: 'sand', color: 0x9a9680 }); b.box(31, -10, 1, 6, 1.15, { tex: 'sand', color: 0x9a9680 });
  // cargo containers
  b.box(-4, 9, 6, 2.4, 2.6, { tex: 'metal', color: 0x2f5fa6, tile: 3 }); b.box(4, -9, 6, 2.4, 2.6, { tex: 'metal', color: 0xb23a2f, tile: 3 });
  b.box(-12, -22, 2.4, 6, 2.6, { tex: 'metal', color: 0x3f8a4a, tile: 3 }); b.box(12, 22, 2.4, 6, 2.6, { tex: 'metal', color: 0xc7842b, tile: 3 });
  // crates
  const crate = (x, z, s = 1.6, h = 1.6) => b.box(x, z, s, s, h, { tex: 'crate', color: 0x8a6a45, tile: 2 });
  crate(-15, 4); crate(15, -4); crate(-3, -2, 1.6, 1.0); crate(3, 2, 1.6, 1.0); crate(-33, 0, 2, 1.2); crate(33, 0, 2, 1.2);
  // pines
  const pine = (x, z, s = 1) => { b.box(x, z, 0.6, 0.6, 3 * s, { tex: 'wood', color: 0x4a3524 }); b.cone(x, z, 1.9 * s, 5 * s, { y0: 1.6 * s, color: 0x1f4a2e }); b.cone(x, z, 1.4 * s, 4 * s, { y0: 3.6 * s, color: 0x275a38 }); };
  for (const [x, z, s] of [[-12, -9, 1], [12, 9, 1], [-17, 21, 1.1], [17, -21, 1.1], [-31, -22, 1], [31, 22, 1], [-31, 22, 1], [31, -22, 1], [-5, 24, 1], [5, -24, 1], [13, -7, 0.9], [-13, 7, 0.9], [-26, 0, 1.2], [26, 0, 1.2], [0, 26, 1.1], [0, -26, 1.1]]) pine(x, z, s);
  // frozen pond (decor)
  b.disc(0, 9.5, 4.5, { color: 0x9ccbe8, y0: 0.02 });
  return finish(b, {
    id: 'frostbite',
    snow: true,
    sky: [0x4f6f93, 0xdfe9f2], fog: [0xcfdbe6, 25, 120],
    hemi: [0xdfeaff, 0x8fa0b4, 1.15], sun: { color: 0xe8f0ff, intensity: 2.2, pos: [20, 40, 30] },
    ground: { tex: 'snow', color: 0xf2f6fb, tile: 8 },
    impact: 0xe8eef5,
  });
}

function finish(b, theme) {
  return { ...theme, bounds: BOUNDS, boxes: b.boxes, visuals: b.visuals, spawns: SPAWNS };
}

export const MAP_INFO = {
  warehouse: { name: 'Warehouse', desc: 'Indoor containers & a central catwalk. Tight lanes, close fights.', thumb: 'linear-gradient(135deg,#2b2f36,#59616b 55%,#c7842b)' },
  dust: { name: 'Dust', desc: 'Desert village. Buildings, windows and a busy central plaza.', thumb: 'linear-gradient(135deg,#f1d9a8,#c49a66 55%,#5f9fd6)' },
  skyline: { name: 'Skyline', desc: 'Rooftop at dusk. HVAC cover, stair huts, open sightlines.', thumb: 'linear-gradient(135deg,#2b2f5a,#d8725a 60%,#f0956a)' },
  frostbite: { name: 'Frostbite', desc: 'Snow compound with watchtowers for long-range duels.', thumb: 'linear-gradient(135deg,#4f6f93,#dfe9f2 60%,#8a6a45)' },
};

export const MAP_BUILDERS = { warehouse, dust, skyline, frostbite };
export const MAP_IDS = Object.keys(MAP_BUILDERS);
export function buildMap(id) { return MAP_BUILDERS[id](); }
