import * as THREE from 'three';

// ------------------------------------------------------------------------------------------------
// Gun models.
//  * Weapons with an `asset` (e.g. the VMP) are loaded from assets/models/<id>.json - baked from your
//    FBX files by tools/fbx2model.py.  If the file is missing, the procedural stand-in below is used.
//  * Every other weapon is built procedurally from boxes/cylinders until you replace it with a real model.
// Conventions (same for both): origin = middle of the receiver, -Z = barrel direction, +Y = up, metres.
// Each model exposes userData: muzzle, sightY, grip (trigger hand), fore (support hand), pistol.
// ------------------------------------------------------------------------------------------------

export const MODEL_DATA = {};

export async function loadModels(weapons) {
  const jobs = [];
  for (const w of Object.values(weapons)) {
    if (!w.asset || MODEL_DATA[w.asset.id]) continue;
    jobs.push(fetch(`assets/models/${w.asset.id}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.parts) MODEL_DATA[w.asset.id] = j; }).catch(() => {}));
  }
  await Promise.all(jobs);
  return Object.keys(MODEL_DATA);
}

// ---- shared materials -----------------------------------------------------------------------
const matCache = new Map();
function mat(color, metal = 0.5, rough = 0.5, extra) {
  const k = `${color}|${metal}|${rough}|${extra ? JSON.stringify(extra) : ''}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...(extra || {}) }));
  return matCache.get(k);
}
const M = {
  steel: () => mat(0x2c2f34, 0.85, 0.38),
  blued: () => mat(0x1b1d21, 0.8, 0.42),
  silver: () => mat(0xaeb3b9, 0.9, 0.3),
  poly: () => mat(0x212327, 0.1, 0.8),
  polyTan: () => mat(0x6b5f48, 0.1, 0.8),
  rubber: () => mat(0x111213, 0.0, 0.95),
  wood: () => mat(0x7a4a24, 0.05, 0.7),
  woodDark: () => mat(0x4a2c15, 0.05, 0.7),
  black: () => mat(0x08090a, 0.3, 0.6),
  brass: () => mat(0xb08a3a, 0.9, 0.35),
  glass: () => mat(0x3a7fb0, 0.2, 0.1, { transparent: true, opacity: 0.55 }),
  lens: () => mat(0x1b3a55, 0.3, 0.05),
  red: () => mat(0xc0392b, 0.1, 0.6),
};

class B {
  constructor() { this.g = new THREE.Group(); }
  _add(geo, m, x, y, z, rx = 0, ry = 0, rz = 0) { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); this.g.add(me); return me; }
  box(w, h, d, x, y, z, m, rx = 0, ry = 0, rz = 0) { return this._add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz); }
  // cylinder lying along Z (barrels, tubes)
  tube(r, len, x, y, z, m, r2) { return this._add(new THREE.CylinderGeometry(r2 ?? r, r, len, 12), m, x, y, z, Math.PI / 2); }
  // cylinder standing along Y
  post(r, h, x, y, z, m) { return this._add(new THREE.CylinderGeometry(r, r, h, 12), m, x, y, z); }
  // cylinder lying along X
  rod(r, len, x, y, z, m) { return this._add(new THREE.CylinderGeometry(r, r, len, 10), m, x, y, z, 0, 0, Math.PI / 2); }
  ball(r, x, y, z, m) { return this._add(new THREE.SphereGeometry(r, 10, 8), m, x, y, z); }
  done(u) { Object.assign(this.g.userData, u); return this.g; }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// small repeated details ----------------------------------------------------------------------
function railTeeth(b, z0, z1, y, w, step = 0.026) {
  for (let z = z0; z > z1; z -= step) b.box(w, 0.004, 0.012, 0, y, z, M.blued());
}
function triggerGroup(b, x, y, z, len = 0.055) {
  b.box(0.007, 0.004, len, x, y - 0.03, z, M.blued());                       // guard bottom
  b.box(0.007, 0.03, 0.005, x, y - 0.016, z - len / 2, M.blued());           // guard front
  b.box(0.006, 0.022, 0.008, x, y - 0.012, z + 0.002, M.blued(), 0.25);      // trigger
}

