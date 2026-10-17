import * as THREE from 'three';

// ---- procedural textures (greyscale detail, tinted by material colour) ---------------------------
const texCache = new Map();
function makeTex(kind) {
  if (texCache.has(kind)) return texCache.get(kind);
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const grey = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;
  const noise = (base, amt, step = 1) => {
    for (let y = 0; y < S; y += step) for (let x = 0; x < S; x += step) { c.fillStyle = grey(base + (Math.random() - 0.5) * amt); c.fillRect(x, y, step, step); }
  };
  switch (kind) {
    case 'concrete': noise(215, 30, 2); c.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 30; i++) c.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 8, 1); break;
    case 'metal':
      for (let x = 0; x < S; x++) { const v = 205 + Math.sin(x / S * Math.PI * 16) * 35; c.fillStyle = grey(v); c.fillRect(x, 0, 1, S); }
      for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(80,50,30,${Math.random() * 0.12})`; c.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 4 + Math.random() * 14); }
      break;
    case 'crate':
      noise(215, 22, 2); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 3; c.strokeRect(3, 3, S - 6, S - 6);
      c.lineWidth = 2; c.beginPath(); c.moveTo(6, 6); c.lineTo(S - 6, S - 6); c.moveTo(S - 6, 6); c.lineTo(6, S - 6); c.stroke();
      for (let y = 32; y < S; y += 32) { c.beginPath(); c.moveTo(3, y); c.lineTo(S - 3, y); c.stroke(); }
      break;
    case 'brick':
      noise(225, 24, 2); c.fillStyle = 'rgba(0,0,0,.25)';
      for (let r = 0; r < 8; r++) { c.fillRect(0, r * 16, S, 2); const off = (r % 2) * 16; for (let x = off; x < S + 32; x += 32) c.fillRect(x, r * 16, 2, 16); }
      break;
    case 'sand': noise(228, 22, 1); c.strokeStyle = 'rgba(0,0,0,.05)'; for (let y = 0; y < S; y += 9) { c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(S * 0.3, y + 4, S * 0.6, y - 4, S, y); c.stroke(); } break;
    case 'snow': noise(245, 14, 2); break;
    case 'wood':
      for (let x = 0; x < S; x += 16) { c.fillStyle = grey(200 + Math.random() * 40); c.fillRect(x, 0, 16, S); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x, 0, 1.5, S); }
      c.strokeStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 80; i++) { const x = Math.random() * S; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (Math.random() - 0.5) * 6, S); c.stroke(); }
      break;
    case 'tile': noise(220, 18, 2); c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 2; c.strokeRect(1, 1, S - 2, S - 2); break;
    case 'windows':
      c.fillStyle = '#10131c'; c.fillRect(0, 0, S, S);
      for (let y = 6; y < S; y += 12) for (let x = 6; x < S; x += 12) { const lit = Math.random(); c.fillStyle = lit > 0.55 ? `rgb(255,${200 + Math.random() * 40 | 0},${120 + Math.random() * 60 | 0})` : '#1c2233'; c.fillRect(x, y, 6, 7); }
      break;
    default: c.fillStyle = '#fff'; c.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(kind, t);
  return t;
}

const matCache = new Map();
function getMat(tex, color, emissive, opacity) {
  const k = `${tex}|${color}|${emissive}|${opacity}`;
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ map: tex === 'plain' ? null : makeTex(tex), color, roughness: tex === 'metal' ? 0.55 : 0.92, metalness: tex === 'metal' ? 0.35 : 0.0 });
  if (emissive !== undefined) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1.2; }
  if (opacity !== undefined) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
  matCache.set(k, m);
  return m;
}

// Box geometry whose UVs are in world units so textures tile instead of stretching.
function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x,-x,+y,-y,+z,-z
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const idx = f * 4 + i;
    uv.setXY(idx, uv.getX(idx) * faces[f][0] / tile, uv.getY(idx) * faces[f][1] / tile);
  }
  uv.needsUpdate = true;
  return g;
}

export function buildWorld(map) {
  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(map.fog[0]);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, map.fog[1], map.fog[2]);

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(map.sky[0]) }, bottom: { value: new THREE.Color(map.sky[1]) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.3+0.05,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.6)),1.0);\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 20, 12), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // lights
  scene.add(new THREE.HemisphereLight(map.hemi[0], map.hemi[1], map.hemi[2]));
  if (map.sun) {
    const sun = new THREE.DirectionalLight(map.sun.color, map.sun.intensity);
    sun.position.set(...map.sun.pos);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 160; sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    scene.add(sun);
  }
  if (map.lights) for (const p of map.lights) { const l = new THREE.PointLight(0xfff0d8, 300, 45, 2); l.position.set(...p); scene.add(l); }

  // ground
  const gt = makeTex(map.ground.tex).clone(); gt.needsUpdate = true; gt.repeat.set(300 / map.ground.tile, 300 / map.ground.tile);
  const gm = new THREE.MeshStandardMaterial({ map: gt, color: map.ground.color, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), gm);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // visuals
  for (const v of map.visuals) {
    let geo;
    if (v.shape === 'cyl') geo = new THREE.CylinderGeometry(v.r, v.r, v.h, 18);
    else if (v.shape === 'cone') geo = new THREE.ConeGeometry(v.r, v.h, 10);
    else if (v.shape === 'disc') geo = new THREE.CylinderGeometry(v.r, v.r, v.h, 28);
    else geo = boxGeo(v.w, v.h, v.d, v.tile || 4);
    const mesh = new THREE.Mesh(geo, getMat(v.tex, v.color, v.emissive, v.opacity));
    mesh.position.set(v.x, v.y0 + v.h / 2, v.z);
    mesh.castShadow = v.cast !== false && v.opacity === undefined && v.emissive === undefined;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // falling snow
  let snow = null;
  if (map.snow) {
    const N = 1400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 70; pos[i * 3 + 1] = Math.random() * 25; pos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
    snow.frustumCulled = false; snow.userData.base = Float32Array.from(pos); scene.add(snow);
  }

  return {
    scene,
    update(dt, camPos) {
      sky.position.copy(camPos);
      if (snow) {
        const p = snow.geometry.attributes.position, b = snow.userData.base;
        for (let i = 0; i < p.count; i++) {
          let y = b[i * 3 + 1] - dt * (2.2 + (i % 5) * 0.3);
          if (y < 0) y += 25;
          b[i * 3 + 1] = y;
          const wx = (((b[i * 3] - camPos.x) % 70) + 105) % 70 - 35;
          const wz = (((b[i * 3 + 2] - camPos.z) % 70) + 105) % 70 - 35;
          p.setXYZ(i, wx, y, wz);
        }
        p.needsUpdate = true;
        snow.position.set(camPos.x, 0, camPos.z);
      }
    },
    dispose() {
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
