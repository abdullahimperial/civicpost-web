const assert = require('node:assert/strict');

async function checkNisku(page, context) {
  // Use the published postal point, independent of any resident's device fix.
  await context.setGeolocation({latitude:53.3145, longitude:-113.5328, accuracy:20});
  await page.reload();
  let postalDownloads = 0;
  await page.route('**/postal/*.json', route => { postalDownloads++; return route.abort(); });
  await page.route('https://represent.opennorth.ca/**', route => route.abort());
  await page.locator('[data-gps="locate"]').click();
  await page.locator('[data-gps="use"]').waitFor();
  assert.equal(await page.locator('#gps-candidate').inputValue(),'T9E7P4');
  const preview = await page.locator('#gps-districts').innerText();
  for (const name of ['Nisku','Leduc-Beaumont','Leduc—Wetaskiwin']) assert.ok(preview.includes(name));
  await page.locator('[data-gps="use"]').click();
  const card = page.locator('[data-view="city-confirm"] .location-card');
  await card.waitFor();
  assert.equal(await card.locator('strong').innerText(),'Nisku');
  assert.equal(await card.locator('small').innerText(),'T9E7P4');
  assert.equal(postalDownloads,0);
  await page.locator('[data-flow="confirm-city"]').click();
  // The regional authority list can arrive before or after city confirmation.
  // Take each decision through its visible control in either order.
  for (let step = 0; step < 9; step++) {
    await page.waitForFunction(() => !webNeedsData());
    const view = await page.locator('#panel').getAttribute('data-view');
    if (view === 'issues') break;
    if (view === 'municipality') {
      await page.getByRole('button',{name:/Leduc County/}).click();
    } else if (await page.locator('[data-flow="district-skip"]').isVisible()) {
      await page.locator('[data-flow="district-skip"]').click();
    } else {
      await page.locator('[data-flow="next-stage"]').click();
    }
  }
  assert.equal(await page.locator('#panel').getAttribute('data-view'),'issues');
  assert.equal(await page.evaluate(() => state.municipality),'Leduc County');
  assert.equal(await page.evaluate(() => state.ward + state.schoolBoard),'');
  assert.equal(await page.evaluate(() => state.selected.length),0);

  // A broken preview must still use the newly selected code in normal lookup.
  await page.unroute('**/postal/*.json');
  await page.locator('[data-flow="menu"]').click();
  await page.locator('[data-flow="developer-options"]').click();
  await page.evaluate(() => {
    const create = CivicOffline.create;
    CivicOffline.create = options => { CivicOffline.create = create; throw Error('Preview unavailable'); };
  });
  await page.locator('#gps-candidate').selectOption({index:1});
  const nextCode = await page.locator('#gps-candidate').inputValue();
  assert.notEqual(nextCode,'T9E7P4');
  await page.getByText(/District preview unavailable for/).waitFor();
  await page.locator('[data-gps="use"]').click();
  await page.locator('[data-view="city-confirm"]').waitFor();
  assert.equal(await page.evaluate(() => lookupResult.postal),nextCode);
}


(async function () {
  const browser = await require('playwright-core').chromium.launch({
    executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome', args:['--no-sandbox']
  });
  const base = process.argv[2];
  const context = await browser.newContext({viewport:{width:360,height:680},isMobile:true,hasTouch:true,
    serviceWorkers:'block',permissions:['geolocation'],geolocation:{latitude:53.3145,longitude:-113.5328,accuracy:20}});
  try {
    const page = await context.newPage();
    await page.goto(new URL('?developer=1&refresh=nisku',base).href);
    await page.locator('#agreement-accept').click();
    if (process.argv[3] === 'before') {
      await page.route('**/postal/*.json', route => route.abort());
      await page.locator('[data-gps="locate"]').click();
      await page.getByText(/District preview unavailable/).waitFor();
      assert.equal(await page.locator('#gps-candidate').inputValue(),'T9E7P4');
      assert.equal(await page.locator('[data-gps="use"]').count(),0);
      console.log('Reproduced T9E 7P4 missing continuation on the previous release.');
    } else {
      await checkNisku(page,context);
      console.log('T9E 7P4, Nisku, both riding candidates, explicit Leduc County, Issue and alternate postal-code recovery passed.');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