// ------------------------------------------------------------------------------------------------
// ASSEMBLY LINE RIFLES
// ------------------------------------------------------------------------------------------------
function buildAR() {                 // M4A1
  const b = new B();
  b.box(0.046, 0.052, 0.3, 0, 0.026, -0.02, M.blued());                         // upper receiver
  b.box(0.044, 0.05, 0.22, 0, -0.026, 0.035, M.blued());                        // lower receiver
  b.box(0.04, 0.045, 0.07, 0, -0.04, -0.075, M.blued());                        // magwell
  b.box(0.034, 0.07, 0.056, 0, -0.1, -0.075, M.black(), 0.06);                  // mag (curved: two segments)
  b.box(0.034, 0.06, 0.056, 0, -0.158, -0.082, M.black(), 0.16);
  b.box(0.036, 0.008, 0.06, 0, -0.19, -0.088, M.steel(), 0.16);
  b.box(0.03, 0.1, 0.045, 0, -0.1, 0.115, M.poly(), -0.38);                     // pistol grip
  triggerGroup(b, 0, -0.04, 0.0);
  b.box(0.054, 0.056, 0.22, 0, 0.022, -0.26, M.poly());                         // handguard
  for (let i = 0; i < 5; i++) { b.box(0.058, 0.012, 0.016, 0, 0.022, -0.19 - i * 0.034, M.black()); b.box(0.02, 0.058, 0.016, 0, 0.022, -0.19 - i * 0.034, M.black()); }
  b.box(0.021, 0.009, 0.54, 0, 0.0575, -0.15, M.blued());                       // top rail
  railTeeth(b, 0.1, -0.42, 0.0635, 0.021);
  b.tube(0.0085, 0.13, 0, 0.022, -0.43, M.steel());                             // barrel
  b.box(0.022, 0.026, 0.03, 0, 0.034, -0.385, M.steel());                       // gas block
  b.box(0.012, 0.03, 0.02, 0, 0.074, -0.385, M.blued());                        // front sight base
  b.box(0.0035, 0.02, 0.0035, 0, 0.097, -0.385, M.black());                     // front sight post
  b.tube(0.0135, 0.06, 0, 0.022, -0.485, M.blued());                            // flash hider
  for (let i = 0; i < 3; i++) b.box(0.03, 0.004, 0.012, 0, 0.022, -0.47 - i * 0.015, M.black());
  b.box(0.024, 0.016, 0.022, 0, 0.073, 0.085, M.blued());                       // rear sight
  b.box(0.004, 0.018, 0.012, 0.009, 0.082, 0.085, M.blued()); b.box(0.004, 0.018, 0.012, -0.009, 0.082, 0.085, M.blued());
  b.box(0.032, 0.014, 0.034, 0, 0.056, 0.13, M.black());                        // charging handle
  b.box(0.002, 0.022, 0.045, 0.0235, 0.03, 0.01, M.black());                    // ejection port
  b.tube(0.016, 0.2, 0, 0.002, 0.23, M.blued());                                // buffer tube
  b.box(0.04, 0.08, 0.13, 0, -0.012, 0.31, M.poly(), 0.05);                     // stock
  b.box(0.042, 0.09, 0.014, 0, -0.016, 0.38, M.rubber(), 0.05);                 // butt pad
  return b.done({ muzzle: V(0, 0.022, -0.515), sightY: 0.092, grip: V(0, -0.105, 0.11), fore: V(0, -0.015, -0.26), pistol: false });
}

