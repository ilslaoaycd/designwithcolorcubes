import sys; sys.path.insert(0,'/home/claude/faces')
from lib import *
from patterns import P, render_grid
import shutil
R=ROOT
for d in ['faces/all','faces/by-code','patterns','scatters']: os.makedirs(f'{R}/{d}',exist_ok=True)

# ---------------- faces ----------------
manifest=[]; counters={}
order=sorted(meta,key=lambda t:(t['kind'],t['name']))
best={}
for t in order:
    counters[t['kind']]=counters.get(t['kind'],0)+1
    fn=f"{t['kind']}-{counters[t['kind']]:02d}.png"
    shutil.copy(f"work/norm/{t['name']}.png",f"{R}/faces/all/{fn}")
    manifest.append(dict(file=f"faces/all/{fn}",kind=t['kind'],source_scan={'s07':'Scan_20261123-7','s08':'Scan_20261123-8','s09':'Scan_20261123-9','s10':'Scan_20261123-10','s11':'Scan_20261123-11'}[t['scan']],
        crop_quad_px=[[round(v,1) for v in p] for p in t['quad']],orientation='dark triangle top-left' if t['kind'].startswith('diag') else 'as scanned'))
    # pick representative: highest alpha coverage from clean single/grid tiles
    if t['group']!='heap' and t['alpha_cov']>best.get(t['kind'],(0,None))[0]: best[t['kind']]=(t['alpha_cov'],t['name'])
json.dump(manifest,open(f'{R}/faces/manifest.json','w'),indent=1)
for d,ch in enumerate(CODE):
    if d<4: im=load(best[KINDS[d]][1])
    else:
        kind='diag-blue-yellow' if d<8 else 'diag-red-white'
        im=load(best[kind][1]).rotate(-90*((d-4)%4))
    im.save(f'{R}/faces/by-code/{ch}.png')
print('faces',len(manifest))

# ---------------- patterns ----------------
for i,(name,cs) in enumerate(P.items()):
    T=150
    render_grid(cs,tile=T,gap=5,seed=10+i).save(f'{R}/patterns/{name}.png',optimize=True)
    render_grid(cs,tile=T,gap=5,seed=10+i,bg='paper').convert('RGB').save(f'{R}/patterns/{name}-on-black.jpg',quality=88)
    # clean: perfectly aligned, tight, no shadow
    rng=random.Random(99+i); g=parse(cs); h=len(g); w=len(g[0]); gap=4
    im=Image.new('RGBA',(w*(T+gap)-gap,h*(T+gap)-gap),(0,0,0,0))
    for r in range(h):
        for c in range(w):
            f=face_for_digit(g[r][c],rng).resize((T,T),Image.LANCZOS); im.paste(f,(c*(T+gap),r*(T+gap)),f)
    im.save(f'{R}/patterns/{name}-clean.png',optimize=True)
json.dump({k:{'code':v,'size':f"{len(v.split('-')[0])}x{len(v.split('-'))}"} for k,v in P.items()},open(f'{R}/patterns/patterns.json','w'),indent=1)
print('patterns',len(P))

# ---------------- scatters ----------------
def random_face(rng):
    return rng.choice(POOL[rng.choice(KINDS)])

def place(items, W,H,T, rng, cx,cy, sigma, n, p_contact=0.58, tail=0.12, align_sd=7, existing=None):
    polys=existing if existing is not None else []
    tries=0
    while len(items)<n and tries<40000:
        tries+=1
        if polys and rng.random()<p_contact:
            px,py,pa=rng.choice([(p[0],p[1],p[2]) for p in polys])
            side=rng.randrange(4); a=math.radians(pa+90*side)
            d=T*(1.0+rng.uniform(0.015,0.12)); lat=rng.uniform(-0.35,0.35)*T
            x=px+math.cos(a)*d-math.sin(a)*lat; y=py+math.sin(a)*d+math.cos(a)*lat
            ang=pa+rng.gauss(0,align_sd)
        else:
            s=sigma*(2.3 if rng.random()<tail else 1.0)
            x=rng.gauss(cx,s*1.25); y=rng.gauss(cy,s*0.9); ang=rng.uniform(0,360)
        if not (T*0.8<x<W-T*0.8 and T*0.8<y<H-T*0.8): continue
        C=corners(x,y,T*0.985,ang)
        if any(overlap(C,p[3],margin=1.5) for p in polys): continue
        polys.append((x,y,ang,C)); items.append((x,y,ang))
    return items

def render_items(items,W,H,T,rng,faces=None):
    pl=[]
    for k,(x,y,ang) in enumerate(items):
        f=faces[k] if faces else random_face(rng)
        ri=rot_face(f,-ang,T)   # PIL rotates CCW; our angle is CW in image coords
        pl.append((ri,x-ri.width/2,y-ri.height/2))
    return pl

