import * as THREE from 'three';

// 5 primaries + 3 secondaries.  Angles in radians, ranges in metres.
// dmg = damage per bullet/pellet, rpm = rounds per minute, range = [full damage until, minimum damage from].
export const WEAPONS = {
  // ---------------- PRIMARIES ----------------
  vmp: {
    id: 'vmp', name: 'VMP', slot: 'primary', cls: 'smg', desc: 'Fast-firing SMG. Great mobility, melts at close range.',
    dmg: 22, hs: 1.5, rpm: 860, auto: true, mag: 32, reserve: 192, reload: 1.8,
    spread: 0.030, adsSpread: 0.006, recoil: 0.0045, recoilYaw: 0.0030, range: [10, 30], minMul: 0.5, pellets: 1,
    zoom: 1.3, scope: false, moveMul: 1.08, snd: { f: 3200, len: 0.09, thump: 0.5 },
    model: { bodyL: 0.34, bodyH: 0.07, bodyW: 0.045, barrelL: 0.14, barrelR: 0.012, hand: 0.14, stockL: 0.17, gripH: 0.1, magH: 0.17, magL: 0.035, magZ: -0.03, magTilt: 0.08, color: 0x1b1d21, accent: 0x34373d, dot: true },
  },
  m4a1: {
    id: 'm4a1', name: 'M4A1', slot: 'primary', cls: 'ar', desc: 'Balanced assault rifle. Accurate and easy to control.',
    dmg: 26, hs: 1.4, rpm: 660, auto: true, mag: 30, reserve: 180, reload: 2.2,
    spread: 0.028, adsSpread: 0.003, recoil: 0.0060, recoilYaw: 0.0030, range: [20, 50], minMul: 0.65, pellets: 1,
    zoom: 1.5, scope: false, moveMul: 1.0, snd: { f: 2600, len: 0.11, thump: 0.6 },
    model: { bodyL: 0.40, bodyH: 0.08, bodyW: 0.05, barrelL: 0.30, barrelR: 0.011, hand: 0.22, stockL: 0.21, gripH: 0.1, magH: 0.16, magL: 0.04, magZ: -0.02, magTilt: -0.12, color: 0x23262a, accent: 0x40444b, rail: true },
  },
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 'primary', cls: 'ar', desc: 'Hard-hitting rifle. Heavy recoil, big damage.',
    dmg: 33, hs: 1.4, rpm: 520, auto: true, mag: 30, reserve: 150, reload: 2.5,
    spread: 0.034, adsSpread: 0.004, recoil: 0.0092, recoilYaw: 0.0050, range: [22, 55], minMul: 0.7, pellets: 1,
    zoom: 1.45, scope: false, moveMul: 0.96, snd: { f: 2100, len: 0.13, thump: 0.8 },
    model: { bodyL: 0.40, bodyH: 0.075, bodyW: 0.048, barrelL: 0.32, barrelR: 0.011, hand: 0.2, stockL: 0.26, gripH: 0.1, magH: 0.21, magL: 0.04, magZ: -0.03, magTilt: 0.35, color: 0x2b2b2b, accent: 0x7a4a24 },
  },
  kar98k: {
    id: 'kar98k', name: 'Kar98k', slot: 'primary', cls: 'sniper', desc: 'Bolt-action sniper. One shot to the body kills.',
    dmg: 105, hs: 2.0, rpm: 46, auto: false, mag: 5, reserve: 25, reload: 3.0,
    spread: 0.09, adsSpread: 0.0004, recoil: 0.03, recoilYaw: 0.004, range: [60, 120], minMul: 0.95, pellets: 1,
    zoom: 4.0, scope: true, moveMul: 0.9, snd: { f: 1500, len: 0.22, thump: 1.1 },
    model: { bodyL: 0.50, bodyH: 0.055, bodyW: 0.04, barrelL: 0.5, barrelR: 0.011, hand: 0.0, stockL: 0.3, gripH: 0.08, magH: 0.04, magL: 0.05, magZ: 0, color: 0x2f3338, accent: 0x6b4423, scope: true, bolt: true },
  },
  m680: {
    id: 'm680', name: 'Model 680', slot: 'primary', cls: 'shotgun', desc: 'Pump shotgun. Devastating up close, weak at range.',
    dmg: 12, hs: 1.3, rpm: 72, auto: false, mag: 6, reserve: 36, reload: 2.6,
    spread: 0.07, adsSpread: 0.045, recoil: 0.022, recoilYaw: 0.004, range: [5, 16], minMul: 0.15, pellets: 10,
    zoom: 1.2, scope: false, moveMul: 1.0, snd: { f: 1100, len: 0.2, thump: 1.2 },
    model: { bodyL: 0.34, bodyH: 0.06, bodyW: 0.045, barrelL: 0.42, barrelR: 0.016, hand: 0.0, stockL: 0.28, gripH: 0.09, magH: 0, color: 0x25282c, accent: 0x5b3c22, pump: true },
  },

  // ---------------- SECONDARIES ----------------
  g18: {
    id: 'g18', name: 'G18', slot: 'secondary', cls: 'pistol', desc: 'Full-auto machine pistol. Insane fire rate, burns ammo.',
    dmg: 17, hs: 1.4, rpm: 1100, auto: true, mag: 24, reserve: 96, reload: 1.5,
    spread: 0.034, adsSpread: 0.012, recoil: 0.0042, recoilYaw: 0.0035, range: [8, 22], minMul: 0.45, pellets: 1,
    zoom: 1.2, scope: false, moveMul: 1.1, snd: { f: 3000, len: 0.07, thump: 0.4 },
    model: { bodyL: 0.19, bodyH: 0.045, bodyW: 0.03, barrelL: 0.015, barrelR: 0.01, hand: 0, stockL: 0, gripH: 0.095, magH: 0.1, magL: 0.03, magZ: 0.04, magTilt: 0, color: 0x15171a, accent: 0x2a2d31, pistol: true },
  },
  m1911: {
    id: 'm1911', name: 'M1911', slot: 'secondary', cls: 'pistol', desc: 'Classic .45. Accurate semi-auto, three shots to kill.',
    dmg: 36, hs: 1.5, rpm: 420, auto: false, mag: 8, reserve: 48, reload: 1.4,
    spread: 0.022, adsSpread: 0.004, recoil: 0.012, recoilYaw: 0.003, range: [14, 35], minMul: 0.6, pellets: 1,
    zoom: 1.25, scope: false, moveMul: 1.08, snd: { f: 2000, len: 0.12, thump: 0.8 },
    model: { bodyL: 0.2, bodyH: 0.042, bodyW: 0.028, barrelL: 0.012, barrelR: 0.01, hand: 0, stockL: 0, gripH: 0.095, magH: 0.02, magL: 0.026, magZ: 0.05, magTilt: 0, color: 0xa4a9af, accent: 0x3a2a1c, pistol: true },
  },
  magnum: {
    id: 'magnum', name: '.357 Magnum', slot: 'secondary', cls: 'pistol', desc: 'Hand cannon revolver. Two shots to kill.',
    dmg: 70, hs: 1.5, rpm: 130, auto: false, mag: 6, reserve: 30, reload: 2.4,
    spread: 0.02, adsSpread: 0.002, recoil: 0.03, recoilYaw: 0.004, range: [20, 45], minMul: 0.7, pellets: 1,
    zoom: 1.3, scope: false, moveMul: 1.05, snd: { f: 1300, len: 0.18, thump: 1.1 },
    model: { bodyL: 0.17, bodyH: 0.045, bodyW: 0.03, barrelL: 0.13, barrelR: 0.012, hand: 0, stockL: 0, gripH: 0.1, magH: 0, color: 0x8d9298, accent: 0x4a2f1b, pistol: true, cyl: true },
  },
};

