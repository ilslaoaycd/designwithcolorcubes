import sys, os, numpy as np, cv2, pickle
sys.path.insert(0,'/home/claude/synth'); import printed_synth as P
N=300; VARIANTS=4
LOOKS={0:'w',1:'r',2:'y',3:'b',4:'by',8:'rw'}
lib={}
for base,look in LOOKS.items():
    for v in range(VARIANTS):
        col,Hm,_=P.albedo(look,N,100+v*7+base)
        for k in range(4):
            im=P.lit_rotated(col,Hm,look,k)
            a=(P.rounded_alpha(N)*255).astype(np.uint8)
            rgba=np.dstack([im,a])
            lib[(base,k,v)]=rgba
pickle.dump(lib,open('/home/claude/synth/lit_faces.pkl','wb'))
print(len(lib))