def save_scatter(name,pl,W,H,T):
    compose((W,H),pl,tile=T).save(f'{R}/scatters/{name}.png',optimize=True)
    compose((W,H),pl,bg=black_paper(W,H),tile=T).convert('RGB').save(f'{R}/scatters/{name}-on-black.jpg',quality=88)

specs=[('floor-dump-16-cubes',16,1600,1200,140,1.8,1),('floor-dump-36-cubes',36,2000,1400,130,2.2,2),
       ('floor-dump-49-cubes',49,2400,1600,130,2.4,3),('floor-dump-49-cubes-b',49,2400,1600,130,2.2,4),
       ('floor-dump-81-cubes',81,2800,1900,120,3.0,5)]
for name,n,W,H,T,sig,seed in specs:
    rng=random.Random(seed); items=place([],W,H,T,rng,W/2,H/2,sig*T,n)
    save_scatter(name,render_items(items,W,H,T,rng),W,H,T); print(name,len(items))

# loose even scatter (like a scan)
for name,n,W,H,T,seed in [('loose-scatter-30-cubes',30,1800,2400,170,11),('loose-scatter-wide-24-cubes',24,2600,1400,150,12)]:
    rng=random.Random(seed); items=[]; polys=[]; tries=0
    while len(items)<n and tries<20000:
        tries+=1; x=rng.uniform(T,W-T); y=rng.uniform(T,H-T); ang=rng.uniform(0,360)
        C=corners(x,y,T,ang)
        if any(overlap(C,p,margin=T*0.25) for p in polys): continue
        polys.append(C); items.append((x,y,ang))
    save_scatter(name,render_items(items,W,H,T,rng),W,H,T); print(name,len(items))

# half-built tray: part of the quadrants pattern laid out, rest dumped beside it
def half_built(name,code,done_rows,W,H,T,seed,origin):
    rng=random.Random(seed); g=parse(code); n=len(g[0]); gap=5
    pl=[]; polys=[]; laid=0
    ox,oy=origin
    for r in range(len(g)):
        for c in range(n):
            idx=r*n+c
            if idx>=done_rows: continue
            ang=rng.uniform(-1.5,1.5); x=ox+c*(T+gap)+T/2+rng.uniform(-3,3); y=oy+r*(T+gap)+T/2+rng.uniform(-3,3)
            f=face_for_digit(g[r][c],rng); ri=rot_face(f,-ang,T); pl.append((ri,x-ri.width/2,y-ri.height/2))
            polys.append((x,y,ang,corners(x,y,T,ang))); laid+=1
    remaining=len(g)*n-laid
    items=[]
    # dump the rest to the right/below
    place(items,W,H,T,rng,W*0.78,H*0.55,T*1.6,remaining,existing=polys)
    pl+=render_items(items,W,H,T,rng)
    save_scatter(name,pl,W,H,T); print(name,laid,'laid',len(items),'loose')
half_built('half-built-quadrants-7x7',P['quadrants-7x7'],30,2600,1500,130,21,(110,150))
half_built('half-built-concentric-9x9',P['concentric-diamond-9x9'],40,2900,1700,120,22,(110,120))

# small assembled blocks among loose cubes (like the 2x2 / 3x3 groups in the scans)
def blocks_scene(name,W,H,T,seed):
    rng=random.Random(seed); pl=[]; polys=[]
    blocks=[('56-87',(0.18,0.22)),('34-21',(0.42,0.2)),('555-555-555',(0.7,0.3)),('414-141-414',(0.25,0.62))]
    gap=4
    for code,(fx,fy) in blocks:
        g=parse(code); n=len(g); base=rng.uniform(-8,8); a=math.radians(base)
        cx,cy=W*fx,H*fy
        for r in range(n):
            for c in range(n):
                lx=(c-(n-1)/2)*(T+gap); ly=(r-(n-1)/2)*(T+gap)
                x=cx+lx*math.cos(a)-ly*math.sin(a); y=cy+lx*math.sin(a)+ly*math.cos(a)
                ang=base+rng.uniform(-1.2,1.2)
                f=face_for_digit(g[r][c],rng); ri=rot_face(f,-ang,T); pl.append((ri,x-ri.width/2,y-ri.height/2))
                polys.append((x,y,ang,corners(x,y,T,ang)))
    items=[]; place(items,W,H,T,rng,W*0.62,H*0.72,T*1.8,16,p_contact=0.25,existing=polys)
    pl+=render_items(items,W,H,T,rng); save_scatter(name,pl,W,H,T); print(name)
blocks_scene('assembled-blocks-and-loose-cubes',2600,1700,130,31)