export const PRIMARIES = ['vmp', 'm4a1', 'ak47', 'kar98k', 'm680'];
export const SECONDARIES = ['g18', 'm1911', 'magnum'];

// Stats used by the loadout screen bars (0..1)
export function weaponBars(w) {
  return {
    Damage: Math.min(1, (w.dmg * Math.min(w.pellets, 4)) / 105),
    'Fire rate': Math.min(1, w.rpm / 1100),
    Range: Math.min(1, w.range[1] / 120),
    Control: Math.max(0.1, 1 - w.recoil / 0.032),
    Mobility: Math.min(1, (w.moveMul - 0.85) / 0.3),
  };
}

// ---- procedural gun model -------------------------------------------------------------------
// Gun local space: -Z is forward, +Y up, origin at the middle of the receiver.
const matCache = new Map();
function stdMat(color, metal = 0.5, rough = 0.5) {
  const k = `${color}-${metal}-${rough}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
  return matCache.get(k);
}

export function buildGun(w) {
  const m = w.model, g = new THREE.Group();
  const dark = stdMat(m.color, 0.7, 0.4), acc = stdMat(m.accent, 0.2, 0.75), black = stdMat(0x0a0a0a, 0.4, 0.6);
  const add = (geo, mat, x, y, z, rx = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.rotation.x = rx; g.add(me); return me; };
  const L = m.bodyL, H = m.bodyH, W = m.bodyW;
  add(new THREE.BoxGeometry(W, H, L), dark, 0, 0, 0);                                         // receiver / slide
  const bl = m.barrelL;
  add(new THREE.CylinderGeometry(m.barrelR, m.barrelR, bl, 10), dark, 0, 0.008, -(L / 2 + bl / 2) + 0.01, Math.PI / 2);   // barrel
  if (m.hand) add(new THREE.BoxGeometry(W * 1.08, H * 0.92, m.hand), acc, 0, -0.004, -(L / 2 + m.hand / 2) + 0.03);       // handguard
  if (m.stockL) add(new THREE.BoxGeometry(W * 0.85, H * 1.15, m.stockL), acc, 0, -0.012, L / 2 + m.stockL / 2 - 0.01);    // stock
  if (m.pistol) add(new THREE.BoxGeometry(W * 0.95, m.gripH, 0.04), acc, 0, -H / 2 - m.gripH / 2 + 0.006, L * 0.3, -0.22); // pistol grip
  else add(new THREE.BoxGeometry(W * 0.9, m.gripH, 0.035), acc, 0, -H / 2 - m.gripH / 2 + 0.005, L * 0.28, -0.3);        // rifle grip
  if (m.magH) add(new THREE.BoxGeometry(W * 0.8, m.magH, m.magL || 0.04), m.pistol ? dark : black, 0, -H / 2 - m.magH / 2 + 0.004, m.magZ ?? -0.02, m.magTilt || 0);
  if (m.cyl) add(new THREE.CylinderGeometry(0.036, 0.036, 0.055, 12), dark, 0, 0.0, -L / 2 + 0.03, Math.PI / 2);          // revolver drum
  if (m.pump) add(new THREE.BoxGeometry(W * 1.1, H * 0.8, 0.14), acc, 0, -0.03, -L / 2 - 0.1);                           // pump
  if (m.bolt) add(new THREE.BoxGeometry(0.06, 0.012, 0.012), dark, 0.03, 0.01, 0.05);                                   // bolt handle
  if (m.rail) add(new THREE.BoxGeometry(0.018, 0.012, L * 0.9), black, 0, H / 2 + 0.006, -0.02);                         // top rail
  // sights
  add(new THREE.BoxGeometry(0.008, 0.016, 0.008), black, 0, H / 2 + 0.008, -(L / 2 + Math.min(bl, 0.2) * 0.6));
  add(new THREE.BoxGeometry(0.02, 0.014, 0.01), black, 0, H / 2 + 0.007, L / 2 - 0.04);
  if (m.scope) {
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 12), black, 0, H / 2 + 0.04, -0.02, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12), black, 0, H / 2 + 0.04, -0.14, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12), black, 0, H / 2 + 0.04, 0.1, Math.PI / 2);
  }
  if (m.dot) add(new THREE.BoxGeometry(0.03, 0.03, 0.04), black, 0, H / 2 + 0.02, -0.02);
  g.userData.muzzle = new THREE.Vector3(0, 0.008, -(L / 2 + bl) + 0.01);
  g.userData.sightY = H / 2 + (m.scope ? 0.05 : m.dot ? 0.03 : 0.022);
  return g;
}