function buildAK() {                 // AK-47
  const b = new B();
  b.box(0.05, 0.062, 0.32, 0, 0.0, -0.01, M.blued());                           // receiver
  b.box(0.046, 0.022, 0.3, 0, 0.04, 0.0, M.blued());                            // dust cover
  b.tube(0.0095, 0.34, 0, 0.012, -0.34, M.steel());                             // barrel
  b.tube(0.012, 0.2, 0, 0.046, -0.32, M.steel());                               // gas tube
  b.box(0.046, 0.03, 0.2, 0, 0.044, -0.32, M.wood());                           // upper handguard
  b.box(0.054, 0.042, 0.2, 0, -0.006, -0.31, M.wood());                         // lower handguard
  b.box(0.02, 0.06, 0.028, 0, 0.03, -0.49, M.steel());                          // gas block / front sight base
  b.box(0.004, 0.03, 0.004, 0, 0.078, -0.49, M.black());                        // front sight post
  b.tube(0.014, 0.012, 0, 0.012, -0.49, M.steel());
  b.tube(0.0125, 0.045, 0, 0.012, -0.53, M.steel());                            // muzzle device
  b.box(0.024, 0.014, 0.07, 0, 0.056, -0.1, M.steel());                         // rear sight leaf
  b.box(0.006, 0.01, 0.01, 0, 0.066, -0.075, M.black());
  for (let k = 0; k < 4; k++) b.box(0.036, 0.075, 0.058, 0, -0.07 - k * 0.062, -0.03 - k * 0.006 - k * k * 0.0035, M.steel(), 0.12 + k * 0.09);   // banana mag
  b.box(0.032, 0.1, 0.045, 0, -0.1, 0.12, M.woodDark(), -0.32);                 // grip
  triggerGroup(b, 0, -0.038, 0.03);
  b.rod(0.006, 0.03, 0.036, 0.02, 0.005, M.steel());                            // charging handle
  b.box(0.004, 0.02, 0.05, 0.0255, 0.01, 0.04, M.black());                      // ejection port
  b.box(0.038, 0.07, 0.2, 0, -0.012, 0.25, M.wood(), 0.04);                     // stock
  b.box(0.036, 0.04, 0.1, 0, 0.0, 0.16, M.wood());                              // stock wrist
  b.box(0.04, 0.1, 0.012, 0, -0.02, 0.35, M.steel(), 0.06);                     // butt plate
  return b.done({ muzzle: V(0, 0.012, -0.555), sightY: 0.068, grip: V(0, -0.1, 0.12), fore: V(0, -0.025, -0.31), pistol: false });
}

function buildBolt() {               // Kar98k + scope
  const b = new B();
  b.box(0.034, 0.045, 0.16, 0, 0.012, 0.0, M.steel());                          // receiver
  b.tube(0.0095, 0.56, 0, 0.016, -0.34, M.steel());                             // barrel
  b.box(0.036, 0.034, 0.36, 0, -0.004, -0.24, M.wood());                        // fore-stock
  b.box(0.03, 0.016, 0.28, 0, 0.026, -0.26, M.woodDark());                      // hand guard
  for (const z of [-0.12, -0.28, -0.44]) b.box(0.042, 0.042, 0.01, 0, 0.002, z, M.steel());   // barrel bands
  b.box(0.012, 0.022, 0.02, 0, 0.044, -0.6, M.blued());                         // front sight hood
  b.tube(0.0075, 0.02, 0, 0.016, -0.625, M.steel());
  b.box(0.034, 0.06, 0.34, 0, -0.04, 0.2, M.wood(), -0.06);                     // stock body
  b.box(0.034, 0.05, 0.1, 0, -0.022, 0.06, M.wood());                           // wrist
  b.box(0.038, 0.11, 0.014, 0, -0.06, 0.375, M.rubber(), -0.1);                 // butt plate
  b.rod(0.0045, 0.075, 0.04, 0.022, 0.07, M.steel());                           // bolt handle
  b.ball(0.011, 0.082, 0.022, 0.07, M.steel());                                 // bolt knob
  b.box(0.03, 0.02, 0.07, 0, -0.04, -0.01, M.steel());                          // magazine box
  triggerGroup(b, 0, -0.03, 0.03, 0.06);
  // scope
  b.box(0.018, 0.028, 0.02, 0, 0.056, -0.09, M.blued()); b.box(0.018, 0.028, 0.02, 0, 0.056, 0.07, M.blued());   // mounts
  b.tube(0.0165, 0.27, 0, 0.082, -0.01, M.black());                             // main tube
  b.tube(0.024, 0.06, 0, 0.082, -0.15, M.black(), 0.0165);                      // objective bell
  b.tube(0.0165, 0.05, 0, 0.082, 0.14, M.black(), 0.021);                       // eyepiece
  b.tube(0.0215, 0.004, 0, 0.082, -0.181, M.lens());                            // objective lens
  b.tube(0.0185, 0.004, 0, 0.082, 0.166, M.lens());                             // eyepiece lens
  b.post(0.009, 0.02, 0, 0.108, -0.01, M.steel());                              // elevation turret
  b.rod(0.009, 0.02, 0.022, 0.082, -0.01, M.steel());                           // windage turret
  return b.done({ muzzle: V(0, 0.016, -0.635), sightY: 0.082, grip: V(0, -0.03, 0.09), fore: V(0, -0.01, -0.2), pistol: false });
}

