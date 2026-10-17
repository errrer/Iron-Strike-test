// Minimal stand-in for Three.js used ONLY by the headless logic smoke test (tests/smoke.py).
// It implements just enough of the API surface the game touches, with real vector maths.
export const SRGBColorSpace = 'srgb', RepeatWrapping = 1000, BackSide = 1, DoubleSide = 2, AdditiveBlending = 2, PCFSoftShadowMap = 2, ACESFilmicToneMapping = 4;

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  crossVectors(a, b) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
}
export class Color { constructor(c) { this.c = c; } setHex(c) { this.c = c; return this; } }
class Rot { constructor() { this.x = 0; this.y = 0; this.z = 0; this.order = 'XYZ'; } set(x, y, z, o) { this.x = x; this.y = y; this.z = z; if (o) this.order = o; } }
class Obj {
  constructor() { this.position = new Vector3(); this.rotation = new Rot(); this.scale = new Vector3(1, 1, 1); this.children = []; this.visible = true; this.userData = {}; this.parent = null; }
  add(c) { this.children.push(c); c.parent = this; return this; }
  remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  traverse(f) { f(this); for (const c of this.children) c.traverse(f); }
  lookAt() {}
  updateProjectionMatrix() {}
}
export class Scene extends Obj { constructor() { super(); this.background = null; this.fog = null; } }
export class Group extends Obj {}
export class Mesh extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
export class Sprite extends Obj { constructor(m) { super(); this.material = m; } }
export class Points extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
export class PerspectiveCamera extends Obj { constructor(fov, aspect) { super(); this.fov = fov; this.aspect = aspect; } }
class Light extends Obj { constructor() { super(); this.shadow = { mapSize: { set() {} }, camera: { updateProjectionMatrix() {} } }; this.intensity = 1; } }
export class HemisphereLight extends Light {}
export class DirectionalLight extends Light {}
export class PointLight extends Light {}
export class Fog { constructor(c, n, f) { this.color = c; } }

class Attr {
  constructor(arr, n) { this.array = arr; this.itemSize = n; this.count = arr.length / n; this.needsUpdate = false; }
  getX(i) { return this.array[i * this.itemSize]; } getY(i) { return this.array[i * this.itemSize + 1]; }
  setXY(i, x, y) { this.array[i * 2] = x; this.array[i * 2 + 1] = y; }
  setY(i, y) { this.array[i * this.itemSize + 1] = y; }
  setXYZ(i, x, y, z) { this.array[i * 3] = x; this.array[i * 3 + 1] = y; this.array[i * 3 + 2] = z; }
}
export class BufferAttribute extends Attr { constructor(a, n) { super(a, n); } }
export class BufferGeometry { constructor() { this.attributes = {}; } setAttribute(k, a) { this.attributes[k] = a; } dispose() {} }
class Geo extends BufferGeometry { constructor() { super(); this.attributes.uv = new Attr(new Float32Array(48), 2); } }
export class BoxGeometry extends Geo {}
export class CylinderGeometry extends Geo {}
export class ConeGeometry extends Geo {}
export class PlaneGeometry extends Geo {}
export class SphereGeometry extends Geo {}
class Mat { constructor(o = {}) { Object.assign(this, o); this.color = new Color(o.color); } }
export class MeshStandardMaterial extends Mat {}
export class MeshBasicMaterial extends Mat {}
export class SpriteMaterial extends Mat {}
export class PointsMaterial extends Mat {}
export class ShaderMaterial extends Mat {}
export class CanvasTexture { constructor(c) { this.image = c; this.repeat = { set() {} }; } clone() { return new CanvasTexture(this.image); } }
export class WebGLRenderer {
  constructor(o) { this.domElement = o.canvas; this.shadowMap = {}; this.frames = 0; }
  setPixelRatio() {} setSize() {} clear() {} clearDepth() {}
  render() { this.frames++; }
}
