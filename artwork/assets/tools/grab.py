import asyncio, base64, json
from playwright.async_api import async_playwright
ROOT='/home/claude/lite'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":900,"height":900}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        async def route(r):
            u=r.request.url
            if "three@0.160.0/" in u: await r.fulfill(path='/tmp/th/node_modules/three/'+u.split('three@0.160.0/')[1],content_type="application/javascript")
            elif u.startswith("http://local.test/"): await r.fulfill(path=ROOT+'/'+u.split('local.test/')[1],content_type="text/html")
            else: await r.abort()
        await pg.route("**/*",route)
        await pg.goto("http://local.test/capture.html")
        await pg.wait_for_function("document.getElementById('loading').hidden===true",timeout=120000)
        await pg.evaluate("window.prep()")
        NL=await pg.evaluate("window.layerCount()")
        frames=[]
        layers=list(range(1,NL+1,2))
        if layers[-1]!=NL: layers.append(NL)
        for L in layers:
            n=await pg.evaluate(f"window.movesIn({L})")
            url=await pg.evaluate(f"window.capture({L},{n},960,960)")
            fn=f'frames/f{len(frames):03d}.png'; open(fn,'wb').write(base64.b64decode(url.split(',')[1]))
            frames.append(dict(layer=L,file=fn))
        json.dump(dict(layers=NL,frames=frames),open('frames.json','w'))
        print('frames',len(frames),'errors',errs); await b.close()
asyncio.run(main())