function buildPump() {               // Model 680 pump shotgun
  const b = new B();
  b.box(0.04, 0.062, 0.22, 0, 0.0, 0.0, M.steel());                             // receiver
  b.tube(0.0125, 0.5, 0, 0.02, -0.36, M.blued());                               // barrel
  b.tube(0.011, 0.42, 0, -0.006, -0.3, M.steel());                              // magazine tube
  b.box(0.012, 0.004, 0.5, 0, 0.0365, -0.34, M.black());                        // vent rib
  b.ball(0.005, 0, 0.042, -0.6, M.brass());                                     // bead sight
  b.tube(0.0145, 0.03, 0, -0.006, -0.52, M.steel());                            // mag cap
  b.box(0.05, 0.048, 0.17, 0, -0.012, -0.25, M.poly());                         // pump fore-end
  for (let i = 0; i < 6; i++) b.box(0.054, 0.052, 0.008, 0, -0.012, -0.18 - i * 0.026, M.black());   // grip ridges
  b.box(0.034, 0.075, 0.28, 0, -0.03, 0.25, M.poly(), 0.04);                    // stock
  b.box(0.034, 0.07, 0.07, 0, -0.025, 0.12, M.poly());                          // grip area
  b.box(0.038, 0.1, 0.016, 0, -0.035, 0.395, M.rubber(), 0.04);                 // recoil pad
  b.box(0.002, 0.026, 0.07, 0.0205, 0.012, 0.0, M.black());                     // ejection port
  triggerGroup(b, 0, -0.03, 0.03, 0.06);
  return b.done({ muzzle: V(0, 0.02, -0.615), sightY: 0.048, grip: V(0, -0.045, 0.125), fore: V(0, -0.012, -0.25), pistol: false });
}

