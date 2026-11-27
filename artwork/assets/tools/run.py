import asyncio, json, base64, sys, os
from playwright.async_api import async_playwright
ROOT='/home/claude/r3d'; OUT='/home/claude/assets/color-cubes-assets'
SC=json.load(open(f'{ROOT}/scenes3d.json'))
only=sys.argv[1].split(',') if len(sys.argv)>1 and sys.argv[1] else None
styles=sys.argv[2].split(',') if len(sys.argv)>2 else ['scan','flat']
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":800,"height":600})
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        async def route(r):
            u=r.request.url
            if "three@0.160.0/" in u: await r.fulfill(path='/tmp/th/node_modules/three/'+u.split('three@0.160.0/')[1],content_type="application/javascript")
            elif u.startswith("http://local.test/"):
                f=ROOT+'/'+u.split('local.test/')[1]; await r.fulfill(path=f,content_type="text/html" if f.endswith('.html') else "model/gltf-binary")
            else: await r.abort()
        await pg.route("**/*",route)
        await pg.goto("http://local.test/harness.html")
        await pg.wait_for_function("window.ready===true",timeout=120000)
        for name,sc in SC.items():
            if only and name not in only: continue
            for st in styles:
                spec=dict(sc); spec['style']=st
                url=await pg.evaluate("s=>window.renderScene(s)",spec)
                d=f"{OUT}/3d-{st}"; os.makedirs(d,exist_ok=True)
                open(f"{d}/{name}.png",'wb').write(base64.b64decode(url.split(',')[1]))
                print('rendered',st,name,flush=True)
        print('errors',errs); await b.close()
asyncio.run(main())
