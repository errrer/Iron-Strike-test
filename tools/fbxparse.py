import struct, zlib, numpy as np

class Node:
    def __init__(s, name): s.name=name; s.props=[]; s.children=[]
    def get(s, name): 
        for c in s.children:
            if c.name==name: return c
    def all(s, name): return [c for c in s.children if c.name==name]

def parse(path):
    d=open(path,'rb').read(); ver=struct.unpack_from('<I',d,23)[0]; big=ver>=7500
    pos=27
    def prop(p):
        t=chr(d[p]); p+=1
        if t in 'YFDLCIS' or t in 'R':
            pass
        if t=='Y': return struct.unpack_from('<h',d,p)[0],p+2
        if t=='C': return bool(d[p]),p+1
        if t=='I': return struct.unpack_from('<i',d,p)[0],p+4
        if t=='F': return struct.unpack_from('<f',d,p)[0],p+4
        if t=='D': return struct.unpack_from('<d',d,p)[0],p+8
        if t=='L': return struct.unpack_from('<q',d,p)[0],p+8
        if t in 'fdilb':
            n,enc,clen=struct.unpack_from('<III',d,p); p+=12
            raw=d[p:p+clen]; p+=clen
            if enc: raw=zlib.decompress(raw)
            dt={'f':'<f4','d':'<f8','i':'<i4','l':'<i8','b':'u1'}[t]
            return np.frombuffer(raw,dtype=dt).copy(),p
        if t=='S':
            n=struct.unpack_from('<I',d,p)[0]; p+=4; return d[p:p+n].decode('latin1'),p+n
        if t=='R':
            n=struct.unpack_from('<I',d,p)[0]; p+=4; return d[p:p+n],p+n
        raise ValueError(t)
    def rec(p):
        if big: end,np_,pl,nl=struct.unpack_from('<QQQB',d,p); p+=25
        else: end,np_,pl,nl=struct.unpack_from('<IIIB',d,p); p+=13
        if end==0: return None,p
        name=d[p:p+nl].decode('latin1'); p+=nl
        n=Node(name)
        for _ in range(np_):
            v,p=prop(p); n.props.append(v)
        while p<end:
            c,p=rec(p)
            if c is None: break
            n.children.append(c)
        return n,end
    root=Node('root')
    while pos<len(d)-200:
        n,pos=rec(pos)
        if n is None: break
        root.children.append(n)
    return root

def dump(n,depth=0,maxd=4):
    pr=[]
    for p in n.props[:6]:
        if isinstance(p,np.ndarray): pr.append(f'arr{p.dtype}[{len(p)}]')
        else: pr.append(repr(p)[:60])
    print('  '*depth+n.name, pr)
    if depth<maxd:
        for c in n.children: dump(c,depth+1,maxd)
