# Printed-cube faces generated from the slicer geometry (bead lines, walls, recess), with only fine
# surface grain borrowed from clean patches of the printed-cube scans.
import numpy as np, cv2, json, os
S=27.5; LH=0.2; FIRST=0.3; W=0.45; RIM=1.7; POCKET=1.0; h=S/2
FIL={'r':(59,48,235),'y':(101,198,228),'w':(244,246,244),'b':(170,94,30)}          # BGR, measured from the printed scans
PW='/home/claude/printed/work'
meta=json.load(open(f'{PW}/meta.json'))

def bead(f): return np.sqrt(np.clip(np.sin(np.pi*np.clip(f,0,1)),0,1))

def grain(colour, N, seed):
    """High-pass surface detail from a clean interior patch of a printed scan tile."""
    kind={'r':'solid-red','y':'solid-yellow','w':'solid-white','b':'solid-blue'}[colour]
    names=[t['name'] for t in meta if t['kind']==kind]
    rs=np.random.default_rng(seed); name=names[rs.integers(len(names))]
    im=cv2.imread(f'{PW}/norm/{name}.png')[:,:,:3].astype(np.float32)
    p=im[72:168,72:168]                                   # centre, away from edges and neighbours
    hp=p-cv2.GaussianBlur(p,(0,0),2)
    hp=np.clip(hp.mean(2,keepdims=True),-7,7)                           # luminance only, keep our filament colour
    blk=np.vstack([np.hstack([hp,hp[:,::-1]]),np.hstack([hp[::-1],hp[::-1,::-1]])])
    scale=N/240; blk=cv2.resize(blk,None,fx=scale,fy=scale,interpolation=cv2.INTER_CUBIC)
    if blk.ndim==2: blk=blk[...,None]
    reps=N//blk.shape[0]+1; out=np.tile(blk,(reps,reps,1))[:N,:N]
    sh=rs.integers(0,blk.shape[0],2); return np.roll(out,tuple(sh),axis=(0,1))

def coords(N):
    v,u=np.mgrid[0:N,0:N]; px=N/S
    return -h+(u+0.5)/px, h-(v+0.5)/px            # x east, y north

def recess(x,y):
    inside=(x<=h-RIM)&(y>=-h+RIM)&(x>=y)
    T=[(h-RIM,h-RIM),(h-RIM,-h+RIM),(-h+RIM,-h+RIM)]
    def seg(ax,ay,bx,by):
        dx,dy=bx-ax,by-ay; t=np.clip(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1); return np.hypot(x-ax-t*dx,y-ay-t*dy)
    d=np.minimum(np.minimum(seg(*T[0],*T[1]),seg(*T[1],*T[2])),seg(*T[2],*T[0]))
    return inside,d

def height(kind,N,seed):
    """kind: 'side' (layer lines), 'top' (red/white top skin) or 'bottom' (blue/yellow first layer)."""
    rs=np.random.default_rng(seed)
    if kind=='side':
        z=(1-(np.arange(N)+0.5)/N)*S
        L=np.where(z<FIRST,0,np.floor((z-FIRST)/LH)+1).astype(int)
        lo=np.where(L==0,0,FIRST+(L-1)*LH); th=np.where(L==0,FIRST,LH)
        jit=rs.normal(0,0.05,L.max()+2)[L]
        Hm=np.repeat((bead((z-lo)/th)*(1+jit))[:,None],N,1)
        Hm+=0.025*np.sin(np.arange(N)/N*2*np.pi*rs.uniform(2,4)+rs.uniform(0,6))[None,:]
        return Hm,None
    x,y=coords(N); inside,dt=recess(x,y)
    dedge=np.minimum(h-np.abs(x),h-np.abs(y))
    def lines(a,ph=0.0):
        c=x*(-np.sin(a))+y*np.cos(a); return bead(((c/W)+ph)%1.0)
    if kind=='top':
        Hm=np.where(inside,lines(-np.pi/4,rs.uniform()),lines(np.pi/4,rs.uniform()))
    else:   # first layer squashed onto the bed; recess floor bridged
        Hm=np.where(inside,0.9*lines(np.pi/4,rs.uniform()),0.55+0.45*lines(np.pi/4,rs.uniform()))
    walls=dedge<2*W; Hm=np.where(walls,bead((dedge/W)%1.0),Hm)
    pw=(~inside)&(dt<2*W); Hm=np.where(pw&~walls,bead((dt/W)%1.0),Hm)
    Hm=Hm+np.where(inside,-1.6,0.0)                      # the recess sits 1 mm down (scaled for normals)
    return Hm,(inside,dt)

def normals(Hm,strength):
    Hs=cv2.GaussianBlur(Hm.astype(np.float32),(0,0),0.6)
    dx=cv2.Sobel(Hs,cv2.CV_32F,1,0,ksize=3)/8; dy=cv2.Sobel(Hs,cv2.CV_32F,0,1,ksize=3)/8
    n=np.stack([-dx*strength,dy*strength,np.ones_like(dx)],-1); return n/np.linalg.norm(n,axis=-1,keepdims=True)

