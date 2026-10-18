#!/usr/bin/env python3
"""Bake a (Blender-style) binary FBX weapon model into the compact JSON the game loads.

  python3 tools/fbx2model.py assets/fbx/vmp.fbx vmp                # -> assets/models/vmp.json
  python3 tools/fbx2model.py my.fbx m4a1 --length 0.85 --preview /tmp/m4a1.png

What it does: applies every object's transform, re-orients the gun so the muzzle points down -Z (up = +Y),
scales it to --length metres, centres it, converts material colours (linear -> sRGB), welds vertices and
writes positions / normals / indices per part. Needs only Python 3 + numpy.
Model conventions (so every weapon lines up in game): origin = middle of the receiver, -Z = barrel direction.
"""
import argparse, json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fbxparse import parse

def rot_xyz(rx, ry, rz):
    rx, ry, rz = map(math.radians, (rx, ry, rz))
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx            # FBX eEulerXYZ

def srgb(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def load(path):
    root = parse(path); obj = root.get('Objects'); conns = root.get('Connections')
    byid = {c.props[0]: c for c in obj.children}
    parent_of = {}; mats_of = {}; geom_of = {}
    for c in conns.children:
        kind, a, b = c.props[0], c.props[1], c.props[2]
        if a in byid and b in byid:
            if byid[a].name == 'Geometry' and byid[b].name == 'Model': geom_of[b] = a
            elif byid[a].name == 'Material' and byid[b].name == 'Model': mats_of.setdefault(b, []).append(a)
            elif byid[a].name == 'Model' and byid[b].name == 'Model': parent_of[a] = b
    def local(m):
        t = np.zeros(3); r = np.zeros(3); s = np.ones(3)
        pr = m.get('Properties70')
        if pr:
            for p in pr.children:
                n = p.props[0]
                if n == 'Lcl Translation': t = np.array(p.props[4:7], float)
                elif n == 'Lcl Rotation': r = np.array(p.props[4:7], float)
                elif n == 'Lcl Scaling': s = np.array(p.props[4:7], float)
        M = np.eye(4); M[:3, :3] = rot_xyz(*r) @ np.diag(s); M[:3, 3] = t
        return M
    def world(mid):
        M = local(byid[mid])
        return world(parent_of[mid]) @ M if mid in parent_of else M
    parts = []
    for mid, m in byid.items():
        if m.name != 'Model' or mid not in geom_of: continue
        g = byid[geom_of[mid]]
        v = g.get('Vertices').props[0].reshape(-1, 3).astype(float)
        idx = g.get('PolygonVertexIndex').props[0]
        nrm = g.get('LayerElementNormal'); N = nidx = None
        if nrm:
            N = nrm.get('Normals').props[0].reshape(-1, 3).astype(float)
            ni = nrm.get('NormalsIndex'); nidx = ni.props[0] if ni else None
            nmap = nrm.get('MappingInformationType').props[0]
        W = world(mid); L = W[:3, :3]; flip = np.linalg.det(L) < 0
        NM = np.linalg.inv(L).T
        tris = []                     # (pos, normal) per corner
        poly = []; pv = 0
        for k, i in enumerate(idx):
            end = i < 0; poly.append((k, ~i if end else i))
            if end:
                for j in range(1, len(poly) - 1):
                    tri = [poly[0], poly[j], poly[j + 1]]
                    if flip: tri = [tri[0], tri[2], tri[1]]
                    for (pk, vi) in tri:
                        p = (W @ np.append(v[vi], 1))[:3]
                        if N is not None:
                            nn = N[nidx[pk]] if nidx is not None else N[pk]
                            nn = NM @ nn; nn = nn / (np.linalg.norm(nn) or 1)
                        else: nn = np.array([0, 1, 0.])
                        tris.append((p, nn))
                poly = []
        mat = None
        for mt in mats_of.get(mid, []):
            pr = byid[mt].get('Properties70')
            d = [p for p in pr.children if p.props[0] == 'DiffuseColor'][0].props[4:7]
            sp = [p for p in pr.children if p.props[0] == 'SpecularFactor']
            mat = ([srgb(c) for c in d], sp[0].props[4] if sp else 0.25)
        name = m.props[1].split('\x00')[0]
        parts.append(dict(name=name, tris=tris, color=mat[0] if mat else [0.3, 0.3, 0.3]))
    return parts

def fix_inside_out(P, N):
    """Some meshes contain closed pieces (e.g. cubes) whose faces point inward - they look fine in Blender
    (back-faces are shown) but render inside-out in a game engine. Find every closed piece with negative
    signed volume and flip its winding + normals. P, N: (3*T, 3) arrays, 3 corners per triangle."""
    T = len(P) // 3
    key = {}
    ids = np.array([key.setdefault(tuple(np.round(p, 4)), len(key)) for p in P]).reshape(-1, 3)
    parent = list(range(len(key)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for t in ids:
        parent[find(t[0])] = find(t[1]); parent[find(t[1])] = find(t[2])
    comp = {}
    for ti, t in enumerate(ids): comp.setdefault(find(t[0]), []).append(ti)
    flipped = 0
    for tris in comp.values():
        edges = {}
        for ti in tris:
            a, b, c = ids[ti]
            for e in ((a, b), (b, c), (c, a)): edges[tuple(sorted(e))] = edges.get(tuple(sorted(e)), 0) + 1
        if any(n != 2 for n in edges.values()): continue          # open piece: leave alone
        vol = sum(np.dot(P[3 * ti], np.cross(P[3 * ti + 1], P[3 * ti + 2])) for ti in tris) / 6
        if vol < 0:
            for ti in tris:
                i = 3 * ti
                P[[i + 1, i + 2]] = P[[i + 2, i + 1]]; N[[i + 1, i + 2]] = N[[i + 2, i + 1]]
                N[i:i + 3] = -N[i:i + 3]
            flipped += 1
    return flipped

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('fbx'); ap.add_argument('id')
    ap.add_argument('--out', default=None); ap.add_argument('--length', type=float, default=0.62, help='overall gun length in metres')
    ap.add_argument('--forward', default='auto', help="axis the muzzle points to: auto, +x,-x,+y,-y,+z,-z (in FBX world space)")
    ap.add_argument('--up', default='auto', help='axis that is up: auto,+x,-x,+y,-y,+z,-z')
    ap.add_argument('--muzzle', default=None, help='override muzzle x,y,z (metres, final space)')
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    parts = load(a.fbx)
    allp = np.vstack([np.array([p for p, _ in part['tris']]) for part in parts])
    mn, mx = allp.min(0), allp.max(0); ext = mx - mn
    print('world extents', ext.round(2), 'parts', [p['name'] for p in parts])
    ax = {'x': 0, 'y': 1, 'z': 2}
    def axis(s): return ax[s[1]], 1 if s[0] == '+' else -1
    long_i = int(np.argmax(ext))
    if a.forward == 'auto':
        # the muzzle points away from the stock; fall back to "the heavier end is the rear" if there is no stock part
        fwd_i = long_i
        stock = [p for p in parts if 'stock' in p['name'].lower() or 'butt' in p['name'].lower()]
        mid = (mn[long_i] + mx[long_i]) / 2
        if stock:
            c = np.mean([p0 for p0, _ in stock[0]['tris']], axis=0)
            fwd_s = -1 if c[long_i] > mid else 1
        else:
            hi = sum(1 for p in allp if p[long_i] > mid); fwd_s = 1 if hi < len(allp) - hi else -1
        print('auto forward axis', 'xyz'[fwd_i], '+' if fwd_s > 0 else '-')
    else: fwd_i, fwd_s = axis(a.forward)
    if a.up == 'auto':
        cand = [i for i in range(3) if i != fwd_i]
        # up = the remaining axis with the larger extent among the two (guns are taller than wide), sign: magazine hangs down
        up_i = cand[int(np.argmax([ext[i] for i in cand]))]
        mag = [p for p in parts if p['name'].lower().startswith('mag')]
        if mag:
            c = np.mean([p0 for p0, _ in mag[0]['tris']], axis=0)
            up_s = -1 if c[up_i] > (mn[up_i] + mx[up_i]) / 2 else 1   # magazine centroid should be below the middle
            up_s = 1 if c[up_i] < (mn[up_i] + mx[up_i]) / 2 else -1
        else: up_s = 1
    else: up_i, up_s = axis(a.up)
    side_i = ({0, 1, 2} - {fwd_i, up_i}).pop()
    # build rotation: new_x = side, new_y = up, new_z = -forward   (right-handed: ensure det>0)
    R = np.zeros((3, 3)); R[1, up_i] = up_s; R[2, fwd_i] = -fwd_s; R[0, side_i] = 1
    if np.linalg.det(R) < 0: R[0, side_i] = -1
    sc = a.length / ext[fwd_i]
    pts = (R @ allp.T).T * sc
    bmn, bmx = pts.min(0), pts.max(0)
    # origin: middle of the body part in z, receiver centre in y/x
    body = [p for p in parts if p['name'].lower() == 'body']
    ref = np.array([(R @ p0) * sc for p0, _ in (body[0]['tris'] if body else parts[0]['tris'])])
    ctr = (ref.min(0) + ref.max(0)) / 2
    shift = np.array([0.0, 0.0, 0.0]) - ctr
    out = {'name': a.id, 'version': 1, 'length': a.length, 'parts': []}
    allf = []
    for part in parts:
        P = (R @ np.array([p for p, _ in part['tris']]).T).T * sc + shift
        Nn = (R @ np.array([n for _, n in part['tris']]).T).T
        nfix = fix_inside_out(P, Nn)
        if nfix: print(f"   fixed {nfix} inside-out piece(s) in '{part['name']}'")
        allf.append(P)
        key = {}; pos = []; nor = []; ind = []
        for p, n in zip(P, Nn):
            k = (round(p[0], 4), round(p[1], 4), round(p[2], 4), round(n[0], 2), round(n[1], 2), round(n[2], 2))
            if k not in key: key[k] = len(pos); pos.append(p); nor.append(n)
            ind.append(key[k])
        out['parts'].append({'name': part['name'], 'color': '#%02x%02x%02x' % tuple(int(round(c * 255)) for c in part['color']),
                             'positions': [round(float(x), 4) for p in pos for x in p], 'normals': [round(float(x), 3) for n in nor for x in n], 'indices': ind})
    F = np.vstack(allf)
    out['bounds'] = {'min': [round(float(x), 4) for x in F.min(0)], 'max': [round(float(x), 4) for x in F.max(0)]}
    # anchors
    front = F[:, 2].min()
    tip = F[F[:, 2] < front + 0.01]
    muzzle = [float(tip[:, 0].mean()), float(tip[:, 1].mean()), float(front)]
    if a.muzzle: muzzle = [float(x) for x in a.muzzle.split(',')]
    out['muzzle'] = [round(x, 4) for x in muzzle]
    # sight line: highest point over the receiver (middle half of the gun)
    zlo, zhi = F[:, 2].min(), F[:, 2].max(); zr = zhi - zlo
    mid = F[(F[:, 2] > zlo + zr * 0.3) & (F[:, 2] < zlo + zr * 0.7)]
    out['sightY'] = round(float(mid[:, 1].max()), 4)
    def centroid(name):
        for part, pp in zip(parts, allf):
            if part['name'].lower() == name: return [round(float(x), 4) for x in pp.mean(0)]
    out['anchors'] = {n: centroid(n) for n in [p['name'].lower() for p in parts]}
    path = a.out or os.path.join('assets', 'models', a.id + '.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, 'w'), separators=(',', ':'))
    print('wrote', path, os.path.getsize(path) // 1024, 'KB', 'bounds', out['bounds'], 'muzzle', out['muzzle'], 'sightY', out['sightY'])
    for n, c in out['anchors'].items(): print('   part', n, c)
    if a.preview:
        from preview import render_model_json
        render_model_json(out, a.preview)

if __name__ == '__main__': main()
