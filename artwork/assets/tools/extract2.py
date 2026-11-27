import cv2, numpy as np, json
exec(open('extract.py').read().split("meta=[]")[0])  # reuse order/warp/constants
files={'s08':'36420a80','s09':'4ffd9f78','s10':'632860e3','s11':'6d2e9d8b'}
meta=json.load(open('work/meta.json'))
have={}
for t in meta: have.setdefault(t['scan'],[]).append(np.array(t['quad']).mean(0))
added=0
for k,f in files.items():
    im=cv2.imread(f'/mnt/user-data/uploads/{f}-image.jpg')[:2150]
    b,g,r=[im[:,:,i].astype(int) for i in range(3)]
    mx=im.max(2).astype(int)
    seed=((mx>110)|((b-r)>40)).astype(np.uint8)*255
    seed=cv2.morphologyEx(seed,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    seed=cv2.erode(seed,np.ones((3,3),np.uint8),iterations=6)
    loose=((mx>70)|(((b-r)>14)&(b>45))).astype(np.uint8)*255
    loose=cv2.morphologyEx(loose,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    loose=cv2.morphologyEx(loose,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
    n,lab,st,_=cv2.connectedComponentsWithStats(seed)
    markers=np.zeros(lab.shape,np.int32); idx=0
    for i in range(1,n):
        if st[i,4]>8000: idx+=1; markers[lab==i]=idx+1
    markers[loose==0]=1
    dist=cv2.distanceTransform(loose,cv2.DIST_L2,5)
    land=(255-np.clip(dist/dist.max()*255,0,255)).astype(np.uint8)
    ws=cv2.watershed(cv2.cvtColor(land,cv2.COLOR_GRAY2BGR),markers)
    cnt=len([t for t in meta if t['scan']==k])
    for t in range(2,idx+2):
        reg=(ws==t).astype(np.uint8)
        cs,_=cv2.findContours(reg,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        c=max(cs,key=cv2.contourArea); A=cv2.contourArea(c)
        rect=cv2.minAreaRect(c); (cx,cy),(w,h),ang=rect
        if not (184<=w<=212 and 184<=h<=212 and A/(w*h)>0.93): continue
        if any(np.linalg.norm(np.array([cx,cy])-p)<120 for p in have.get(k,[])): continue
        q=order(cv2.boxPoints(rect))
        name=f'{k}_{cnt:02d}'; cnt+=1
        cv2.imwrite(f'work/raw/{name}.png',warp(im,q))
        meta.append(dict(name=name,scan=k,group='heap',grid_pos=None,quad=q.tolist()))
        have.setdefault(k,[]).append(np.array([cx,cy])); added+=1
print('added',added,'total',len(meta))
json.dump(meta,open('work/meta.json','w'),indent=1)
