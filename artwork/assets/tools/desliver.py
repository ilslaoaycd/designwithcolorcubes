import cv2, numpy as np, json
meta=json.load(open('work/meta.json'))
def lab(a): return cv2.cvtColor(a.reshape(1,-1,3).astype(np.uint8),cv2.COLOR_BGR2LAB).reshape(-1,3).astype(float)
fixed=0
for t in meta:
    p=f"work/norm/{t['name']}.png"; im=cv2.imread(p,cv2.IMREAD_UNCHANGED); n=im.shape[0]
    for it in range(3):
        rgb=im[:,:,:3]; s=max(3,int(n*0.025)); s2=int(n*0.09)
        sides={'top':(rgb[:s,s2:-s2],rgb[s:s2,s2:-s2]),'bottom':(rgb[-s:,s2:-s2],rgb[-s2:-s,s2:-s2]),
               'left':(rgb[s2:-s2,:s],rgb[s2:-s2,s:s2]),'right':(rgb[s2:-s2,-s:],rgb[s2:-s2,-s2:-s])}
        bad=[]
        for k,(edge,inner) in sides.items():
            e=np.median(lab(edge),0); i=np.median(lab(inner),0)
            if np.linalg.norm(e-i)>38: bad.append(k)
        if not bad: break
        c=int(n*0.035); y0,y1,x0,x1=0,n,0,n
        if 'top' in bad: y0=c
        if 'bottom' in bad: y1=n-c
        if 'left' in bad: x0=c
        if 'right' in bad: x1=n-c
        im=cv2.resize(im[y0:y1,x0:x1],(n,n),interpolation=cv2.INTER_CUBIC); fixed+=1
    cv2.imwrite(p,im)
print('trims',fixed)
