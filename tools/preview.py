"""Tiny software renderer (matplotlib) used to eyeball model data without a GPU."""
import numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection

def hex2rgb(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])

def draw_tris(ax, tris, view, light=(0.4, 0.8, 0.5), boost=1.0):
    """tris: list of (3x3 verts, rgb). view: 'side' (x=z, y=y), 'top', 'front', 'iso'."""
    L = np.array(light) / np.linalg.norm(light)
    polys = []; cols = []; depth = []
    for v, rgb in tris:
        n = np.cross(v[1] - v[0], v[2] - v[0]); ln = np.linalg.norm(n)
        if ln < 1e-12: continue
        n /= ln
        if view == 'side': p2 = v[:, [2, 1]] * [-1, 1]; d = v[:, 0].mean(); facing = n[0]
        elif view == 'top': p2 = v[:, [2, 0]] * [-1, 1]; d = v[:, 1].mean(); facing = n[1]
        elif view == 'front': p2 = v[:, [0, 1]]; d = -v[:, 2].mean(); facing = -n[2]
        else:
            ang = np.radians(-35); ca, sa = np.cos(ang), np.sin(ang)
            vr = np.stack([v[:, 0] * ca + v[:, 2] * sa, v[:, 1], -v[:, 0] * sa + v[:, 2] * ca], 1)
            el = np.radians(22); ce, se = np.cos(el), np.sin(el)
            vv = np.stack([vr[:, 0], vr[:, 1] * ce - vr[:, 2] * se, vr[:, 1] * se + vr[:, 2] * ce], 1)
            p2 = vv[:, :2]; d = -vv[:, 2].mean(); facing = 1
        shade = 0.35 + 0.65 * abs(float(np.dot(n, L)))
        polys.append(p2); cols.append(np.clip(rgb * shade * boost, 0, 1)); depth.append(d)
    order = np.argsort(depth)
    ax.add_collection(PolyCollection([polys[i] for i in order], facecolors=[cols[i] for i in order], edgecolors='none'))
    allp = np.vstack(polys); ax.set_xlim(allp[:, 0].min() - .02, allp[:, 0].max() + .02); ax.set_ylim(allp[:, 1].min() - .02, allp[:, 1].max() + .02)
    ax.set_aspect('equal'); ax.set_facecolor('#8a95a3'); ax.set_xticks([]); ax.set_yticks([])

def render_tris(tris, path, title='', boost=2.4):
    fig, axs = plt.subplots(2, 2, figsize=(14, 8), dpi=90)
    for ax, view in zip(axs.flat, ['side', 'iso', 'top', 'front']):
        draw_tris(ax, tris, view, boost=boost); ax.set_title(f'{title} {view}', fontsize=9)
    fig.tight_layout(); fig.savefig(path); plt.close(fig); print('preview ->', path)

def render_model_json(m, path):
    tris = []
    for part in m['parts']:
        P = np.array(m['parts'][0]['positions'] if False else part['positions']).reshape(-1, 3); I = np.array(part['indices']).reshape(-1, 3)
        rgb = hex2rgb(part['color'])
        for t in I: tris.append((P[t], rgb))
    render_tris(tris, path, m['name'])