def albedo(look,N,seed):
    """look: 'w','r','y','b' (side faces) or 'rw' (top) / 'by' (bottom). Returns BGR albedo, height, normals."""
    if len(look)==1:
        Hm,_=height('side',N,seed); base=np.zeros((N,N,3),np.float32)+np.array(FIL[look],np.float32)
        g=grain(look,N,seed); amt=0.9 if look=='w' else 0.55
        col=base+g*amt
        col*=(0.88+0.16*Hm)[...,None]
    else:
        dark,light=('r','w') if look=='rw' else ('b','y')
        Hm,(inside,dt)=height('top' if look=='rw' else 'bottom',N,seed)
        base=np.where(inside[...,None],np.array(FIL[light],np.float32),np.array(FIL[dark],np.float32))
        g=np.where(inside[...,None],grain(light,N,seed)*(0.9 if light=='w' else 0.55),grain(dark,N,seed+1)*0.55)
        col=base+g
        bh=np.clip(Hm+np.where(inside,1.6,0),0,1)
        col*=(0.88+0.16*bh)[...,None]
        ao=np.where(inside,1-0.30*np.exp(-dt/0.5),1.0)     # recess floor darkens near its walls
        col*=ao[...,None]
    x,y=coords(N); dedge=np.minimum(h-np.abs(x),h-np.abs(y))
    col*=(1-0.18*np.exp(-dedge/0.25))[...,None]            # worn/rounded outer edge
    nrm=normals(Hm,2.4 if len(look)==1 else 2.0)
    return np.clip(col,0,255).astype(np.uint8),Hm,nrm

def lit(col,nrm,Hm=None,look=None,light=(-0.45,0.55,0.70)):
    """Bake fixed top-left lighting for flat 2D use."""
    L=np.array(light,np.float32); L/=np.linalg.norm(L)
    diff=np.clip((nrm*L).sum(-1),0,1)
    Hh=L+np.array([0,0,1],np.float32); Hh/=np.linalg.norm(Hh)
    spec=np.clip((nrm*Hh).sum(-1),0,1)**40
    out=col.astype(np.float32)*(0.58+0.48*diff)[...,None]+255*0.10*spec[...,None]
    if look and len(look)==2:                              # recess wall shadow, cast away from the light
        N=col.shape[0]; x,y=coords(N); inside,_=recess(x,y)
        shift=1.0*np.array([L[0],L[1]])/np.hypot(L[0],L[1])  # 1 mm toward the light (wall height 1 mm, ~45° light)
        inside2,_=recess(x+shift[0],y+shift[1])
        sh=(inside&~inside2).astype(np.float32); sh=cv2.GaussianBlur(sh,(0,0),N/S*0.25)
        out*=(1-0.35*sh)[...,None]
    return np.clip(out,0,255).astype(np.uint8)

def rounded_alpha(N,r_mm=0.7):
    x,y=coords(N); px=N/S; r=r_mm
    dx=np.maximum(np.abs(x)-(h-r),0); dy=np.maximum(np.abs(y)-(h-r),0)
    d=np.hypot(dx,dy)-r
    return np.clip(0.5-d*px,0,1)

def lit_rotated(col,Hm,look,k,light=(-0.45,0.55,0.70)):
    """Turn the face k quarter-turns clockwise, then light it from a fixed top-left direction."""
    N=col.shape[0]
    c=np.ascontiguousarray(np.rot90(col,-k)); H=np.ascontiguousarray(np.rot90(Hm,-k))
    n=normals(H,2.4 if len(look)==1 else 2.0)
    L=np.array(light,np.float32); L/=np.linalg.norm(L)
    diff=np.clip((n*L).sum(-1),0,1); Hh=L+np.array([0,0,1],np.float32); Hh/=np.linalg.norm(Hh)
    spec=np.clip((n*Hh).sum(-1),0,1)**40
    out=c.astype(np.float32)*(0.58+0.48*diff)[...,None]+255*0.10*spec[...,None]
    if len(look)==2:
        x,y=coords(N); inside,_=recess(x,y); ins=np.ascontiguousarray(np.rot90(inside,-k)).astype(np.uint8)
        px=N/S; d=np.array([L[0],-L[1]])/np.hypot(L[0],L[1])*1.0*px      # 1 mm toward the light, image axes
        M=np.float32([[1,0,-d[0]],[0,1,-d[1]]])
        lit_src=cv2.warpAffine(ins,M,(N,N),flags=cv2.INTER_NEAREST,borderValue=0)   # inside-ness of the point toward the light
        sh=((ins==1)&(lit_src==0)).astype(np.float32); sh=cv2.GaussianBlur(sh,(0,0),px*0.25)
        out*=(1-0.35*sh)[...,None]
    return np.clip(out,0,255).astype(np.uint8)
