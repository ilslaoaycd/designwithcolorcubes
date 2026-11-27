import json, math, random, sys, base64, asyncio, os
sys.path.insert(0,'/home/claude/faces')
from lib import corners, overlap, parse
from patterns import P
S=0.0275
def rd(rng):
    k=rng.randrange(6); return k if k<4 else (4 if k==4 else 8)+rng.randrange(4)
def cube(d,x,z,yaw,rng,y=None,**kw):
    c=dict(d=d,x=x,z=z,yaw=yaw,v=rng.randrange(10),spin=rng.randrange(4)); 
    if y is not None: c['y']=y
    c.update(kw); return c
def free(x,z,yaw,placed,margin=0.0006):
    C=corners(x,z,S,yaw)
    return not any(overlap(C,corners(p['x'],p['z'],S,p['yaw']),margin=margin) for p in placed if p.get('y') is None)
def camera(az_deg, el_deg, dist, target=(0,0,0)):
    a=math.radians(az_deg); e=math.radians(el_deg)
    return [target[0]+dist*math.cos(e)*math.sin(a), target[1]+dist*math.sin(e), target[2]+dist*math.cos(e)*math.cos(a)]

SC={}
# 1. horizontal spill, low camera
rng=random.Random(51); cs=[]; tries=0
while len(cs)<30 and tries<20000:
    tries+=1; x=rng.uniform(-0.3,0.3); z=rng.gauss(0,0.022); yaw=rng.uniform(0,360)
    if abs(z)>0.05 or not free(x,z,yaw,cs,0.004): continue
    cs.append(cube(rd(rng),x,z,yaw,rng))
SC['spill-horizontal-3d']=dict(w=2600,h=700,cam=camera(0,16,0.95,(0,0,0)),target=[0,0.008,0],fov=26,cubes=cs)
# 2. horizontal spill seen from higher up
rng=random.Random(52); cs=[]; tries=0
while len(cs)<28 and tries<20000:
    tries+=1; x=rng.uniform(-0.31,0.31); z=rng.gauss(0,0.018); yaw=rng.uniform(0,360)
    if abs(z)>0.045 or not free(x,z,yaw,cs,0.004): continue
    cs.append(cube(rd(rng),x,z,yaw,rng))
SC['spill-horizontal-3d-high']=dict(w=2600,h=560,cam=camera(0,62,1.0),fov=26,cubes=cs)
# 3. floor dump, 49 cubes, contact chains and a few stacked
rng=random.Random(53); cs=[]; tries=0
while len(cs)<45 and tries<60000:
    tries+=1
    if cs and rng.random()<0.58:
        p=rng.choice(cs); side=rng.randrange(4); a=math.radians(p['yaw']+90*side)
        d=S*(1.0+rng.uniform(0.02,0.12)); lat=rng.uniform(-0.35,0.35)*S
        x=p['x']+math.cos(a)*d-math.sin(a)*lat; z=p['z']+math.sin(a)*d+math.cos(a)*lat; yaw=p['yaw']+rng.gauss(0,7)
    else:
        sg=S*(2.2 if rng.random()>0.1 else 3.6); x=rng.gauss(0,sg*1.2); z=rng.gauss(0,sg*0.9); yaw=rng.uniform(0,360)
    if math.hypot(x,z)>0.15 or not free(x,z,yaw,cs): continue
    cs.append(cube(rd(rng),x,z,yaw,rng))
for p in rng.sample(cs,4):   # a few resting on top of others
    cs.append(cube(rd(rng),p['x']+rng.uniform(-0.004,0.004),p['z']+rng.uniform(-0.004,0.004),p['yaw']+rng.uniform(-25,25),rng,y=S*1.5))
SC['dump-49-cubes-3d']=dict(w=2000,h=1400,cam=camera(-25,48,0.62),fov=30,cubes=cs)
# helper for tray patterns
def tray(code,rng,gap=0.0006,jit=True):
    g=parse(code); n=len(g); m=len(g[0]); pitch=S+gap; out=[]
    for r in range(n):
        for c in range(m):
            out.append(cube(g[r][c],(c-(m-1)/2)*pitch+(rng.uniform(-0.0004,0.0004) if jit else 0),(r-(n-1)/2)*pitch+(rng.uniform(-0.0004,0.0004) if jit else 0),rng.uniform(-1.2,1.2) if jit else 0,rng))
    return out
