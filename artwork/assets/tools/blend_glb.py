import json, struct, numpy as np, cv2, os, random
os.environ.setdefault('CC_WORK','/home/claude/printed/work')
import cube3d as C, blend as B

def write_glb_n(path, atlas_img, normal_img, name):
    pos,nor,uv,idx=C.MESH; idx=idx.astype(np.uint16)
    jpg=cv2.imencode('.jpg',atlas_img,[cv2.IMWRITE_JPEG_QUALITY,88])[1].tobytes()
    njpg=cv2.imencode('.jpg',normal_img,[cv2.IMWRITE_JPEG_QUALITY,92])[1].tobytes()
    pad=lambda b,ch=b'\0': b+ch*((4-len(b)%4)%4)
    chunks=[pos.tobytes(),nor.tobytes(),uv.tobytes(),idx.tobytes(),jpg,njpg]; offs=[]; blob=b''
    for c in chunks: offs.append(len(blob)); blob+=pad(c)
    bv=[]
    for i in range(6):
        v={"buffer":0,"byteOffset":offs[i],"byteLength":len(chunks[i])}
        if i<3: v["target"]=34962
        elif i==3: v["target"]=34963
        bv.append(v)
    g={"asset":{"version":"2.0","generator":"Design with Color Cubes","copyright":"Printed-cube scans blended with sliced layer lines (Isaac Lloyd)"},
     "scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0,"name":name}],
     "meshes":[{"name":name,"primitives":[{"attributes":{"POSITION":0,"NORMAL":1,"TEXCOORD_0":2},"indices":3,"material":0}]}],
     "materials":[{"name":"PrintedPLA","pbrMetallicRoughness":{"baseColorTexture":{"index":0},"metallicFactor":0.0,"roughnessFactor":0.55},
                   "normalTexture":{"index":1,"scale":1.0}}],
     "textures":[{"source":0,"sampler":0},{"source":1,"sampler":0}],
     "samplers":[{"magFilter":9729,"minFilter":9987,"wrapS":33071,"wrapT":33071}],
     "images":[{"bufferView":4,"mimeType":"image/jpeg"},{"bufferView":5,"mimeType":"image/jpeg"}],
     "buffers":[{"byteLength":len(blob)}],"bufferViews":bv,
     "accessors":[{"bufferView":0,"componentType":5126,"count":len(pos),"type":"VEC3","min":pos.min(0).tolist(),"max":pos.max(0).tolist()},
       {"bufferView":1,"componentType":5126,"count":len(nor),"type":"VEC3"},
       {"bufferView":2,"componentType":5126,"count":len(uv),"type":"VEC2"},
       {"bufferView":3,"componentType":5123,"count":len(idx),"type":"SCALAR"}]}
    js=pad(json.dumps(g,separators=(',',':')).encode(),b' ')
    open(path,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(blob),0x004E4942)+blob)

R='/home/claude/assets/color-cubes-assets/model'
A=np.load('/home/claude/faces/work/blend_atlas.npy'); NA=np.load('/home/claude/faces/work/blend_normal.npy')
write_glb_n(f'{R}/color-cube-printed-layers.glb',A,NA,'ColorCubePrintedLayers')
# OBJ + MTL with normal map
C.write_obj(f'{R}/color-cube-printed-layers.obj','PrintedLayers','textures-printed-layers/atlas.jpg')
with open(f'{R}/color-cube-printed-layers.mtl','a') as f: f.write('norm textures-printed-layers/atlas-normal.png\nmap_Bump textures-printed-layers/atlas-normal.png\n')
# render variants (different scan samples, same layer lines)
rng=random.Random(11)
Hs=B.side_height(); Ht=B.cap_height(True); Hb=B.cap_height(False)
H={'north':Hs,'east':Hs,'south':Hs,'west':Hs,'top':Ht,'bottom':Hb}
C.TEX=B.N
nrm=C.atlas({k:B.normal_map(H[k],2.2 if k in ('top','bottom') else 2.6) for k in H})
for i in range(6):
    C.TEX=512; sf=C.scan_faces(rng); C.TEX=B.N
    sf={k:cv2.resize(v,(B.N,B.N),interpolation=cv2.INTER_CUBIC) for k,v in sf.items()}
    col=C.atlas({k:B.shade(sf[k],H[k]) for k in sf})
    write_glb_n(f'/home/claude/r3d/layers-{i}.glb',cv2.resize(col,(1536,1024),interpolation=cv2.INTER_AREA),cv2.resize(nrm,(1536,1024),interpolation=cv2.INTER_AREA),'ColorCubePrintedLayers')
print('ok', os.path.getsize(f'{R}/color-cube-printed-layers.glb'))