// ------------------------------------------------------------------------------------------------
// PISTOLS
// ------------------------------------------------------------------------------------------------
function buildGlock() {              // G18 (extended mag, compensator cuts)
  const b = new B();
  b.box(0.03, 0.034, 0.195, 0, 0.02, 0, M.blued());                             // slide
  for (let i = 0; i < 5; i++) { b.box(0.032, 0.026, 0.004, 0, 0.02, 0.06 + i * 0.01, M.black()); }   // rear serrations
  b.box(0.012, 0.004, 0.03, 0, 0.0375, -0.075, M.black());                      // comp cut
  b.box(0.002, 0.012, 0.045, 0.0155, 0.026, 0.0, M.black());                    // ejection port
  b.box(0.028, 0.02, 0.15, 0, -0.004, 0.012, M.poly());                         // frame
  b.box(0.02, 0.008, 0.04, 0, -0.02, -0.045, M.poly());                         // rail
  b.box(0.03, 0.09, 0.042, 0, -0.05, 0.062, M.poly(), -0.32);                   // grip
  b.box(0.0305, 0.01, 0.045, 0, -0.1, 0.075, M.black(), -0.32);                 // grip texture band
  b.box(0.024, 0.07, 0.036, 0, -0.14, 0.088, M.black(), -0.32);                 // extended magazine
  b.box(0.026, 0.008, 0.04, 0, -0.18, 0.1, M.steel(), -0.32);
  b.box(0.007, 0.004, 0.058, 0, -0.027, -0.005, M.poly());                      // trigger guard bottom
  b.box(0.007, 0.024, 0.005, 0, -0.016, -0.034, M.poly());                      // trigger guard front
  b.box(0.006, 0.02, 0.008, 0, -0.012, -0.003, M.black(), 0.25);                // trigger
  b.box(0.016, 0.01, 0.008, 0, 0.042, 0.088, M.black());                        // rear sight
  b.box(0.006, 0.01, 0.008, 0, 0.042, -0.088, M.black());                       // front sight
  b.tube(0.0055, 0.008, 0, 0.02, -0.099, M.steel());                            // barrel tip
  return b.done({ muzzle: V(0, 0.022, -0.103), sightY: 0.047, grip: V(0, -0.05, 0.06), fore: V(-0.014, -0.075, 0.05), pistol: true });
}

function build1911() {
  const b = new B();
  b.box(0.028, 0.034, 0.205, 0, 0.022, 0, M.silver());                          // slide
  for (let i = 0; i < 6; i++) b.box(0.03, 0.026, 0.003, 0, 0.022, 0.065 + i * 0.008, M.steel());
  b.tube(0.0095, 0.02, 0, 0.018, -0.108, M.silver());                           // barrel bushing
  b.box(0.026, 0.024, 0.19, 0, -0.008, 0.0, M.silver());                        // frame
  b.box(0.03, 0.09, 0.044, 0, -0.058, 0.065, M.silver(), -0.22);                // grip frame
  b.box(0.004, 0.08, 0.04, 0.0165, -0.058, 0.065, M.woodDark(), -0.22);         // grip panels
  b.box(0.004, 0.08, 0.04, -0.0165, -0.058, 0.065, M.woodDark(), -0.22);
  b.box(0.026, 0.01, 0.045, 0, -0.104, 0.078, M.steel(), -0.22);                // mag base
  b.box(0.008, 0.024, 0.014, 0, 0.044, 0.1, M.steel(), 0.5);                    // hammer
  b.box(0.008, 0.03, 0.02, 0, -0.03, 0.098, M.silver());                        // grip safety
  b.box(0.008, 0.012, 0.03, 0.018, 0.005, 0.07, M.steel());                     // thumb safety
  b.box(0.007, 0.004, 0.062, 0, -0.03, -0.005, M.silver());                     // trigger guard
  b.box(0.007, 0.024, 0.005, 0, -0.018, -0.036, M.silver());
  b.box(0.005, 0.024, 0.007, 0, -0.012, 0.0, M.steel(), 0.15);                  // trigger
  b.box(0.014, 0.01, 0.008, 0, 0.043, 0.09, M.black());
  b.box(0.005, 0.01, 0.01, 0, 0.043, -0.09, M.black());
  return b.done({ muzzle: V(0, 0.022, -0.118), sightY: 0.048, grip: V(0, -0.055, 0.065), fore: V(-0.014, -0.075, 0.055), pistol: true });
}

