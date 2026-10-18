// Dumps every gun's scene graph (using the Three.js stand-in) as JSON so tools/preview_guns.py can render it.
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync('/tmp/guns-');
const stub = pathToFileURL(path.join(root, 'tests/three-stub.js')).href;
fs.writeFileSync(path.join(tmp, 'gunmodels.mjs'), fs.readFileSync(path.join(root, 'js/gunmodels.js'), 'utf8').replace("from 'three'", `from '${stub}'`));
fs.copyFileSync(path.join(root, 'js/weapons.js'), path.join(tmp, 'weapons.mjs'));
const { buildGun, MODEL_DATA } = await import(pathToFileURL(path.join(tmp, 'gunmodels.mjs')).href);
const { WEAPONS } = await import(pathToFileURL(path.join(tmp, 'weapons.mjs')).href);
const useAssets = process.argv[2] !== '--no-assets';
if (useAssets) for (const w of Object.values(WEAPONS)) if (w.asset) { const f = path.join(root, 'assets/models', w.asset.id + '.json'); if (fs.existsSync(f)) MODEL_DATA[w.asset.id] = JSON.parse(fs.readFileSync(f, 'utf8')); }
const out = {};
for (const w of Object.values(WEAPONS)) {
  const g = buildGun(w), meshes = [];
  g.traverse((o) => {
    if (!o.geometry) return;
    const geo = o.geometry;
    const m = { kind: geo.kind || 'buffer', p: geo.p, pos: [o.position.x, o.position.y, o.position.z], rot: [o.rotation.x, o.rotation.y, o.rotation.z], color: o.material.color.c, opacity: o.material.opacity };
    if (!geo.kind) { m.positions = Array.from(geo.attributes.position.array); m.indices = geo.index; }
    meshes.push(m);
  });
  const u = g.userData, v = (x) => [x.x, x.y, x.z];
  out[w.id] = { meshes, muzzle: v(u.muzzle), sightY: u.sightY, grip: v(u.grip), fore: v(u.fore), pistol: u.pistol, name: w.name };
}
fs.writeFileSync(process.argv[3] || '/tmp/guns.json', JSON.stringify(out));
console.log('exported', Object.keys(out).join(', '), 'meshes:', Object.values(out).map((o) => o.meshes.length).join(','));
