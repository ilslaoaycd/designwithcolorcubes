import json, random, math, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
ROOT='/home/claude/assets/color-cubes-assets'
WORK=os.environ.get('CC_WORK','/home/claude/faces/work')
meta=json.load(open(f'{WORK}/meta.json'))
KINDS=['solid-white','solid-red','solid-yellow','solid-blue','diag-blue-yellow','diag-red-white']
CODE=['w','r','y','b','1','2','3','4','5','6','7','8']
def load(name): return Image.open(f'{WORK}/norm/{name}.png').convert('RGBA')
POOL={k:[load(t['name']) for t in meta if t['kind']==k] for k in KINDS}

def face_for_digit(d, rng):
    """Random real face for a tray digit 0-11, rotated to the right corner."""
    if d<4: im=rng.choice(POOL[KINDS[d]]); return im.rotate(90*rng.randrange(4))  # solids: any turn for variety
    kind='diag-blue-yellow' if d<8 else 'diag-red-white'
    corner=(d-4)%4      # 0 TL,1 TR,2 BR,3 BL ; canonical sample has dark corner TL
    im=rng.choice(POOL[kind])
    return im.rotate(-90*corner)   # PIL rotate is CCW for positive angles; -90 moves TL->TR

def parse(code):
    rows=code.split('-'); return [[CODE.index(ch) for ch in r] for r in rows]

def black_paper(w,h):
    """Real black-paper grain from scan 9, with the scanner's light falloff removed so tiling has no bands."""
    bgsrc=os.environ.get('CC_BG','/mnt/user-data/uploads/4ffd9f78-image.jpg|40,1830,1520,2140').split('|')
    src=np.asarray(Image.open(bgsrc[0]).convert('RGB').crop(tuple(int(v) for v in bgsrc[1].split(',')))).astype(np.float32)
    import cv2
    low=cv2.GaussianBlur(src,(0,0),25)
    grain=src-low+np.median(src.reshape(-1,3),0)
    grain=np.clip(grain,0,255).astype(np.uint8)
    t=Image.fromarray(grain)
    tile=Image.new('RGB',(t.width*2,t.height*2))
    tile.paste(t,(0,0)); tile.paste(t.transpose(Image.FLIP_LEFT_RIGHT),(t.width,0))
    tile.paste(t.transpose(Image.FLIP_TOP_BOTTOM),(0,t.height)); tile.paste(t.transpose(Image.ROTATE_180),(t.width,t.height))
    out=Image.new('RGB',(w,h))
    for y in range(0,h,tile.height):
        for x in range(0,w,tile.width): out.paste(tile,(x,y))
    # gentle vignette, like the scans
    yy,xx=np.mgrid[0:h,0:w]; d=np.sqrt(((xx-w/2)/(w/2))**2+((yy-h/2)/(h/2))**2)
    arr=np.asarray(out).astype(np.float32)*(1.06-0.12*np.clip(d,0,1.4)[...,None]/1.4)
    return Image.fromarray(np.clip(arr,0,255).astype(np.uint8))

def shadow_layer(size, placements, blur, offset, opacity):
    """placements: list of (img_rgba, x, y) already rotated. returns RGBA shadow."""
    sh=Image.new('L',size,0)
    for im,x,y in placements:
        a=im.split()[3]
        sh.paste(a,(int(x+offset[0]),int(y+offset[1])),a)
    sh=sh.filter(ImageFilter.GaussianBlur(blur)).point(lambda v:int(v*opacity))
    out=Image.new('RGBA',size,(0,0,0,0)); out.putalpha(sh); return out

def compose(size, placements, bg=None, shadow=True, tile=200):
    """Returns RGBA (transparent if bg None)."""
    base=Image.new('RGBA',size,(0,0,0,0)) if bg is None else bg.convert('RGBA').resize(size) if bg.size!=size else bg.convert('RGBA')
    if shadow:
        s=tile/200
        base=Image.alpha_composite(base,shadow_layer(size,placements,blur=10*s,offset=(6*s,9*s),opacity=0.55))
        base=Image.alpha_composite(base,shadow_layer(size,placements,blur=3*s,offset=(2*s,3*s),opacity=0.5))
    for im,x,y in placements:
        layer=Image.new('RGBA',size,(0,0,0,0)); layer.paste(im,(int(x),int(y)),im)
        base=Image.alpha_composite(base,layer)
    return base

def rot_face(im, ang, tile):
    im=im.resize((tile,tile),Image.LANCZOS)
    return im.rotate(ang,resample=Image.BICUBIC,expand=True)

# --- oriented square collision (SAT) ---
def corners(cx,cy,s,ang):
    a=math.radians(ang); c,sn=math.cos(a),math.sin(a); h=s/2
    return [(cx+dx*c-dy*sn, cy+dx*sn+dy*c) for dx,dy in [(-h,-h),(h,-h),(h,h),(-h,h)]]
def overlap(A,B,margin=0):
    for poly in (A,B):
        for i in range(4):
            x1,y1=poly[i]; x2,y2=poly[(i+1)%4]
            nx,ny=y2-y1,x1-x2; L=math.hypot(nx,ny); nx/=L; ny/=L
            pa=[px*nx+py*ny for px,py in A]; pb=[px*nx+py*ny for px,py in B]
            if max(pa)+margin<=min(pb) or max(pb)+margin<=min(pa): return False
    return True
