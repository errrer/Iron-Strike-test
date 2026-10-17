// 5 primaries + 3 secondaries.  Angles in radians, ranges in metres.
// dmg = damage per bullet/pellet, rpm = rounds per minute, range = [full damage until, minimum damage from].
export const WEAPONS = {
  // ---------------- PRIMARIES ----------------
  vmp: {
    id: 'vmp', name: 'VMP', slot: 'primary', cls: 'smg', desc: 'Fast-firing SMG. Great mobility, melts at close range.',
    dmg: 22, hs: 1.5, rpm: 860, auto: true, mag: 32, reserve: 192, reload: 1.8,
    spread: 0.030, adsSpread: 0.006, recoil: 0.0045, recoilYaw: 0.0030, range: [10, 30], minMul: 0.5, pellets: 1,
    zoom: 1.3, scope: false, moveMul: 1.08, snd: { f: 3200, len: 0.09, thump: 0.5 },
    builder: 'smg', asset: { id: 'vmp', grip: 'handle', fore: 'grip', foreOffset: [0, -0.02, 0], gripOffset: [0, 0.0, 0] },
  },
  m4a1: {
    id: 'm4a1', name: 'M4A1', slot: 'primary', cls: 'ar', desc: 'Balanced assault rifle. Accurate and easy to control.',
    dmg: 26, hs: 1.4, rpm: 660, auto: true, mag: 30, reserve: 180, reload: 2.2,
    spread: 0.028, adsSpread: 0.003, recoil: 0.0060, recoilYaw: 0.0030, range: [20, 50], minMul: 0.65, pellets: 1,
    zoom: 1.5, scope: false, moveMul: 1.0, snd: { f: 2600, len: 0.11, thump: 0.6 }, builder: 'ar',
  },
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 'primary', cls: 'ar', desc: 'Hard-hitting rifle. Heavy recoil, big damage.',
    dmg: 33, hs: 1.4, rpm: 520, auto: true, mag: 30, reserve: 150, reload: 2.5,
    spread: 0.034, adsSpread: 0.004, recoil: 0.0092, recoilYaw: 0.0050, range: [22, 55], minMul: 0.7, pellets: 1,
    zoom: 1.45, scope: false, moveMul: 0.96, snd: { f: 2100, len: 0.13, thump: 0.8 }, builder: 'ak',
  },
  kar98k: {
    id: 'kar98k', name: 'Kar98k', slot: 'primary', cls: 'sniper', desc: 'Bolt-action sniper. One shot to the body kills.',
    dmg: 105, hs: 2.0, rpm: 46, auto: false, mag: 5, reserve: 25, reload: 3.0,
    spread: 0.09, adsSpread: 0.0004, recoil: 0.03, recoilYaw: 0.004, range: [60, 120], minMul: 0.95, pellets: 1,
    zoom: 4.0, scope: true, moveMul: 0.9, snd: { f: 1500, len: 0.22, thump: 1.1 }, builder: 'bolt',
  },
  m680: {
    id: 'm680', name: 'Model 680', slot: 'primary', cls: 'shotgun', desc: 'Pump shotgun. Devastating up close, weak at range.',
    dmg: 12, hs: 1.3, rpm: 72, auto: false, mag: 6, reserve: 36, reload: 2.6,
    spread: 0.07, adsSpread: 0.045, recoil: 0.022, recoilYaw: 0.004, range: [5, 16], minMul: 0.15, pellets: 10,
    zoom: 1.2, scope: false, moveMul: 1.0, snd: { f: 1100, len: 0.2, thump: 1.2 }, builder: 'pump',
  },

  // ---------------- SECONDARIES ----------------
  g18: {
    id: 'g18', name: 'G18', slot: 'secondary', cls: 'pistol', desc: 'Full-auto machine pistol. Insane fire rate, burns ammo.',
    dmg: 17, hs: 1.4, rpm: 1100, auto: true, mag: 24, reserve: 96, reload: 1.5,
    spread: 0.034, adsSpread: 0.012, recoil: 0.0042, recoilYaw: 0.0035, range: [8, 22], minMul: 0.45, pellets: 1,
    zoom: 1.2, scope: false, moveMul: 1.1, snd: { f: 3000, len: 0.07, thump: 0.4 }, builder: 'glock',
  },
  m1911: {
    id: 'm1911', name: 'M1911', slot: 'secondary', cls: 'pistol', desc: 'Classic .45. Accurate semi-auto, three shots to kill.',
    dmg: 36, hs: 1.5, rpm: 420, auto: false, mag: 8, reserve: 48, reload: 1.4,
    spread: 0.022, adsSpread: 0.004, recoil: 0.012, recoilYaw: 0.003, range: [14, 35], minMul: 0.6, pellets: 1,
    zoom: 1.25, scope: false, moveMul: 1.08, snd: { f: 2000, len: 0.12, thump: 0.8 }, builder: 'm1911',
  },
  magnum: {
    id: 'magnum', name: '.357 Magnum', slot: 'secondary', cls: 'pistol', desc: 'Hand cannon revolver. Two shots to kill.',
    dmg: 70, hs: 1.5, rpm: 130, auto: false, mag: 6, reserve: 30, reload: 2.4,
    spread: 0.02, adsSpread: 0.002, recoil: 0.03, recoilYaw: 0.004, range: [20, 45], minMul: 0.7, pellets: 1,
    zoom: 1.3, scope: false, moveMul: 1.05, snd: { f: 1300, len: 0.18, thump: 1.1 }, builder: 'revolver',
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
