'use strict';
(() => {
  // The packed records are sorted by latitude. Only points inside a five-kilometre
  // latitude band need a distance calculation, even for the national index.
  const radius = 5000;
  const earth = 6371000;
  const radians = Math.PI / 180;
  function nearest(buffer, latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const data = new DataView(buffer);
    const count = data.byteLength / 12;
    if (!Number.isInteger(count) || count === 0) throw Error('Invalid postal-point index.');
    const margin = radius / earth / radians;
    const min = (latitude - margin) * 10000;
    const max = (latitude + margin) * 10000;
    let left = 0, right = count;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (data.getInt32(middle * 12, true) < min) left = middle + 1;
      else right = middle;
    }
    const candidates = [];
    for (let i = left; i < count; i++) {
      const offset = i * 12;
      const packedLat = data.getInt32(offset, true);
      if (packedLat > max) break;
      const lat = packedLat / 10000, lon = data.getInt32(offset + 4, true) / 10000;
      const a = Math.sin((lat - latitude) * radians / 2) ** 2 +
        Math.cos(latitude * radians) * Math.cos(lat * radians) *
        Math.sin((lon - longitude) * radians / 2) ** 2;
      const distance = 2 * earth * Math.asin(Math.sqrt(Math.min(1, a)));
      if (distance <= radius) {
        const code = data.getUint32(offset + 8, true).toString(36).toUpperCase();
        candidates.push({code, distance});
      }
    }
    return candidates.sort((a,b) => a.distance - b.distance || a.code.localeCompare(b.code)).slice(0,5);
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = {nearest}; return; }
  let panel, indexTask, positionRequest = 0, districtRequest = 0;
  let candidates = [], selected = '';
  const enabled = () => new URL(location.href).searchParams.get('developer') === '1';
  const format = code => code.slice(0,3) + ' ' + code.slice(3);
  function updateUrl(on) {
    const url = new URL(location.href);
    if (on) url.searchParams.set('developer','1');
    else url.searchParams.delete('developer');
    history.pushState(history.state, '', url);
    showMode();
  }
  function showMode() {
    if (!enabled()) {
      ++positionRequest; ++districtRequest;
      panel?.remove(); panel = null; selected = ''; candidates = [];
      return;
    }
    if (panel) { panel.scrollIntoView({block:'start'}); return; }
    panel = document.createElement('section');
    panel.className = 'panel developer-gps';
    panel.setAttribute('aria-labelledby','gps-heading');
    panel.innerHTML = `<div class="row"><h2 id="gps-heading" tabindex="-1">Developer options</h2>
      <button type="button" class="text-button" data-gps="exit">Exit developer mode</button></div>
      <p>Test GPS → postal code → districts. The regular CivicPost tools are available below.</p>
      <p class="small">Coordinates stay on this device. The first test downloads a Canadian postal-point index.
      Previewing a code requests its geographic area from CivicPost.</p>
      <div class="row"><button type="button" class="button" data-gps="locate">Use my current location</button>
      <button type="button" class="button secondary" data-gps="demo">Try Bisset, Edmonton</button></div>
      <p id="gps-status" role="status" aria-live="polite"></p>
      <div id="gps-points"></div><div id="gps-districts" aria-live="polite"></div>
      <small>Postal points © <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> ·
      <a href="offline-postal/sources.html" target="_blank" rel="noopener noreferrer">Source and licence</a></small>`;
    document.querySelector('#main').prepend(panel);
    panel.addEventListener('click', event => {
      const action = event.target.closest('[data-gps]')?.dataset.gps;
      if (action === 'exit') { updateUrl(false); document.querySelector('[aria-label="Open CivicPost menu"]').focus(); }
      if (action === 'locate' || action === 'demo') run(action);
      if (action === 'use' && selected) {
        const code = selected;
        flowMove('postal', {stage:0});
        state.postal = code;
        startLookup();
        document.querySelector('#panel').scrollIntoView({block:'start'});
      }
    });
    panel.querySelector('#gps-heading').focus({preventScroll:true});
  }
  function clearResult() {
    ++districtRequest; candidates = []; selected = '';
    panel.querySelector('#gps-points').replaceChildren();
    panel.querySelector('#gps-districts').replaceChildren();
  }
  async function loadIndex() {
    if (!indexTask) indexTask = (async () => {
      const bytes = await CivicWeb.gpsIndexBytes();
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).arrayBuffer();
    })().catch(error => { indexTask = null; throw error; });
    return indexTask;
  }
  function deviceFix() {
    if (!navigator.geolocation) throw Error('Location is unavailable in this browser. Try the example or enter a postal code below.');
    return new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(
      p => resolve(p.coords),
      error => reject(Error(error.code === 1 ? 'Location permission was denied. Allow location in your browser settings, try the example, or enter your postal code below.' :
        error.code === 3 ? 'The location request timed out. Try again or enter your postal code below.' :
        'Your device could not get a location. Try again or enter your postal code below.')),
      {enableHighAccuracy:true,maximumAge:0,timeout:15000}
    ));
  }
  async function run(action) {
    const request = ++positionRequest;
    clearResult();
    const status = panel.querySelector('#gps-status');
    status.textContent = action === 'demo' ? 'Loading the example…' : 'Waiting for your device location…';
    try {
      const fix = action === 'demo' ? {latitude:53.46,longitude:-113.398} : await deviceFix();
      if (request !== positionRequest) return;
      const details = action === 'demo' ? 'Bisset example' : 'Device fix (reported accuracy ±' + Math.ceil(fix.accuracy) + ' m)';
      if (action !== 'demo' && (!Number.isFinite(fix.accuracy) || fix.accuracy > radius)) {
        status.textContent = details + '. Too broad for a postal suggestion. Try a more precise fix or enter a postal code below.'; return;
      }
      status.textContent = details + '. Reading the postal-point index…';
      const buffer = await loadIndex();
      if (request !== positionRequest) return;
      candidates = nearest(buffer,fix.latitude,fix.longitude);
      status.textContent = details + ' · ' + fix.latitude.toFixed(5) + ', ' + fix.longitude.toFixed(5) + '. ' +
        (candidates.length ? 'Compare the nearby postal points and confirm your own code.' : 'No Canadian postal point within 5 km. Enter your postal code below.');
      if (!candidates.length) return;
      const label = document.createElement('label');
      label.className = 'field'; label.textContent = 'Nearby postal codes';
      const select = document.createElement('select');
      select.id = 'gps-candidate';
      for (const c of candidates) select.add(new Option(format(c.code) + ' · ' + Math.round(c.distance) + ' m', c.code));
      label.append(select); panel.querySelector('#gps-points').append(label);
      select.onchange = () => preview(select.value);
      await preview(select.value);
    } catch (error) {
      if (request === positionRequest) status.textContent = error.message + ' You can still use the regular CivicPost tools.';
    }
  }
  async function preview(code) {
    const request = ++districtRequest;
    selected = '';
    const output = panel.querySelector('#gps-districts');
    output.textContent = 'Finding districts for ' + format(code) + '…';
    try {
      const hit = await CivicOffline.lookup(code);
      if (request !== districtRequest) return;
      if (!hit) throw Error('This code is missing from the postal database.');
      const offline = hit.offline;
      const districts = offline.coordinateReview ? [] : offline.districts.filter(d => CivicEngine.currentRecord(d));
      const lines = [['Community', hit.data.city || offline.cities.join(', ')]];
      for (const [level, label] of [['municipal','Municipal ward'],['provincial','Provincial or territorial riding'],['federal','Federal riding']]) {
        const names = [...new Set(districts.filter(d => d.level === level).map(d => d.name))];
        lines.push([label,names.join(' / ') || 'No confirmed suggestion in this snapshot']);
      }
      output.innerHTML = '<h3>District preview · ' + format(code) + '</h3><dl>' +
        lines.map(([k,v]) => '<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('') +
        '</dl><p class="small">Postal codes may cross boundaries. Choose your school board separately. Continuing checks the selected postal code with Open North and lets you confirm the districts.</p>' +
        '<button type="button" class="button" data-gps="use">Use this postal code in CivicPost</button>';
      selected = code;
    } catch (error) {
      if (request === districtRequest) output.textContent = 'District preview unavailable. ' + error.message + ' Try again or use the normal postal lookup.';
    }
  }
  window.CivicDeveloper = {open:() => enabled() ? showMode() : updateUrl(true)};
  window.addEventListener('popstate',showMode);
  showMode();
})();
