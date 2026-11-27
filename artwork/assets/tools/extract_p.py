import cv2, numpy as np, json
files={'p12':'9ca50857','p13':'3cb846cd','p14':'76a4df38'}
OUT=240
def order(pts):
    c=pts.mean(0); a=np.arctan2(pts[:,1]-c[1],pts[:,0]-c[0]); p=pts[np.argsort(a)]
    i=np.argmin(p.sum(1)); return np.roll(p,-i,axis=0).astype(np.float32)
def warp(im,q):
    M=cv2.getPerspectiveTransform(order(q),np.array([[0,0],[OUT,0],[OUT,OUT],[0,OUT]],np.float32))
    return cv2.warpPerspective(im,M,(OUT,OUT),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
def mask_of(im):
    mx=im.max(2).astype(int); mn=im.min(2).astype(int)
    m=(((mx-mn)>45)|(mn>195)).astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8)); m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    f=np.zeros_like(m); cv2.drawContours(f,[c for c in cs if cv2.contourArea(c)>3000],-1,255,-1); return f
if __name__=='__main__':
    sizes=[]
    for k,f in files.items():
        im=cv2.imread(f'/mnt/user-data/uploads/{f}-image.jpg')[:2150]
        cs,_=cv2.findContours(mask_of(im),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        for c in cs:
            A=cv2.contourArea(c)
            if A<20000: continue
            (cx,cy),(w,h),a=cv2.minAreaRect(c)
            if 0.93<w/h<1.07 and A/(w*h)>0.93 and w<260: sizes.append((w+h)/2)
    print('single tile size median',np.median(sizes),len(sizes))

def run():
    S=197.4; meta=[]
    for k,f in files.items():
        im=cv2.imread(f'/mnt/user-data/uploads/{f}-image.jpg')[:2150]
        loose=mask_of(im); vis=im.copy(); n=0; taken=np.zeros(loose.shape,np.uint8)
        cs,_=cv2.findContours(loose,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        irregular=[]
        for c in cs:
            A=cv2.contourArea(c)
            if A<20000: continue
            x,y,bw,bh=cv2.boundingRect(c)
            edge=x<=2 or y<=2 or x+bw>=im.shape[1]-2 or y+bh>=im.shape[0]-2
            rect=cv2.minAreaRect(c); (cx,cy),(w,h),ang=rect
            nw,nh=max(1,round(w/S)),max(1,round(h/S)); fill=A/(w*h)
            ok=fill>0.9 and abs(w/nw-S)<14 and abs(h/nh-S)<14
            if not ok or (edge and nw*nh==1):
                irregular.append(c)
                continue
            p=order(cv2.boxPoints(rect))
            cols=max(1,round(np.linalg.norm(p[1]-p[0])/S)); rows=max(1,round(np.linalg.norm(p[3]-p[0])/S))
            def P(u,v):
                top=p[0]+(p[1]-p[0])*u; bot=p[3]+(p[2]-p[3])*u; return top+(bot-top)*v
            for i in range(rows):
                for j in range(cols):
                    q=np.array([P(j/cols,i/rows),P((j+1)/cols,i/rows),P((j+1)/cols,(i+1)/rows),P(j/cols,(i+1)/rows)],np.float32)
                    cq=q.mean(0); q=(cq+(q-cq)*0.965).astype(np.float32)   # trim neighbour slivers in grids
                    name=f'{k}_{n:02d}'; cv2.imwrite(f'work/raw/{name}.png',warp(im,q))
                    meta.append(dict(name=name,scan=k,group=f'{cols}x{rows}' if cols*rows>1 else 'single',quad=q.tolist()))
                    cv2.polylines(vis,[q.astype(int)],True,(0,255,0),3); n+=1
                    cv2.fillPoly(taken,[q.astype(np.int32)],1)
        # irregular clusters: each tile's core (inset by distance) keeps the tile's orientation; grow it back to full size
        if irregular:
            reg=np.zeros(loose.shape,np.uint8); cv2.drawContours(reg,irregular,-1,255,-1)
            reg[taken>0]=0
            dist=cv2.distanceTransform(reg,cv2.DIST_L2,5); t=S*0.30
            seeds=(dist>t).astype(np.uint8)
            nl,lab,st,cen=cv2.connectedComponentsWithStats(seeds)
            for i in range(1,nl):
                pts=np.column_stack(np.where(lab==i))[:,::-1].astype(np.float32)
                if len(pts)<200: continue
                (cx,cy),(w,h),ang=cv2.minAreaRect(pts)
                side=S-2*t
                if not (0.75*side<w<1.25*side and 0.75*side<h<1.25*side and len(pts)/(w*h)>0.85): continue
                q=order(cv2.boxPoints(((cx,cy),(S,S),ang)))
                if q.min()<1 or q[:,0].max()>im.shape[1]-2 or q[:,1].max()>im.shape[0]-2: continue
                poly=np.zeros(loose.shape,np.uint8); cv2.fillPoly(poly,[q.astype(np.int32)],1)
                cov=(loose[poly>0]>0).mean()
                if cov<0.96: continue
                name=f'{k}_{n:02d}'; cv2.imwrite(f'work/raw/{name}.png',warp(im,q))
                meta.append(dict(name=name,scan=k,group='heap',quad=q.tolist())); cv2.polylines(vis,[q.astype(int)],True,(0,200,255),3); n+=1
        cv2.imwrite(f'work/{k}_cut.jpg',cv2.resize(vis,None,fx=0.4,fy=0.4)); print(k,n)
    json.dump(meta,open('work/meta.json','w'),indent=1); print('total',len(meta))
if __name__=='__main__': run()