function buildRevolver() {           // .357 Magnum
  const b = new B();
  b.box(0.03, 0.055, 0.1, 0, 0.002, 0.04, M.silver());                          // frame
  b.tube(0.029, 0.058, 0, 0.012, -0.015, M.silver());                           // cylinder
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.box(0.007, 0.012, 0.052, Math.cos(a) * 0.029, 0.012 + Math.sin(a) * 0.029, -0.015, M.steel(), 0, 0, a); }   // flutes
  b.tube(0.0125, 0.16, 0, 0.026, -0.13, M.silver());                            // barrel
  b.box(0.02, 0.022, 0.11, 0, 0.012, -0.13, M.silver());                        // barrel shroud
  b.tube(0.005, 0.1, 0, -0.004, -0.11, M.steel());                              // ejector rod
  b.box(0.008, 0.014, 0.02, 0, 0.045, -0.2, M.black());                         // front sight ramp
  b.box(0.018, 0.012, 0.016, 0, 0.037, 0.085, M.black());                       // rear adjustable sight
  b.box(0.008, 0.026, 0.014, 0, 0.034, 0.1, M.steel(), 0.5);                    // hammer
  b.box(0.032, 0.095, 0.045, 0, -0.065, 0.098, M.wood(), -0.3);                 // grip
  b.box(0.006, 0.01, 0.05, 0, -0.025, 0.04, M.silver());                        // trigger guard bottom
  b.box(0.006, 0.026, 0.005, 0, -0.012, 0.012, M.silver());
  b.box(0.005, 0.02, 0.007, 0, -0.01, 0.045, M.steel(), 0.2);                   // trigger
  return b.done({ muzzle: V(0, 0.026, -0.21), sightY: 0.05, grip: V(0, -0.06, 0.09), fore: V(-0.014, -0.08, 0.08), pistol: true });
}

// ------------------------------------------------------------------------------------------------
// Generic fallback (used for the VMP if assets/models/vmp.json can't be loaded)
// ------------------------------------------------------------------------------------------------
function buildSmg() {
  const b = new B();
  b.box(0.046, 0.07, 0.34, 0, 0.0, 0, M.blued());
  b.box(0.05, 0.06, 0.16, 0, -0.005, -0.2, M.poly());
  b.tube(0.012, 0.14, 0, 0.008, -0.27, M.steel());
  b.box(0.03, 0.1, 0.04, 0, -0.085, 0.09, M.poly(), -0.3);
  b.box(0.036, 0.17, 0.036, 0, -0.12, -0.03, M.black(), 0.08);
  b.box(0.04, 0.07, 0.17, 0, -0.01, 0.255, M.poly());
  b.box(0.03, 0.03, 0.04, 0, 0.05, -0.02, M.black());
  triggerGroup(b, 0, -0.035, 0.0);
  return b.done({ muzzle: V(0, 0.008, -0.34), sightY: 0.066, grip: V(0, -0.085, 0.09), fore: V(0, -0.04, -0.2), pistol: false });
}

const BUILDERS = { smg: buildSmg, ar: buildAR, ak: buildAK, bolt: buildBolt, pump: buildPump, glock: buildGlock, m1911: build1911, revolver: buildRevolver };

// ------------------------------------------------------------------------------------------------
// Baked model (FBX -> JSON)
// ------------------------------------------------------------------------------------------------
function buildFromAsset(w, data) {
  const g = new THREE.Group(), a = w.asset;
  for (const part of data.parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(part.positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(part.normals), 3));
    geo.setIndex(part.indices);
    const color = parseInt(part.color.slice(1), 16);
    g.add(new THREE.Mesh(geo, mat(color, 0.35, 0.55)));
  }
  const anc = data.anchors || {};
  const p = (name, off = [0, 0, 0]) => { const c = anc[name] || [0, -0.05, 0]; return V(c[0] + off[0], c[1] + off[1], c[2] + off[2]); };
  g.userData = {
    muzzle: V(...data.muzzle), sightY: data.sightY,
    grip: p(a.grip, a.gripOffset), fore: p(a.fore, a.foreOffset), pistol: false,
  };
  return g;
}

export function buildGun(w) {
  const data = w.asset && MODEL_DATA[w.asset.id];
  if (data) return buildFromAsset(w, data);
  return (BUILDERS[w.builder] || buildSmg)();
}
