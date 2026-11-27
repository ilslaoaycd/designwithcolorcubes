# Embossed Color Cube geometry + texture atlases -> GLB / OBJ
import json, struct, random, os
import numpy as np, cv2
S=0.0275; h=S/2; BORDER=0.0017; DEPTH=0.001; TEX=512
bf=BORDER/S   # rim as a fraction of the face
WORK=os.environ.get('CC_WORK','/home/claude/faces/work')
meta=json.load(open(f'{WORK}/meta.json'))
GOOD={k:[t['name'] for t in meta if t['kind']==k and t['group']!='heap'] for k in
      ['solid-white','solid-red','solid-yellow','solid-blue','diag-red-white','diag-blue-yellow']}
for k in GOOD:
    if len(GOOD[k])<2: GOOD[k]+= [t['name'] for t in meta if t['kind']==k and t['group']=='heap']
def best(kind): return max((t for t in meta if t['name'] in GOOD[kind]),key=lambda t:t['alpha_cov'])['name']

def load_face(name):
    rgba=cv2.imread(f'{WORK}/norm/{name}.png',cv2.IMREAD_UNCHANGED)
    rgb=rgba[:,:,:3].copy(); hole=(rgba[:,:,3]<128).astype(np.uint8)*255
    hole=cv2.dilate(hole,np.ones((3,3),np.uint8),iterations=2)
    rgb=cv2.inpaint(rgb,hole,5,cv2.INPAINT_TELEA)
    return cv2.resize(rgb,(TEX,TEX),interpolation=cv2.INTER_CUBIC)

def fix_diag(img):
    """Canonical diag (dark NW). Rebuild the face from clean samples so the colours line up exactly with the
    geometry: dark paint everywhere except the recessed light triangle (inset 1.7 mm from the E and S edges)."""
    n=TEX
    yy,xx=np.mgrid[0:n,0:n]
    def tiled(x0,x1):
        patch=img[int(x0*n):int(x1*n),int(x0*n):int(x1*n)]
        blk=np.vstack([np.hstack([patch,patch[:,::-1]]),np.hstack([patch[::-1],patch[::-1,::-1]])])
        reps=n//blk.shape[0]+1; return np.tile(blk,(reps,reps,1))[:n,:n]
    dark=tiled(0.06,0.42)    # clean dark paint, well away from the diagonal
    light=tiled(0.56,0.90)   # clean light paint, inside the recess
    b=bf*n
    mask=np.zeros((n*4,n*4),np.uint8)
    tri=(np.array([[n-b,b],[n-b,n-b],[b,n-b]])*4).astype(np.int32)
    cv2.fillPoly(mask,[tri],255); mask=cv2.resize(mask,(n,n),interpolation=cv2.INTER_AREA).astype(np.float32)[...,None]/255
    return (light*mask+dark*(1-mask)).astype(np.uint8)

def scan_faces(rng=None):
    pick=(lambda k: rng.choice(GOOD[k])) if rng else best
    f={'north':load_face(pick('solid-red')),'east':load_face(pick('solid-yellow')),
       'south':load_face(pick('solid-white')),'west':load_face(pick('solid-blue')),
       'top':fix_diag(load_face(pick('diag-red-white'))),'bottom':fix_diag(load_face(pick('diag-blue-yellow')))}
    if rng:
        for k in ['north','east','south','west']: f[k]=np.ascontiguousarray(np.rot90(f[k],rng.randrange(4)))
    return f

def flat_faces():
    C={'w':(216,236,244),'r':(45,39,192),'y':(60,178,227),'b':(90,42,30)}  # BGR of F4ECD8,C0272D,E3B23C,1E2A5A
    def solid(c): return np.full((TEX,TEX,3),C[c],np.uint8)
    def diag(dark,light):
        im=solid(dark); n=TEX; b=bf*n
        tri=np.array([[n-b,b],[n-b,n-b],[b,n-b]],np.int32); cv2.fillPoly(im,[tri],C[light],lineType=cv2.LINE_AA); return im
    return {'north':solid('r'),'east':solid('y'),'south':solid('w'),'west':solid('b'),'top':diag('r','w'),'bottom':diag('b','y')}

LAYOUT={'top':(0,0),'bottom':(1,0),'north':(2,0),'east':(0,1),'south':(1,1),'west':(2,1)}
def atlas(faces):
    a=np.zeros((TEX*2,TEX*3,3),np.uint8)
    for k,(cx,cy) in LAYOUT.items(): a[cy*TEX:(cy+1)*TEX,cx*TEX:(cx+1)*TEX]=faces[k]
    return a

