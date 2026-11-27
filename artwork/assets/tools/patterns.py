import sys; sys.path.insert(0,'/home/claude/faces')
from lib import *
def code(grid): return '-'.join(''.join(CODE[d] for d in row) for row in grid)
def diag(pair,corner): return (4 if pair=='by' else 8)+corner   # corner 0 TL,1 TR,2 BR,3 BL (dark triangle)

def concentric(n, pairs=('rw','by'), axis_solid=('w','y')):
    c=n//2; g=[]
    for r in range(n):
        row=[]
        for col in range(n):
            dr,dc=r-c,col-c; ring=abs(dr)+abs(dc)
            pair=pairs[(ring)%2] if False else pairs[(max(abs(dr),abs(dc)))%2]
            p='rw' if pair=='rw' else 'by'
            if dr==0 or dc==0:
                row.append(CODE.index('b' if (max(abs(dr),abs(dc)))%2 else 'r')); continue
            # outer corner of the cell relative to the center
            outer = 0 if (dr<0 and dc<0) else 1 if (dr<0 and dc>0) else 2 if (dr>0 and dc>0) else 3
            row.append(diag('rw' if (abs(dr)+abs(dc))%2==0 else 'by', outer))
        g.append(row)
    return g

def block_tile(n, unit):
    k=len(unit); return [[unit[r%k][c%k] for c in range(n)] for r in range(n)]

P={}
P['quadrants-7x7']='686w313-868w131-686w313-wwwwww6-313w686-131w868-313w686'
P['checkerboard-7x7']=code([[3 if (r+c)%2==0 else 1 for c in range(7)] for r in range(7)])
P['red-white-stripes-7x7']=code([[diag('rw',0)]*7 for _ in range(7)])
P['blue-yellow-zigzag-7x7']=code([[diag('by',0 if r%2==0 else 3)]*7 for r in range(7)])
P['white-diamonds-4x4']=code(block_tile(4,[[diag('rw',0),diag('rw',1)],[diag('rw',3),diag('rw',2)]]))
P['blue-diamonds-4x4']=code(block_tile(4,[[diag('by',2),diag('by',3)],[diag('by',1),diag('by',0)]]))
P['pinwheels-6x6']=code(block_tile(6,[[diag('by',1),diag('by',2)],[diag('by',0),diag('by',3)]]))
P['red-pinwheels-6x6']=code(block_tile(6,[[diag('rw',1),diag('rw',2)],[diag('rw',0),diag('rw',3)]]))
P['concentric-diamond-9x9']=code(concentric(9))
P['concentric-diamond-7x7']=code(concentric(7))
# sawtooth border with blue center
def saw(n):
    g=[[3]*n for _ in range(n)]
    for i in range(n):
        g[0][i]=diag('rw',3); g[n-1][i]=diag('rw',1); g[i][0]=diag('rw',1); g[i][n-1]=diag('rw',3)
    g[0][0]=1; g[0][n-1]=1; g[n-1][0]=1; g[n-1][n-1]=1
    for r in range(2,n-2):
        for c in range(2,n-2): g[r][c]=2 if (r+c)%2 else 0
    return g
P['sawtooth-border-9x9']=code(saw(9))
P['star-6x6']=code([
 [0,0,diag('by',3),diag('by',2),0,0],
 [0,0,diag('by',1),diag('by',0),0,0],
 [diag('by',1),diag('by',3),3,3,diag('by',2),diag('by',0)],
 [diag('by',2),diag('by',0),3,3,diag('by',1),diag('by',3)],
 [0,0,diag('by',3),diag('by',2),0,0],
 [0,0,diag('by',1),diag('by',0),0,0]])
json.dump(P,open('work/patterns.json','w'),indent=1)

def render_grid(code_str, tile=200, gap=6, jitter=True, seed=1, margin=None, bg=None):
    rng=random.Random(seed); g=parse(code_str); h=len(g); w=len(g[0])
    margin=margin if margin is not None else tile//2
    pitch=tile+gap
    size=(margin*2+w*pitch-gap, margin*2+h*pitch-gap)
    pl=[]
    for r in range(h):
        for c in range(w):
            im=face_for_digit(g[r][c],rng)
            ang=rng.uniform(-1.6,1.6) if jitter else 0
            dx,dy=(rng.uniform(-4,4),rng.uniform(-4,4)) if jitter else (0,0)
            ri=rot_face(im,ang,tile)
            cx=margin+c*pitch+tile/2+dx; cy=margin+r*pitch+tile/2+dy
            pl.append((ri,cx-ri.width/2,cy-ri.height/2))
    bgimg=black_paper(*size) if bg=='paper' else bg
    return compose(size,pl,bg=bgimg,tile=tile)

if __name__=='__main__':
    os.makedirs('work/pv',exist_ok=True)
    for name,cs in P.items():
        im=render_grid(cs,tile=60,gap=3,margin=20,bg='paper')
        im.convert('RGB').save(f'work/pv/{name}.jpg')
    # preview sheet
    ims=[Image.open(f'work/pv/{n}.jpg') for n in P]
    W=sum(i.width for i in ims[:6])+70; 
    sheet=Image.new('RGB',(1800,1400),(240,240,240)); x=y=10; rowh=0
    for n,i in zip(P,ims):
        if x+i.width>1790: x=10; y+=rowh+30; rowh=0
        sheet.paste(i,(x,y)); ImageDraw.Draw(sheet).text((x,y+i.height+4),n,fill=(0,0,0)); x+=i.width+10; rowh=max(rowh,i.height)
    sheet.crop((0,0,1800,y+rowh+30)).save('work/patterns_preview.jpg')