rng=random.Random(54); SC['tray-quadrants-7x7-3d']=dict(w=1800,h=1400,cam=camera(-20,52,0.5),fov=30,cubes=tray(P['quadrants-7x7'],rng))
rng=random.Random(55); SC['tray-concentric-diamond-9x9-3d']=dict(w=2000,h=1300,cam=camera(15,34,0.62),fov=30,cubes=tray(P['concentric-diamond-9x9'],rng))
rng=random.Random(56); SC['tray-pinwheels-6x6-3d']=dict(w=1600,h=1300,cam=camera(-35,58,0.42),fov=30,cubes=tray(P['pinwheels-6x6'],rng))
# pyramid stack 4x4 / 3x3 / 2x2 / 1
rng=random.Random(57); cs=[]
for lvl,n in enumerate([4,3,2,1]):
    for r in range(n):
        for c in range(n):
            cs.append(cube(rd(rng),(c-(n-1)/2)*(S+0.0005)+rng.uniform(-0.0006,0.0006),(r-(n-1)/2)*(S+0.0005)+rng.uniform(-0.0006,0.0006),rng.uniform(-2.5,2.5),rng,y=S/2+lvl*S))
SC['pyramid-stack-3d']=dict(w=1600,h=1400,cam=camera(-32,30,0.42,(0,0.03,0)),target=[0,0.035,0],fov=30,cubes=cs)
# twelve looks in a row
rng=random.Random(58); cs=[]
for i,d in enumerate(range(12)):
    cs.append(cube(d,(i-5.5)*(S+0.012),0,0,rng,spin=0))
SC['twelve-looks-row-3d']=dict(w=2600,h=640,cam=camera(0,40,0.78),fov=28,cubes=cs)
# assembled diamond blocks
rng=random.Random(59); cs=[]
for code,ox,oz,yaw0 in [('56-87',-0.085,-0.02,-6),('34-21',0.0,0.025,4),('414-141-414',0.1,-0.01,-3)]:
    g=parse(code); n=len(g); a=math.radians(yaw0)
    for r in range(n):
        for c in range(n):
            lx=(c-(n-1)/2)*(S+0.0006); lz=(r-(n-1)/2)*(S+0.0006)
            cs.append(cube(g[r][c],ox+lx*math.cos(a)-lz*math.sin(a),oz+lx*math.sin(a)+lz*math.cos(a),yaw0+rng.uniform(-1,1),rng))
SC['diamond-blocks-3d']=dict(w=2000,h=1150,cam=camera(-10,50,0.42),fov=30,cubes=cs)

VIEW={'spill-horizontal-3d':(0,17,0.45,26),'spill-horizontal-3d-high':(0,60,0.42,26),'dump-49-cubes-3d':(-15,50,0.62,30),
 'tray-quadrants-7x7-3d':(-20,52,0.50,30),'tray-concentric-diamond-9x9-3d':(15,34,0.62,30),'tray-pinwheels-6x6-3d':(-35,55,0.56,30),
 'pyramid-stack-3d':(-32,30,0.42,30),'twelve-looks-row-3d':(0,30,0.27,28),'diamond-blocks-3d':(-10,50,0.40,30)}
for k,(az,el,dist,fov) in VIEW.items():
    cs=SC[k]['cubes']; xs=[c['x'] for c in cs]; zs=[c['z'] for c in cs]; ys=[c.get('y',S/2) for c in cs]
    t=((min(xs)+max(xs))/2,(min(ys)+max(ys))/2*0.8,(min(zs)+max(zs))/2)
    SC[k]['target']=list(t); SC[k]['cam']=camera(az,el,dist,t); SC[k]['fov']=fov
json.dump(SC,open('/home/claude/r3d/scenes3d.json','w'))
print({k:len(v['cubes']) for k,v in SC.items()})
