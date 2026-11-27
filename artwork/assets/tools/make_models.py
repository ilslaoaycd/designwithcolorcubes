import sys, os, numpy as np, cv2
sys.path.insert(0,'/home/claude/synth'); sys.path.insert(0,'/home/claude/faces')
os.environ['CC_WORK']='/home/claude/printed/work'
import printed_synth as P, cube3d as C
from blend_glb import write_glb_n
FACES={'north':'r','east':'y','south':'w','west':'b','top':'rw','bottom':'by'}
def atlas_pair(N,seed):
    C.TEX=N; col={}; nrm={}
    for k,look in FACES.items():
        c,Hm,n=P.albedo(look,N,seed+hash(k)%97)
        col[k]=c; nrm[k]=((n+1)/2*255).astype(np.uint8)[...,::-1]   # RGB normal -> BGR for cv2
    return col,nrm,C.atlas(col),C.atlas(nrm)
R='/home/claude/assets/color-cubes-assets/model'; T=R+'/textures-printed'
os.makedirs(T,exist_ok=True)
col,nrm,A,NA=atlas_pair(1024,5)
for k in col: cv2.imwrite(f'{T}/{k}.png',col[k]); cv2.imwrite(f'{T}/{k}-normal.png',nrm[k])
cv2.imwrite(f'{T}/atlas.png',A); cv2.imwrite(f'{T}/atlas-normal.png',NA)
write_glb_n(f'{R}/color-cube-printed.glb',A,NA,'ColorCubePrinted')
C.TEX=512
C.write_obj(f'{R}/color-cube-printed.obj','PrintedPLA','textures-printed/atlas.png')
with open(f'{R}/color-cube-printed.mtl','a') as f: f.write('norm textures-printed/atlas-normal.png\nmap_Bump textures-printed/atlas-normal.png\n')
for i in range(10):
    _,_,A,NA=atlas_pair(512,200+i*13)
    write_glb_n(f'/home/claude/r3d/printed-{i}.glb',A,NA,'ColorCubePrinted')
print('ok',os.path.getsize(f'{R}/color-cube-printed.glb'))
