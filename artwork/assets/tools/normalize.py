import cv2, numpy as np, json, os
meta=json.load(open('work/meta.json'))
os.makedirs('work/norm',exist_ok=True)
CORNER={'NW':0,'NE':1,'SE':2,'SW':3}
def kind(q):
    s=''.join(q[k] for k in 'NESW')
    if s=='ywww': s='wwww'
    if len(set(s))==1: return 'solid-'+{'w':'white','r':'red','y':'yellow','b':'blue'}[s[0]],None
    dark='r' if 'r' in s else 'b'
    pair='red-white' if dark=='r' else 'blue-yellow'
    n,e,so,w=[c==dark for c in s]
    corner = 0 if (n and w) else 1 if (n and e) else 2 if (e and so) else 3
    return 'diag-'+pair,corner
for t in meta:
    k,c=kind(t['quads']); t['kind']=k; t['corner_in_scan']=c
    im=cv2.imread(f"work/raw/{t['name']}.png")
    if c: im=np.ascontiguousarray(np.rot90(im,k=c))
    b,g,r=[im[:,:,i].astype(int) for i in range(3)]
    mx=im.max(2).astype(int)
    a=((mx>62)|(((b-r)>12)&(b>42))).astype(np.uint8)*255
    a=cv2.morphologyEx(a,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
    # keep largest component, fill holes
    cs,_=cv2.findContours(a,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    a=np.zeros_like(a); cv2.drawContours(a,[max(cs,key=cv2.contourArea)],-1,255,-1)
    a=cv2.GaussianBlur(a,(3,3),0)
    t['alpha_cov']=float((a>128).mean())
    rgba=cv2.cvtColor(im,cv2.COLOR_BGR2BGRA); rgba[:,:,3]=a
    cv2.imwrite(f"work/norm/{t['name']}.png",rgba)
json.dump(meta,open('work/meta.json','w'),indent=1)
# contact sheet
order=sorted(meta,key=lambda t:(t['kind'],t['name']))
cols=10; cell=150
rows=(len(order)+cols-1)//cols
sheet=np.full((rows*(cell+26),cols*cell,3),40,np.uint8)
for i,t in enumerate(order):
    im=cv2.imread(f"work/norm/{t['name']}.png",cv2.IMREAD_UNCHANGED)
    im=cv2.resize(im,(cell-10,cell-10))
    a=im[:,:,3:]/255.0; rgb=(im[:,:,:3]*a+40*(1-a)).astype(np.uint8)
    y=(i//cols)*(cell+26); x=(i%cols)*cell
    sheet[y+5:y+cell-5,x+5:x+cell-5]=rgb
    cv2.putText(sheet,t['name'],(x+5,y+cell+8),cv2.FONT_HERSHEY_SIMPLEX,0.45,(255,255,255),1)
    cv2.putText(sheet,t['kind'].replace('diag-','d-').replace('solid-','s-')[:12],(x+5,y+cell+22),cv2.FONT_HERSHEY_SIMPLEX,0.4,(180,220,255),1)
cv2.imwrite('work/sheet.jpg',sheet)
from collections import Counter; print(Counter(t['kind'] for t in meta)); print(min(t['alpha_cov'] for t in meta))
