const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');
const release = require('../release.json');
const site = new URL(process.argv[2]);
(async () => {
  const live = site.protocol === 'https:';
  for (let i = 0; ; i++) {
    const url = new URL('release.json', site);
    url.searchParams.set('check', Date.now());
    const served = await fetch(url, {signal:AbortSignal.timeout(10000)}).then(r => r.json()).catch(() => null);
    if (served?.sourceCommit === release.sourceCommit && served?.release === release.release) break;
    assert.ok(live && i < 90, 'Expected release has not appeared');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:360,height:680},isMobile:true,hasTouch:true});
    await page.goto(new URL('?developer=1&refresh=gps', site).href);
    await page.getByRole('button', {name:'I agree and continue'}).tap();
    await page.getByRole('button', {name:'Try Bisset, Edmonton'}).tap();
    const use = page.getByRole('button', {name:'Use this postal code in CivicPost'});
    await use.waitFor();
    assert.equal(await page.locator('#gps-candidate').inputValue(),'T6L5X1');
    assert.match(await page.locator('#gps-districts').innerText(), /Sspomitapi/);
    const mobile = await page.context().newCDPSession(page);
    for (let swipe = 0; ; swipe++) {
      const point = await use.evaluate(button => {
        const r = button.getBoundingClientRect();
        const x = r.left+r.width/2, y = r.top+r.height/2;
        return button.contains(document.elementFromPoint(x,y)) ? {x,y} : null;
      });
      if (point) { await page.touchscreen.tap(point.x, point.y); break; }
      assert.ok(swipe < 8, 'Continue is clipped on the phone');
      await mobile.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:550}]});
      for (const y of [510,470,430,390,350,310]) {
        await mobile.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160,y}]});
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      await mobile.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await page.getByRole('heading',{name:'Is this your community?'}).waitFor();
    assert.match(await page.locator('#panel').innerText(), /Edmonton/);
    await page.getByRole('button',{name:/Yes, this is my community/}).tap();
    const skip = page.getByRole('button',{name:'Leave unresolved',exact:true});
    const next = page.getByRole('button',{name:/Choose issue/});
    for (let i=0; i<4; i++) {
      await skip.or(next).first().waitFor();
      if (await next.isVisible()) break;
      await skip.tap();
    }
    await next.tap();
    await page.getByRole('heading',{name:'What would you like to raise?'}).waitFor();
    console.log(site.origin, release.release, '360 × 680 touch: Bisset → T6L 5X1 → Edmonton → Issue');
    const health = await fetch(new URL('/health',release.contactApiUrl),{signal:AbortSignal.timeout(15000)}).then(r=>r.json());
    assert.equal(health.release,'0d3d87d08cff57a33772');
    console.log('Configured contact service matches the tested backend release');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
