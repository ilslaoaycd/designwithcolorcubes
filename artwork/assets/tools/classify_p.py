import cv2, numpy as np, json
meta=json.load(open('work/meta.json'))
OUT=240
yy,xx=np.mgrid[0:OUT,0:OUT]/OUT
m=0.16
inner=(xx>m)&(xx<1-m)&(yy>m)&(yy<1-m)
d1=np.abs(xx-yy); d2=np.abs(xx+yy-1)
away=(d1>0.08)&(d2>0.08)
N=inner&away&(yy<xx)&(yy<1-xx); S=inner&away&(yy>xx)&(yy>1-xx)
W=inner&away&(xx<yy)&(xx<1-yy); E=inner&away&(xx>yy)&(xx>1-yy)
REF={'w':(248,252,252),'r':(57,44,228),'y':(101,196,235),'b':(169,93,27)}  # BGR guesses, refined below
def lab(c): return cv2.cvtColor(np.uint8([[c]]),cv2.COLOR_BGR2LAB)[0,0].astype(float)
def near(c):
    L=lab(c); return min(REF,key=lambda k: np.linalg.norm(L-lab(REF[k])))
rows=[]
for t in meta:
    im=cv2.imread(f"work/raw/{t['name']}.png")
    q={k:im[M].reshape(-1,3).mean(0) for k,M in dict(N=N,E=E,S=S,W=W).items()}
    cl={k:near(v) for k,v in q.items()}
    t['quads']=cl; t['quadcol']={k:v.round().tolist() for k,v in q.items()}
    rows.append((t['name'],''.join(cl[k] for k in 'NESW')))
from collections import Counter
print(Counter(r[1] for r in rows))
json.dump(meta,open('work/meta.json','w'),indent=1)
