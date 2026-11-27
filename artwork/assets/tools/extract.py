import cv2, numpy as np, json, os
files={'s07':'1c5420c4','s08':'36420a80','s09':'4ffd9f78','s10':'632860e3','s11':'6d2e9d8b'}
S=197  # nominal tile size in scan px
OUT=240
os.makedirs('work/raw',exist_ok=True)

def order(pts):
    # order TL,TR,BR,BL by angle around center
    c=pts.mean(0); a=np.arctan2(pts[:,1]-c[1],pts[:,0]-c[0])
    p=pts[np.argsort(a)]  # starts at ~ -pi (left), goes clockwise in image coords
    # rotate so first is the one with min x+y
    i=np.argmin(p.sum(1)); p=np.roll(p,-i,axis=0)
    return p.astype(np.float32)

def warp(im,pts,inset=0):
    p=order(pts)
    dst=np.array([[0,0],[OUT,0],[OUT,OUT],[0,OUT]],np.float32)
    M=cv2.getPerspectiveTransform(p,dst)
    return cv2.warpPerspective(im,M,(OUT,OUT),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)

meta=[]
for k,f in files.items():
    im=cv2.imread(f'/mnt/user-data/uploads/{f}-image.jpg')[:2150]
    b,g,r=[im[:,:,i].astype(int) for i in range(3)]
    mx=im.max(2).astype(int)
    loose=((mx>70)|(((b-r)>14)&(b>45))).astype(np.uint8)*255
    loose=cv2.morphologyEx(loose,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    loose=cv2.morphologyEx(loose,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
    cs,_=cv2.findContours(loose,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    vis=im.copy(); n=0
    for c in cs:
        A=cv2.contourArea(c)
        if A<20000: continue
        x,y,bw,bh=cv2.boundingRect(c)
        if x<=2 or y<=2 or x+bw>=im.shape[1]-2 or y+bh>=im.shape[0]-2: continue  # clipped by scan edge
        (cx,cy),(w,h),ang=rect=cv2.minAreaRect(c)
        fill=A/(w*h)
        nw,nh=max(1,round(w/S)),max(1,round(h/S))
        if fill<0.9 or abs(w/nw-S)>14 or abs(h/nh-S)>14: continue   # irregular heap: skip
        box=cv2.boxPoints(rect)  # 4 corners
        p=order(box)
        # bilinear grid subdivision
        for i in range(nh):
            for j in range(nw):
                def P(u,v):
                    top=p[0]+(p[1]-p[0])*u; bot=p[3]+(p[2]-p[3])*u
                    return top+(bot-top)*v
                # which side is w vs h after ordering: compute along p0->p1 length
                L01=np.linalg.norm(p[1]-p[0]); L03=np.linalg.norm(p[3]-p[0])
                cols=round(L01/S); rows=round(L03/S)
                break
            break
        cols=max(1,cols); rows=max(1,rows)
        for i in range(rows):
            for j in range(cols):
                def P(u,v):
                    top=p[0]+(p[1]-p[0])*u; bot=p[3]+(p[2]-p[3])*u
                    return top+(bot-top)*v
                q=np.array([P(j/cols,i/rows),P((j+1)/cols,i/rows),P((j+1)/cols,(i+1)/rows),P(j/cols,(i+1)/rows)],np.float32)
                tile=warp(im,q)
                name=f'{k}_{n:02d}'
                cv2.imwrite(f'work/raw/{name}.png',tile)
                meta.append(dict(name=name,scan=k,group=f'{cols}x{rows}' if cols*rows>1 else 'single',grid_pos=[i,j],quad=q.tolist()))
                cv2.polylines(vis,[q.astype(int)],True,(0,255,0),3)
                cv2.putText(vis,str(n),tuple(q.mean(0).astype(int)-[15,-10]),cv2.FONT_HERSHEY_SIMPLEX,1.2,(0,255,0),3)
                n+=1
    cv2.imwrite(f'work/{k}_cut.jpg',cv2.resize(vis,None,fx=0.4,fy=0.4))
    print(k,n)
json.dump(meta,open('work/meta.json','w'),indent=1)
print('total',len(meta))
