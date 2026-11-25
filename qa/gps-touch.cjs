const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');
const release = require('../release.json');
const site = new URL(process.argv[2]);
(async () => {
  const live = site.protocol === 'https:';
  const oldSite = process.env.GPS_UPGRADE_DIR;
  for (let i = 0; !oldSite; i++) {
    const url = new URL('release.json', site);
    url.searchParams.set('check', Date.now());
    const served = await fetch(url, {signal:AbortSignal.timeout(10000)}).then(r => r.json()).catch(() => null);
    if (served?.sourceCommit === release.sourceCommit && served?.release === release.release) break;
    assert.ok(live && i < 90, 'Expected release has not appeared');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const context = await browser.newContext({
      viewport:{width:360,height:680}, isMobile:true, hasTouch:true, serviceWorkers:oldSite?'allow':'block',
      geolocation:{latitude:53.46, longitude:-113.398, accuracy:18}, permissions:['geolocation']
    });
    const page = await context.newPage();
    if (oldSite) {
      const fs = require('node:fs'), path = require('node:path');
      await page.goto(site.href);
      await page.getByRole('button',{name:'I agree and continue'}).tap();
      await page.waitForFunction(()=>navigator.serviceWorker.controller && window.CivicWeb);
      const oldRelease = JSON.parse(fs.readFileSync(path.join(oldSite,'previous/release.json'))).release;
      assert.notEqual(oldRelease,release.release);
      const cached = await page.evaluate(async()=>{
        const cache = await caches.open(CivicWeb.cacheName);
        return Boolean(await cache.match(new URL('flow.js',document.baseURI)));
      });
      assert.equal(cached,true,'Previous flow script must be in the phone cache');
      fs.symlinkSync(process.cwd(),path.join(oldSite,'site-next'));
      fs.renameSync(path.join(oldSite,'site-next'),path.join(oldSite,'site'));
    }
    // Hold the external postal update until the user has confirmed the bundled community.
    let resume;
    const gate = new Promise(resolve => { resume=resolve; });
    await page.route('https://represent.opennorth.ca/**', async route => {
      await gate;
      return route.continue().catch(()=>{});
    });
    const apiStatuses = [];
    page.on('response', r => {
      if(r.url() === release.contactApiUrl+'/v1/lookup') apiStatuses.push(r.status());
    });
    await page.goto(new URL('?developer=1&refresh=confirm', site).href);
    if(!oldSite) await page.getByRole('button', {name:'I agree and continue'}).tap();
    await page.getByRole('button', {name:'Use my current location'}).tap();
    const use = page.getByRole('button', {name:'Use this postal code in CivicPost'});
    await use.waitFor();
    if (oldSite) {
      assert.ok(await page.evaluate(rel=>[...document.scripts].some(s=>s.src.includes('assets/'+rel+'/developer-gps.js')),release.release));
    }
    assert.match(await page.locator('#gps-status').innerText(),/Device fix.*18 m/);
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
    assert.equal(await page.locator('.developer-gps').count(),0,'Picker must relinquish the screen');
    const nextButton = page.getByRole('button',{name:/Yes, this is my community/});
    const position = await nextButton.evaluate(button => {
      const box=button.getBoundingClientRect(), x=box.left+box.width/2, y=box.top+box.height/2;
      return button.contains(document.elementFromPoint(x,y)) ? {x,y} : null;
    });
    assert.ok(position,'Confirmation must be within touch reach without a second scroll');
    await page.touchscreen.tap(position.x,position.y);
    resume();
    const district = page.locator('[data-flow="pick-district"]').first();
    const chosen = [];
    const next = page.getByRole('button',{name:/Choose issue/});
    for (let i=0; i<4; i++) {
      await district.or(next).first().waitFor();
      if (await next.isVisible()) break;
      chosen.push(await district.innerText());
      await district.tap();
    }
    assert.ok(chosen.some(s=>/Sspomitapi/i.test(s)), 'Municipal ward was offered');
    await next.tap();
    await page.getByRole('heading',{name:'What would you like to raise?'}).waitFor();
    console.log(site.origin, release.release, '360 × 680 touch: Bisset → T6L 5X1 → Edmonton → Issue');
    assert.equal(new URL(page.url()).searchParams.get('developer'),'1');
    if(live) {
      const roads = page.locator('[data-issue="roads"]');
      for(let i=0;i<8 && !(await roads.isVisible());i++) {
        await page.getByRole('button',{name:'More ›',exact:true}).tap();
      }
      await roads.tap();
      await page.locator('[data-flow="next-stage"]').tap();
      await page.locator('.contact-email').first().waitFor();
      const officeEmail = (await page.locator('.contact-email').first().innerText()).trim();
      assert.ok(apiStatuses.includes(200), 'Real office lookup returned 200');
      assert.equal(await page.evaluate(()=>state.selected.length),0);
      await page.locator('[data-flow="add-recipient"]').first().tap();
      const done = page.locator('[data-flow="recipients-done"]');
      const write = page.getByRole('button',{name:/Write message/});
      await done.or(write).first().waitFor();
      if(await done.isVisible()) await done.tap();
      await page.locator('[data-flow="next-stage"]').tap();
      await page.getByRole('button',{name:/Write myself/}).tap();
      await page.locator('#subject').fill('Road maintenance near Bisset');
      await page.locator('#body').fill('Please share the road maintenance schedule for Bisset.');
      await page.getByRole('button',{name:/Review & open/}).tap();
      await page.getByRole('heading',{name:'Ready for your review.'}).waitFor();
      await page.locator('#review-confirm').check();
      const draft = new URL(await page.locator('#send-link').getAttribute('href'));
      assert.equal(draft.protocol,'mailto:');
      assert.ok(decodeURIComponent(draft.pathname).toLowerCase().includes(officeEmail.toLowerCase()));
      assert.equal(draft.searchParams.get('subject'),'Road maintenance near Bisset');
      assert.match(draft.searchParams.get('body'),/road maintenance schedule/);
      assert.equal(new URL(page.url()).searchParams.get('developer'),'1');
      assert.equal(await page.evaluate(()=>state.postal),'T6L5X1');
      console.log('Device GPS → selected postal code → confirmed districts → issue → live office lookup → recipient → reviewed, addressed email draft');
    }
    const health = await fetch(new URL('/health',release.contactApiUrl),{signal:AbortSignal.timeout(15000)}).then(r=>r.json());
    assert.equal(health.release,'0d3d87d08cff57a33772');
    console.log('Configured contact service matches the tested backend release');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
