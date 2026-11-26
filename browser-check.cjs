const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const release = require('./release.json');
const live = process.argv.includes('--live');
const publicURL = 'https://civicpost.ca/';
const fakeOffice = {email:'office@example.ca', role:'Test office', source:'https://example.ca/'};

async function check(browser, home, id, mode) {
  const context = await browser.newContext({viewport:{width:390,height:844}, serviceWorkers:'block'});
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (!live) await page.route('**/v1/campaign', route => route.fulfill({
      headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type'},
      json:{results:[fakeOffice], total:1, release:'qr-test'}
    }));
    await page.addInitScript(mode => {
      window.captured = [];
      Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{
        writeText:async text => {window.copied = text;}
      }});
      const canShare = mode === 'native';
      Object.defineProperty(navigator, 'canShare', {configurable:true,value:() => canShare});
      Object.defineProperty(navigator, 'share', {configurable:true,value:canShare ? async data => {
        if(window.cancel)throw new DOMException('Cancelled','AbortError');
        window.captured.push(data);
      } : undefined});
      if(mode === 'webview') window.MoneySnapshotAndroid = {postMessage(){}};
    }, mode);
    await page.goto(home + '?campaign=' + id);
    await page.getByRole('button',{name:'I agree and continue'}).click();
    const dialog = page.locator('#dialog');
    const email = dialog.getByRole('link',{name:'Open email draft'});
    const mail = new URL(await email.getAttribute('href'));
    assert.equal(mail.protocol,'mailto:');
    assert.ok(decodeURIComponent(mail.pathname).includes('@'));
    assert.ok(mail.searchParams.get('subject'));
    assert.equal(mail.searchParams.get('body'),(await dialog.locator('.campaign-message').innerText()).replace(/\r?\n/g,'\r\n'));
    await dialog.getByRole('button',{name:'Copy campaign post'}).click();
    const post = await page.evaluate(()=>window.copied);
    const url = publicURL + '?campaign=' + id;
    assert.ok(post.endsWith('\n'+url));
    if (mode === 'native') {
      await dialog.getByRole('button',{name:'Share campaign post'}).click();
      assert.deepEqual(await page.evaluate(()=>window.captured[0]),{text:post.slice(0,-url.length-1),url});
      const button=dialog.getByRole('button',{name:'Share QR image',exact:true});
      await button.click();
      const result=await page.evaluate(async()=>{
        const file=window.captured[1].files[0];
        const image=await createImageBitmap(file);
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=384;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(image,0,0,384,384);
        image.close();
        return {type:file.type, name:file.name, data:jsQR(ctx.getImageData(0,0,384,384).data,384,384)?.data};
      });
      assert.deepEqual(result,{type:'image/png',name:'CivicPost_'+id+'.png',data:mail.href});
      await page.evaluate(()=>{window.cancel=true;});
      await button.click();
      await dialog.getByRole('button',{name:'Share campaign post'}).click();
      assert.equal(await page.evaluate(()=>window.captured.length),2);
      assert.equal(await dialog.isVisible(),true);
    } else if(mode==='webview'){
      assert.equal(await dialog.getByRole('link',{name:'Share QR image in browser'}).getAttribute('href'),url);
    } else {
      await dialog.locator('#draft-qr-stage canvas').waitFor();
      const event=page.waitForEvent('download');
      await dialog.getByRole('button',{name:'Download QR image'}).click();
      assert.equal((await event).suggestedFilename(),'CivicPost_'+id+'.png');
    }
    assert.deepEqual(errors,[]);
    console.log('Passed',id,mode,live?'published website':'generated website');
  } finally {await context.close();}
}
(async()=>{
  const server=live?null:http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.join(process.cwd(),pathname==='/'?'index.html':pathname);
    const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'};
    if(!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const home=live?publicURL:'http://127.0.0.1:'+server.address().port+'/';
  const browser=await chromium.launch();
  try{
    assert.equal((await (await fetch(home+'release.json')).json()).release,release.release);
    for(const id of ['ab-fscd','ab-halal-home-finance','ab-er'])await check(browser,home,id,'native');
    await check(browser,home,'ab-halal-home-finance','download');
    await check(browser,home,'ab-halal-home-finance','webview');
  }finally{await browser.close();if(server)server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
