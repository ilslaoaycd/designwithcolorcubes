import sys, json, random, os, subprocess, statistics
sys.path.insert(0,'/home/claude/faces')
from lib import *
S=json.load(open('/home/claude/faces/work/scenes.json'))
OUT='/home/claude/assets/color-cubes-assets'
def folder(name,sc):
    if sc['kind'].startswith('pattern'): return 'patterns'
    if sc['kind']=='strip': return 'spills-horizontal'
    return 'scatters'
def short(name): return name.replace('pattern-','')

# ---------------- scanned cubes ----------------
def render_scan(name,sc,seed):
    rng=random.Random(seed); W,H=sc['size']; pl=[]
    for it in sc['items']:
        ri=rot_face(face_for_digit(it['d'],rng),-it['a'],int(round(it['s'])))
        pl.append((ri,it['x']-ri.width/2,it['y']-ri.height/2))
    T=statistics.median(it['s'] for it in sc['items'])
    d=f"{OUT}/{os.environ.get('CC_2D','2d-scan')}/{folder(name,sc)}"; os.makedirs(d,exist_ok=True)
    if sc.get('noshadow'):
        compose((W,H),pl,shadow=False,tile=T).save(f"{d}/{short(name)}.png",optimize=True); return
    compose((W,H),pl,tile=T).save(f"{d}/{short(name)}.png",optimize=True)
    compose((W,H),pl,bg=black_paper(W,H),tile=T).convert('RGB').save(f"{d}/{short(name)}-on-black.jpg",quality=88)

# ---------------- vector cubes ----------------
COL=dict(w='#F4ECD8',r='#C0272D',y='#E3B23C',b='#1E2A5A')
EDGE=dict(w='#D9CDB0',r='#8F1C21',y='#B98C24',b='#121A3A')
TRI=["-50,-50 50,-50 -50,50","-50,-50 50,-50 50,50","50,-50 50,50 -50,50","-50,-50 50,50 -50,50"]
RIM=1.7/27.5*100   # 1.7 mm rim on a 27.5 mm face, in face units (face = 100)
def light_tri(k):
    b=RIM; pts=[(50-b,-50+b),(50-b,50-b),(-50+b,50-b)]   # recessed light triangle when the dark corner is top-left
    for _ in range(k): pts=[(-y,x) for x,y in pts]       # turn clockwise
    return ' '.join(f'{x:.2f},{y:.2f}' for x,y in pts)
def face_defs():
    out=[]
    for d in range(12):
        if d<4:
            c='wryb'[d]; body=f'<rect x="-50" y="-50" width="100" height="100" rx="5" fill="{COL[c]}"/>'; edge=EDGE[c]
        else:
            lt,dk=('y','b') if d<8 else ('w','r'); k=(d-4)%4
            body=(f'<rect x="-50" y="-50" width="100" height="100" rx="5" fill="{COL[dk]}"/>'
                  f'<polygon points="{light_tri(k)}" fill="{COL[lt]}"/>'); edge=EDGE[dk]
        out.append(f'<g id="f{d}">{body}<rect x="-49.25" y="-49.25" width="98.5" height="98.5" rx="4.5" fill="none" stroke="{edge}" stroke-width="1.5" opacity="0.55"/></g>')
    return '\n'.join(out)
def svg_for(sc, bg=None):
    W,H=sc['size']; T=statistics.median(it['s'] for it in sc['items'])
    k=T/150
    uses='\n'.join(f'<use href="#f{it["d"]}" transform="translate({it["x"]:.1f} {it["y"]:.1f}) rotate({it["a"]:.2f}) scale({it["s"]/100:.4f})"/>' for it in sc['items'])
    shadow='' if sc.get('noshadow') else (f'<filter id="sh" x="-10%" y="-10%" width="120%" height="120%">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{7*k:.1f}"/><feOffset dx="{5*k:.1f}" dy="{8*k:.1f}" result="b"/>'
        f'<feComponentTransfer><feFuncA type="linear" slope="0.38"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
    g_open='<g filter="url(#sh)">' if shadow else '<g>'
    bgrect=f'<rect width="{W}" height="{H}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n'
            f'<title>Color Cubes: {sc.get("title","")}</title>\n<defs>\n{face_defs()}\n{shadow}\n</defs>\n{bgrect}{g_open}\n{uses}\n</g>\n</svg>\n')
def render_vector(name,sc):
    d=f"{OUT}/2d-vector/{folder(name,sc)}"; os.makedirs(d,exist_ok=True)
    sc['title']=short(name)
    svg=svg_for(sc); p=f"{d}/{short(name)}.svg"; open(p,'w').write(svg)
    subprocess.run(['rsvg-convert','-o',p[:-4]+'.png',p],check=True)
    if not sc.get('noshadow'):
        p2=f"{d}/{short(name)}-on-black.svg"; open(p2,'w').write(svg_for(sc,bg='#25272B'))
        subprocess.run(['rsvg-convert','-o',p2[:-4]+'.png',p2],check=True); os.remove(p2)

if __name__=='__main__':
    which=sys.argv[1] if len(sys.argv)>1 else 'both'
    for i,(name,sc) in enumerate(S.items()):
        if which in ('both','scan'): render_scan(name,sc,100+i)
        if which in ('both','vector'): render_vector(name,sc)
    print('done',len(S))
