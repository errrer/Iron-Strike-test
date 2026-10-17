// Sanity checks for every map: navigation coverage, spawn zones and a path between the spawns.
import { MAP_IDS, buildMap } from '../js/maps.js';
import { Colliders, NavGraph } from '../js/physics.js';

let failed = false;
for (const id of MAP_IDS) {
  const map = buildMap(id);
  const col = new Colliders(map.boxes);
  const nav = new NavGraph(col, map.bounds, 3);
  const a = nav.inRect(map.spawns[0]), b = nav.inRect(map.spawns[1]);
  const path = nav.path(a[0], b[b.length - 1]);
  const ok = nav.coverage > 0.9 && a.length >= 6 && b.length >= 6 && path.length > 0;
  if (!ok) failed = true;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(10)} boxes=${map.boxes.length} nodes=${nav.nodes.length} coverage=${(nav.coverage * 100).toFixed(0)}% spawnA=${a.length} spawnB=${b.length} pathLen=${path.length}`);
}
process.exit(failed ? 1 : 0);
