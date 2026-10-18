#!/usr/bin/env python3
"""Bake a Wavefront .obj character into assets/models/<id>.json for the in-game easter egg.
Usage: python3 tools/obj2model.py model.obj richtofen --height 1.8 --facing +x
- scales to --height metres (feet on y=0, centred on x/z), turns the model so its --facing axis points at the game's -Z
- groups triangles by colour (COLORS below, matched on the material name), welds nothing it does not have to
- positions as base64 Float32, indices as base64 Uint16 (Uint32 when needed); normals are computed in the browser"""
import sys, re, json, base64, math, argparse, collections, struct
import array

COLORS = [  # (substring of material name, colour, metalness, name)
    ('head_hair', '#8d8d86', 0.0, 'hair'), ('lashes', '#1b1612', 0.0, 'lashes'), ('head', '#d9a98c', 0.0, 'skin'),
    ('teeth', '#e8e2d0', 0.0, 'teeth'), ('eye', '#4a86c8', 0.0, 'eye'), ('vials', '#9fd6e6', 0.1, 'vials'),
    ('metals', '#8a8f95', 0.7, 'metal'), ('parts', '#3a3028', 0.2, 'leather'),
    ('lowerbody', '#4b5347', 0.0, 'cloth'), ('upperbody', '#4b5347', 0.0, 'cloth'), ('arm', '#4b5347', 0.0, 'cloth'),
]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('obj'); ap.add_argument('id')
    ap.add_argument('--height', type=float, default=1.8); ap.add_argument('--facing', default='+x')
    ap.add_argument('--out', default=None); a = ap.parse_args()
    V = []; faces = collections.defaultdict(list); mat = 'none'
    for l in open(a.obj, errors='ignore'):
        if l.startswith('v '): V.append(tuple(map(float, l.split()[1:4])))
        elif l.startswith('usemtl'): mat = l.split()[1]
        elif l.startswith('f '):
            idx = [int(t.split('/')[0]) for t in l.split()[1:]]; idx = [i - 1 if i > 0 else len(V) + i for i in idx]
            for k in range(1, len(idx) - 1): faces[mat].append((idx[0], idx[k], idx[k + 1]))
    ys = [v[1] for v in V]; ymin, ymax = min(ys), max(ys); s = a.height / (ymax - ymin)
    cx = (min(v[0] for v in V) + max(v[0] for v in V)) / 2; cz = (min(v[2] for v in V) + max(v[2] for v in V)) / 2
    # rotation about Y so that --facing maps to -Z
    ang = {'-z': 0, '+x': math.pi / 2, '+z': math.pi, '-x': -math.pi / 2}[a.facing.lower()]
    c, sn = math.cos(ang), math.sin(ang)
    def tf(v):
        x, y, z = (v[0] - cx) * s, (v[1] - ymin) * s, (v[2] - cz) * s
        return (x * c + z * sn, y, -x * sn + z * c)
    T = [tf(v) for v in V]
    groups = collections.OrderedDict()
    for m, tris in faces.items():
        for sub, col, met, name in COLORS:
            if sub in m: break
        else: col, met, name = '#888888', 0.0, 'other'
        g = groups.setdefault(name, {'name': name, 'color': col, 'metal': met, 'tris': []}); g['tris'] += tris
    out = []
    for g in groups.values():
        used = sorted({i for t in g['tris'] for i in t}); remap = {v: k for k, v in enumerate(used)}
        pos = array.array('f'); [pos.extend(T[i]) for i in used]
        big = len(used) > 65535; idx = array.array('I' if big else 'H')
        for t in g['tris']: idx.extend(remap[i] for i in t)
        out.append({'name': g['name'], 'color': g['color'], 'metal': g['metal'], 'verts': len(used), 'tris': len(g['tris']),
                    'pos': base64.b64encode(pos.tobytes()).decode(), 'idx': base64.b64encode(idx.tobytes()).decode(), 'idx32': big})
    path = a.out or f'assets/models/{a.id}.json'
    json.dump({'id': a.id, 'height': a.height, 'groups': out}, open(path, 'w'), separators=(',', ':'))
    print(path, sum(g['tris'] for g in out), 'tris,', len(out), 'groups', [g['name'] for g in out])

if __name__ == '__main__': main()
