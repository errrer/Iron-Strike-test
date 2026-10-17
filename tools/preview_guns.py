"""Render every gun from /tmp/guns.json (made by export-guns.mjs) to PNG sheets."""
import json, sys, numpy as np
sys.path.insert(0, __import__('os').path.dirname(__file__))
from preview import render_tris, draw_tris
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt

def rotm(rx, ry, rz):  # three.js Euler 'XYZ' => Rx @ Ry @ Rz
    cx, sx, cy, sy, cz, sz = np.cos(rx), np.sin(rx), np.cos(ry), np.sin(ry), np.cos(rz), np.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz

def prim(m):
    k, p = m['kind'], m.get('p')
    if k == 'box':
        w, h, d = [x / 2 for x in p]
        c = np.array([[sx * w, sy * h, sz * d] for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)])
        f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        return [np.array([c[q[0]], c[q[1]], c[q[2]]]) for q in f] + [np.array([c[q[0]], c[q[2]], c[q[3]]]) for q in f]
    if k in ('cyl', 'cone'):
        rt, rb, h = (p[0], p[0], p[1]) if k == 'cone' and False else ((0.0, p[0], p[1]) if k == 'cone' else p)
        n = 12; t = []
        for i in range(n):
            a0, a1 = 2 * np.pi * i / n, 2 * np.pi * (i + 1) / n
            T0 = [rt * np.cos(a0), h / 2, rt * np.sin(a0)]; T1 = [rt * np.cos(a1), h / 2, rt * np.sin(a1)]
            B0 = [rb * np.cos(a0), -h / 2, rb * np.sin(a0)]; B1 = [rb * np.cos(a1), -h / 2, rb * np.sin(a1)]
            t += [np.array([B0, B1, T1]), np.array([B0, T1, T0]), np.array([[0, h / 2, 0], T1, T0]), np.array([[0, -h / 2, 0], B0, B1])]
        return t
    if k == 'sphere':
        r = p[0]; t = []; la, lo = 6, 10
        P = lambda i, j: [r * np.sin(np.pi * i / la) * np.cos(2 * np.pi * j / lo), r * np.cos(np.pi * i / la), r * np.sin(np.pi * i / la) * np.sin(2 * np.pi * j / lo)]
        for i in range(la):
            for j in range(lo): t += [np.array([P(i, j), P(i + 1, j), P(i + 1, j + 1)]), np.array([P(i, j), P(i + 1, j + 1), P(i, j + 1)])]
        return t
    if k == 'buffer':
        Pv = np.array(m['positions']).reshape(-1, 3); I = np.array(m['indices']).reshape(-1, 3)
        return [Pv[i] for i in I]
    return []

def gun_tris(g):
    out = []
    for m in g['meshes']:
        if m.get('opacity') not in (None, 1) and m['opacity'] < 0.9 and False: continue
        R = rotm(*m['rot']); pos = np.array(m['pos']); c = m['color']; rgb = np.array([(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255])
        for t in prim(m): out.append(((R @ t.T).T + pos, rgb))
    return out

if __name__ == '__main__':
    data = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/guns.json')); outdir = sys.argv[2] if len(sys.argv) > 2 else '/tmp'
    ids = list(data)
    fig, axs = plt.subplots(len(ids), 2, figsize=(15, 3.3 * len(ids)), dpi=80)
    for r, gid in enumerate(ids):
        tris = gun_tris(data[gid])
        for c, view in enumerate(['side', 'iso']):
            ax = axs[r][c]; draw_tris(ax, tris, view, boost=2.6)
            if view == 'side':
                g = data[gid]; mz = g['muzzle']
                ax.plot([-mz[2]], [mz[1]], 'r+', ms=14); ax.plot([0.0], [g['sightY']], 'g_', ms=10)
                ax.plot([-g['grip'][2]], [g['grip'][1]], 'bo', ms=5); ax.plot([-g['fore'][2]], [g['fore'][1]], 'co', ms=5)
            ax.set_title(f"{data[gid]['name']} - {view}", fontsize=9)
    fig.tight_layout(); fig.savefig(f'{outdir}/guns_sheet.png'); print('saved', f'{outdir}/guns_sheet.png')
