// Easter egg: type "richtofen" anywhere and every soldier turns into the baked OBJ model (assets/models/richtofen.json).
// Purely cosmetic and local to your own screen; type it again to switch back.
import * as THREE from 'three';

const CODE = 'richtofen';
let data = null, loading = null, shared = null;

function b64(s, Type) {
  const bin = atob(s), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Type(u8.buffer);
}

export function loadRichtofen() {
  if (shared) return Promise.resolve(true);
  if (loading) return loading;
  loading = fetch('assets/models/richtofen.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
    data = j;
    shared = j.groups.map((g) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(b64(g.pos, Float32Array), 3));
      geo.setIndex(new THREE.BufferAttribute(g.idx32 ? b64(g.idx, Uint32Array) : b64(g.idx, Uint16Array), 1));
      if (geo.computeVertexNormals) geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(g.color), roughness: g.metal > 0.3 ? 0.4 : 0.85, metalness: g.metal, side: THREE.DoubleSide });
      return { geo, mat, name: g.name };
    });
    return true;
  }).catch((e) => { console.warn('[easter] could not load the model', e); loading = null; return false; });
  return loading;
}

export const richtofenReady = () => !!shared;

// a fresh Group that shares geometry + materials with every other instance (cheap for 18 players)
export function makeRichtofen() {
  const g = new THREE.Group();
  for (const s of shared) { const m = new THREE.Mesh(s.geo, s.mat); m.castShadow = s.name !== 'vials' && s.name !== 'lashes' && s.name !== 'eye' && s.name !== 'teeth'; g.add(m); }
  return g;
}

// call once; onToggle(on) fires after the model is loaded and the egg flips
export function watchForEgg(onToggle) {
  let buf = '';
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1) return;
    buf = (buf + e.key.toLowerCase()).slice(-CODE.length);
    if (buf === CODE) { buf = ''; loadRichtofen().then((ok) => { if (ok) onToggle(); }); }
  }, true);
}
