# Builds every 2D scene as a list of cubes {d: tray digit 0-11, x, y (centre px), a: clockwise degrees, s: size px}.
import sys, json, math, random
sys.path.insert(0,'/home/claude/faces')
from lib import corners, overlap, parse
from patterns import P

def rand_digit(rng):
    k=rng.randrange(6)
    return k if k<4 else (4 if k==4 else 8)+rng.randrange(4)

def grid_items(code, T=150, gap=5, margin=None, jitter=True, rng=None):
    g=parse(code); h=len(g); w=len(g[0]); margin=T//2 if margin is None else margin; pitch=T+gap
    items=[]
    for r in range(h):
        for c in range(w):
            a=rng.uniform(-1.6,1.6) if jitter else 0
            dx,dy=(rng.uniform(-4,4),rng.uniform(-4,4)) if jitter else (0,0)
            items.append(dict(d=g[r][c],x=margin+c*pitch+T/2+dx,y=margin+r*pitch+T/2+dy,a=a,s=T))
    return items,(margin*2+w*pitch-gap, margin*2+h*pitch-gap)

def place(rng,W,H,T,cx,cy,sigma,n,existing,p_contact=0.58,tail=0.12,align_sd=7):
    out=[]; tries=0
    while len(out)<n and tries<40000:
        tries+=1
        if existing and rng.random()<p_contact:
            e=rng.choice(existing); side=rng.randrange(4); a=math.radians(e['a']+90*side)
            d=T*(1.0+rng.uniform(0.015,0.12)); lat=rng.uniform(-0.35,0.35)*T
            x=e['x']+math.cos(a)*d-math.sin(a)*lat; y=e['y']+math.sin(a)*d+math.cos(a)*lat; ang=e['a']+rng.gauss(0,align_sd)
        else:
            s=sigma*(2.3 if rng.random()<tail else 1.0)
            x=rng.gauss(cx,s*1.25); y=rng.gauss(cy,s*0.9); ang=rng.uniform(0,360)
        if not (T*0.8<x<W-T*0.8 and T*0.8<y<H-T*0.8): continue
        C=corners(x,y,T*0.985,ang)
        if any(overlap(C,corners(e['x'],e['y'],e['s']*0.985,e['a']),margin=1.5) for e in existing): continue
        it=dict(d=rand_digit(rng),x=x,y=y,a=ang,s=T); existing.append(it); out.append(it)
    return out

S={}
# ---- organized patterns ----
for i,(name,code) in enumerate(P.items()):
    rng=random.Random(10+i)
    items,size=grid_items(code,rng=rng); S['pattern-'+name]=dict(kind='pattern',size=size,items=items,code=code)
    items,size=grid_items(code,gap=4,margin=0,jitter=False,rng=rng); S['pattern-'+name+'-clean']=dict(kind='pattern-clean',size=size,items=items,code=code,noshadow=True)

# ---- floor dumps ----
for name,n,W,H,T,sig,seed in [('dump-16-cubes',16,1600,1200,140,1.8,1),('dump-36-cubes',36,2000,1400,130,2.2,2),
        ('dump-49-cubes',49,2400,1600,130,2.4,3),('dump-49-cubes-b',49,2400,1600,130,2.2,4),('dump-81-cubes',81,2800,1900,120,3.0,5)]:
    rng=random.Random(seed); ex=[]; place(rng,W,H,T,W/2,H/2,sig*T,n,ex)
    S[name]=dict(kind='scatter',size=(W,H),items=ex)

# ---- loose even scatters ----
for name,n,W,H,T,seed in [('loose-30-cubes',30,1800,2400,170,11),('loose-wide-24-cubes',24,2600,1400,150,12)]:
    rng=random.Random(seed); items=[]; tries=0
    while len(items)<n and tries<20000:
        tries+=1; x=rng.uniform(T,W-T); y=rng.uniform(T,H-T); a=rng.uniform(0,360)
        C=corners(x,y,T,a)
        if any(overlap(C,corners(e['x'],e['y'],e['s'],e['a']),margin=T*0.25) for e in items): continue
        items.append(dict(d=rand_digit(rng),x=x,y=y,a=a,s=T))
    S[name]=dict(kind='scatter',size=(W,H),items=items)

# ---- half-built trays ----
def half_built(name,code,done,W,H,T,seed,origin):
    rng=random.Random(seed); g=parse(code); n=len(g[0]); gap=5; ox,oy=origin; items=[]
    for r in range(len(g)):
        for c in range(n):
            if r*n+c>=done: continue
            items.append(dict(d=g[r][c],x=ox+c*(T+gap)+T/2+rng.uniform(-3,3),y=oy+r*(T+gap)+T/2+rng.uniform(-3,3),a=rng.uniform(-1.5,1.5),s=T))
    place(rng,W,H,T,W*0.78,H*0.55,T*1.6,len(g)*n-len(items),items)
    S[name]=dict(kind='scatter',size=(W,H),items=items)
half_built('half-built-quadrants-7x7',P['quadrants-7x7'],30,2600,1500,130,21,(110,150))
half_built('half-built-concentric-9x9',P['concentric-diamond-9x9'],40,2900,1700,120,22,(110,120))

# ---- assembled blocks + loose ----
def blocks(name,W,H,T,seed):
    rng=random.Random(seed); items=[]; gap=4
    for code,(fx,fy) in [('56-87',(0.18,0.22)),('34-21',(0.42,0.2)),('555-555-555',(0.7,0.3)),('414-141-414',(0.25,0.62))]:
        g=parse(code); n=len(g); base=rng.uniform(-8,8); a=math.radians(base); cx,cy=W*fx,H*fy
        for r in range(n):
            for c in range(n):
                lx=(c-(n-1)/2)*(T+gap); ly=(r-(n-1)/2)*(T+gap)
                items.append(dict(d=g[r][c],x=cx+lx*math.cos(a)-ly*math.sin(a),y=cy+lx*math.sin(a)+ly*math.cos(a),a=base+rng.uniform(-1.2,1.2),s=T))
    place(rng,W,H,T,W*0.62,H*0.72,T*1.8,16,items,p_contact=0.25)
    S[name]=dict(kind='scatter',size=(W,H),items=items)
blocks('assembled-blocks-and-loose-cubes',2600,1700,130,31)

# ---- horizontal spills (banner strips, mixed sizes for depth) ----
def horizontal(name,n,W,H,base,seed,spread=0.5):
    rng=random.Random(seed); items=[]; tries=0
    while len(items)<n and tries<60000:
        tries+=1
        s=base*rng.uniform(0.72,1.18); a=rng.uniform(0,360); r=s*0.72
        x=rng.uniform(r+6,W-r-6)
        y=H/2+rng.gauss(0,H*spread*0.32); 
        if not (r+6<y<H-r-6): continue
        C=corners(x,y,s,a)
        if any(overlap(C,corners(e['x'],e['y'],e['s'],e['a']),margin=base*0.12) for e in items): continue
        items.append(dict(d=rand_digit(rng),x=x,y=y,a=a,s=s))
    S[name]=dict(kind='strip',size=(W,H),items=items)
horizontal('spill-horizontal-2400x320',26,2400,320,118,41)
horizontal('spill-horizontal-3000x400',40,3000,400,120,42)
horizontal('spill-horizontal-1600x260',16,1600,260,100,43)

json.dump(S,open('work/scenes.json','w'))
print(len(S),'scenes'); print({k:len(v['items']) for k,v in S.items() if 'pattern' not in k})