# face frames: normal n, origin o (s=0,t=0 corner), axis U (s direction), V (t direction)
FR={
 'top':   ((0,1,0),  (-h, h,-h),(1,0,0),(0,0,1)),
 'bottom':((0,-1,0), (-h,-h,-h),(1,0,0),(0,0,1)),
 'north': ((0,0,-1), ( h, h,-h),(-1,0,0),(0,-1,0)),
 'east':  ((1,0,0),  ( h, h, h),(0,0,-1),(0,-1,0)),
 'south': ((0,0,1),  (-h, h, h),(1,0,0),(0,-1,0)),
 'west':  ((-1,0,0), (-h, h,-h),(0,0,1),(0,-1,0)),
}
def build_mesh():
    P=[];N=[];UV=[];I=[]
    def uvmap(face,s,t):
        cx,cy=LAYOUT[face]; e=1.5/TEX
        return ((cx+e+s*(1-2*e))/3,(cy+e+t*(1-2*e))/2)
    def poly(face,pts,normal,uvs):
        base=len(P)
        for p,u in zip(pts,uvs): P.append(p); N.append(normal); UV.append(u)
        p0,p1,p2=[np.array(x) for x in pts[:3]]
        for k in range(1,len(pts)-1):
            a,b,c=0,k,k+1
            pa,pb,pc=np.array(pts[a]),np.array(pts[b]),np.array(pts[c])
            if np.dot(np.cross(pb-pa,pc-pa),normal)<0: b,c=c,b
            I.extend([base+a,base+b,base+c])
    for face,(n,o,U,V) in FR.items():
        n=np.array(n,float);o=np.array(o,float);U=np.array(U,float);V=np.array(V,float)
        pt=lambda s,t,d=0: tuple(o+U*s*S+V*t*S-n*d)
        if face not in ('top','bottom'):
            st=[(0,0),(1,0),(1,1),(0,1)]
            poly(face,[pt(s,t) for s,t in st],tuple(n),[uvmap(face,s,t) for s,t in st]); continue
        b=bf; dep=DEPTH
        # raised: NW triangle, east rim quad, south rim quad
        for region in ([(0,0),(1,0),(0,1)], [(1,0),(1,1),(1-b,1-b),(1-b,b)], [(1,1),(0,1),(b,1-b),(1-b,1-b)]):
            poly(face,[pt(s,t) for s,t in region],tuple(n),[uvmap(face,s,t) for s,t in region])
        # recess floor
        tri=[(1-b,b),(1-b,1-b),(b,1-b)]
        poly(face,[pt(s,t,dep) for s,t in tri],tuple(n),[uvmap(face,s,t) for s,t in tri])
        # walls (light colour: sample the floor texture just inside each edge)
        cen=np.mean(tri,axis=0)
        for i in range(3):
            a=np.array(tri[i]); c=np.array(tri[(i+1)%3])
            mid=(a+c)/2; inward=cen-mid; inward/=np.linalg.norm(inward)
            wn=np.cross(V*0+(U*(c-a)[0]+V*(c-a)[1]),n)  # edge direction x face normal
            wn=wn/np.linalg.norm(wn)
            if np.dot(wn,U*inward[0]+V*inward[1])<0: wn=-wn
            q=[pt(*a,0),pt(*c,0),pt(*c,dep),pt(*a,dep)]
            sh=lambda p,k: tuple(np.array(p)+inward*k)
            uvs=[uvmap(face,*sh(a,0.03)),uvmap(face,*sh(c,0.03)),uvmap(face,*sh(c,0.06)),uvmap(face,*sh(a,0.06))]
            poly(face,q,tuple(wn),uvs)
    return (np.array(P,np.float32),np.array(N,np.float32),np.array(UV,np.float32),np.array(I,np.uint32))

MESH=build_mesh()

def write_glb(path, atlas_img, name='ColorCube', copyright_note=''):
    pos,nor,uv,idx=MESH; idx=idx.astype(np.uint16)
    ok,jpg=cv2.imencode('.jpg',atlas_img,[cv2.IMWRITE_JPEG_QUALITY,92]); jpg=jpg.tobytes()
    pad=lambda b,ch=b'\0': b+ch*((4-len(b)%4)%4)
    chunks=[pos.tobytes(),nor.tobytes(),uv.tobytes(),idx.tobytes(),jpg]; offs=[]; blob=b''
    for c in chunks: offs.append(len(blob)); blob+=pad(c)
    g={"asset":{"version":"2.0","generator":"Design with Color Cubes","copyright":copyright_note},
     "scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0,"name":name}],
     "meshes":[{"name":name,"primitives":[{"attributes":{"POSITION":0,"NORMAL":1,"TEXCOORD_0":2},"indices":3,"material":0}]}],
     "materials":[{"name":"PaintedWood","pbrMetallicRoughness":{"baseColorTexture":{"index":0},"metallicFactor":0.0,"roughnessFactor":0.8}}],
     "textures":[{"source":0,"sampler":0}],"samplers":[{"magFilter":9729,"minFilter":9987,"wrapS":33071,"wrapT":33071}],
     "images":[{"bufferView":4,"mimeType":"image/jpeg"}],"buffers":[{"byteLength":len(blob)}],
     "bufferViews":[{"buffer":0,"byteOffset":offs[i],"byteLength":len(chunks[i]),**({"target":34962} if i<3 else {"target":34963} if i==3 else {})} for i in range(5)],
     "accessors":[{"bufferView":0,"componentType":5126,"count":len(pos),"type":"VEC3","min":pos.min(0).tolist(),"max":pos.max(0).tolist()},
       {"bufferView":1,"componentType":5126,"count":len(nor),"type":"VEC3"},
       {"bufferView":2,"componentType":5126,"count":len(uv),"type":"VEC2"},
       {"bufferView":3,"componentType":5123,"count":len(idx),"type":"SCALAR"}]}
    js=pad(json.dumps(g,separators=(',',':')).encode(),b' ')
    open(path,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(blob),0x004E4942)+blob)

