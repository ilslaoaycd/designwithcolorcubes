import os, sys, pickle, random
os.environ['CC_WORK']='/home/claude/printed/work'
os.environ['CC_BG']='/mnt/user-data/uploads/9ca50857-image.jpg|20,1500,1540,2120'
os.environ['CC_2D']='2d-printed'
sys.path.insert(0,'/home/claude/faces')
from PIL import Image
import numpy as np
LIB=pickle.load(open('/home/claude/synth/lit_faces.pkl','rb'))
IM={k:Image.fromarray(np.dstack([v[:,:,2::-1][:,:,:3],v[:,:,3]]),'RGBA') for k,v in LIB.items()}
def face_for_digit(d,rng):
    if d<4: return IM[(d,rng.randrange(4),rng.randrange(4))]
    base=4 if d<8 else 8; return IM[(base,(d-4)%4,rng.randrange(4))]
import render2d
render2d.face_for_digit=face_for_digit
for i,(name,sc) in enumerate(render2d.S.items()): render2d.render_scan(name,sc,100+i)
print('done',len(render2d.S))