def write_obj(path, mtl_name, tex_rel):
    pos,nor,uv,idx=MESH
    with open(path,'w') as o:
        o.write(f'# Color Cube, 27.5 mm. +Y up, -Z north. Units: metres.\n# N red, E yellow, S white, W blue. Top red/white (red NW, white recessed 1 mm SE). Bottom blue/yellow (blue NW, yellow recessed 1 mm SE).\nmtllib {os.path.basename(path)[:-4]}.mtl\no ColorCube\n')
        for p in pos: o.write(f'v {p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n')
        for t in uv: o.write(f'vt {t[0]:.6f} {1-t[1]:.6f}\n')
        for n in nor: o.write(f'vn {n[0]:.4f} {n[1]:.4f} {n[2]:.4f}\n')
        o.write(f'usemtl {mtl_name}\n')
        for i in range(0,len(idx),3):
            a,b,c=idx[i:i+3]+1; o.write(f'f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}\n')
    open(path[:-4]+'.mtl','w').write(f'newmtl {mtl_name}\nKa 1 1 1\nKd 1 1 1\nKs 0.05 0.05 0.05\nNs 10\nmap_Kd {tex_rel}\n')

def build_printed():
    R='/home/claude/assets/color-cubes-assets/model'; os.makedirs(R+'/textures-printed',exist_ok=True)
    sf=scan_faces(); A=atlas(sf)
    for k,v in sf.items(): cv2.imwrite(f'{R}/textures-printed/{k}.png',v)
    cv2.imwrite(f'{R}/textures-printed/atlas.png',A)
    write_glb(f'{R}/color-cube-printed.glb',A,name='ColorCubePrinted',copyright_note='Textures from scans of 3D-printed Color Cubes (Isaac Lloyd)')
    write_obj(f'{R}/color-cube-printed.obj','PrintedPLA','textures-printed/atlas.png')
    os.makedirs('/home/claude/r3d',exist_ok=True); rng=random.Random(8)
    for i in range(10): write_glb(f'/home/claude/r3d/printed-{i}.glb',atlas(scan_faces(rng)))
    print('printed model built')

if __name__=='__main__' and os.environ.get('CC_PRINTED'):
    build_printed()
elif __name__=='__main__':
    R='/home/claude/assets/color-cubes-assets/model'
    import shutil; shutil.rmtree(R,ignore_errors=True); os.makedirs(R+'/textures-scan'); os.makedirs(R+'/textures-flat')
    note='Textures from scans of an original Embossing Company Color Cubes set (Isaac Lloyd)'
    sf=scan_faces(); A=atlas(sf)
    for k,v in sf.items(): cv2.imwrite(f'{R}/textures-scan/{k}.png',v)
    cv2.imwrite(f'{R}/textures-scan/atlas.png',A)
    write_glb(f'{R}/color-cube.glb',A,copyright_note=note); write_obj(f'{R}/color-cube.obj','PaintedWoodScan','textures-scan/atlas.png')
    ff=flat_faces(); FA=atlas(ff)
    for k,v in ff.items(): cv2.imwrite(f'{R}/textures-flat/{k}.png',v)
    cv2.imwrite(f'{R}/textures-flat/atlas.png',FA)
    write_glb(f'{R}/color-cube-flat.glb',FA,name='ColorCubeFlat'); write_obj(f'{R}/color-cube-flat.obj','PaintedFlat','textures-flat/atlas.png')
    os.makedirs('/home/claude/faces/work/variants',exist_ok=True)
    rng=random.Random(7)
    for i in range(10): write_glb(f'/home/claude/faces/work/variants/scan-{i}.glb',atlas(scan_faces(rng)),copyright_note=note)
    print('verts',len(MESH[0]),'tris',len(MESH[3])//3, 'bounds',MESH[0].min(0),MESH[0].max(0))
