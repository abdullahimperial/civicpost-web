'use strict';
(() => {
  // The packed records are sorted by latitude. Only points inside a five-kilometre
  // latitude band need a distance calculation, even for the national index.
  const radius = 5000;
  const earth = 6371000;
  const radians = Math.PI / 180;
  function unpack(buffer) {
    const header = new DataView(buffer);
    if (header.getUint32(0) !== 0x47505332) throw Error('Invalid postal-point index.');
    const length = header.getUint32(4, true) * 16;
    if (!length || 8 + length >= buffer.byteLength) throw Error('Incomplete postal-point index.');
    const geography = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8 + length)));
    return {points:new DataView(buffer, 8, length), geography};
  }
  function nearest(data, latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const count = data.byteLength / 16;
    const margin = radius / earth / radians;
    const min = (latitude - margin) * 10000;
    const max = (latitude + margin) * 10000;
    let left = 0, right = count;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (data.getInt32(middle * 16, true) < min) left = middle + 1;
      else right = middle;
    }
    const candidates = [];
    for (let i = left; i < count; i++) {
      const offset = i * 16;
      const packedLat = data.getInt32(offset, true);
      if (packedLat > max) break;
      const lat = packedLat / 10000, lon = data.getInt32(offset + 4, true) / 10000;
      const a = Math.sin((lat - latitude) * radians / 2) ** 2 +
        Math.cos(latitude * radians) * Math.cos(lat * radians) *
        Math.sin((lon - longitude) * radians / 2) ** 2;
      const distance = 2 * earth * Math.asin(Math.sqrt(Math.min(1, a)));
      if (distance <= radius) {
        const code = data.getUint32(offset + 8, true).toString(36).toUpperCase();
        candidates.push({code, distance, row:data.getUint32(offset + 12, true)});
      }
    }
    return candidates.sort((a,b) => a.distance - b.distance || a.code.localeCompare(b.code));
  }

  async function exactResult(candidate, geography) {
    // The whole package was integrity-checked on download. Feed only this
    // exact row to the shared decoder, including on phones with an older shell.
    const {code, row} = candidate;
    const bytes = new TextEncoder().encode(JSON.stringify({
      version:geography.version, rows:{[code]:geography.rows[row]}
    }));
    const local = CivicOffline.create({
      metadata:{...geography, files:{[code[0]]:{bytes:bytes.byteLength, path:'gps-memory'}}},
      fetchImpl:async () => new Response(bytes), cryptoImpl:null, documentImpl:null, preferBundled:false
    });
    return local.lookup(code);
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = {nearest, unpack}; return; }
  let panel, indexTask, positionRequest = 0, districtRequest = 0;
  let selectedResult = null;
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
      panel?.remove(); panel = null; selectedResult = null;
      return;
    }
    if (panel) {
      if (!panel.isConnected) document.querySelector('#main').prepend(panel);
      panel.scrollIntoView({block:'start'});
      panel.querySelector('#gps-heading').focus({preventScroll:true});
      return;
    }
    panel = document.createElement('section');
    panel.className = 'panel developer-gps';
    panel.setAttribute('aria-labelledby','gps-heading');
    panel.innerHTML = `<div class="row"><h2 id="gps-heading" tabindex="-1">Developer options</h2>
      <button type="button" class="text-button" data-gps="exit">Exit developer mode</button></div>
      <p>Test GPS → postal code → districts. The regular CivicPost tools are available below.</p>
      <p class="small">Coordinates stay on this device. The first test downloads Canadian postal points
      and their district suggestions. You can then preview nearby codes on this device.</p>
      <div class="row"><button type="button" class="button" data-gps="locate">Use my current location</button>
      <button type="button" class="button secondary" data-gps="demo">Try Bisset, Edmonton</button></div>
      <p id="gps-status" role="status" aria-live="polite"></p>
      <div id="gps-points"></div><div id="gps-districts" aria-live="polite"></div>
      <p><button type="button" class="text-button" data-gps="manual">Enter my postal code</button></p>
      <small>Postal points © <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> ·
      <a href="offline-postal/sources.html" target="_blank" rel="noopener noreferrer">Source and licence</a></small>`;
    document.querySelector('#main').prepend(panel);
    panel.addEventListener('click', event => {
      const action = event.target.closest('[data-gps]')?.dataset.gps;
      if (action === 'exit') { updateUrl(false); document.querySelector('[aria-label="Open CivicPost menu"]').focus(); }
      if (action === 'locate' || action === 'demo') run(action);
      const code = panel.querySelector('#gps-candidate')?.value;
      if (action === 'manual' || (action === 'use' && code)) {
        event.stopPropagation();
        // Restore the normal phone layout. Menu → Developer options can reopen this picker.
        panel.remove();
        flowMove('postal', {stage:0});
        if (action === 'use') {
          state.postal = code;
          startLookup(selectedResult?.postal === code ? selectedResult : undefined);
        } else {
          document.getElementById('postal').focus();
        }
        document.querySelector('#main').scrollTop = 0;
      }
    });
    panel.querySelector('#gps-heading').focus({preventScroll:true});
  }
  function clearResult() {
    ++districtRequest; selectedResult = null;
    panel.querySelector('#gps-points').replaceChildren();
    panel.querySelector('#gps-districts').replaceChildren();
  }
  async function loadIndex() {
    if (!indexTask) indexTask = (async () => {
      // A returning tab may still have the pre-GPS web loader and manifest.
      // The build pins this script to its own verified, same-origin index.
      const index = {"path": "data/e25df9dc3c8ab20788ae/gps-postal.bin", "bytes": 5224930, "integrity": "sha256-YlIIFnppnegHaCEYDPKZ6WSGFcWRtyikMUuRYwJaBn4="};
      const response = await fetch(new URL(index.path, document.baseURI), {
        integrity:index.integrity, credentials:'omit', referrerPolicy:'no-referrer',
        signal:AbortSignal.timeout(20000)
      });
      if (!response.ok) throw Error('Could not download the Canadian postal index.');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== index.bytes) throw Error('The postal index download was incomplete.');
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return unpack(await new Response(stream).arrayBuffer());
    })().catch(() => {
      indexTask = null;
      throw Error('The Canadian postal index could not be loaded and verified. Reconnect and try again, or enter your postal code.');
    });
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
      const {points, geography} = await loadIndex();
      if (request !== positionRequest) return;
      const candidates = nearest(points,fix.latitude,fix.longitude);
      status.textContent = details + ' · ' + fix.latitude.toFixed(5) + ', ' + fix.longitude.toFixed(5) + '. ' +
        (candidates.length ? 'Compare the nearby postal points and confirm your own code.' : 'No Canadian postal point within 5 km. Enter your postal code below.');
      if (!candidates.length) return;
      const label = document.createElement('label');
      label.className = 'field'; label.textContent = 'Nearby postal codes';
      const select = document.createElement('select');
      select.id = 'gps-candidate';
      const visible = candidates.slice(0, 5);
      const tied = candidates.filter(c => c.distance === candidates[0].distance).length;
      if (tied > 1) {
        status.textContent += ' ' + tied + ' postal codes tie for closest. Choose a code to preview its districts, or enter your own.';
        const prompt = new Option('Choose a postal code', '', true, true);
        prompt.disabled = true;
        select.add(prompt);
      }
      for (const c of visible) select.add(new Option(format(c.code) + ' · ' + Math.round(c.distance) + ' m', c.code));
      label.append(select); panel.querySelector('#gps-points').append(label);
      select.onchange = () => preview(visible.find(c => c.code === select.value), geography);
      if (tied === 1) await preview(visible[0], geography);
    } catch (error) {
      if (request === positionRequest) status.textContent = error.message + ' You can still use the regular CivicPost tools.';
    }
  }
  async function preview(candidate, geography) {
    const code = candidate.code;
    const request = ++districtRequest;
    selectedResult = null;
    const output = panel.querySelector('#gps-districts');
    output.textContent = 'Finding districts for ' + format(code) + '…';
    try {
      const hit = await exactResult(candidate, geography);
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
        '</dl>' +
        '<p class="small">Postal codes may cross boundaries. Choose your school board separately. Continuing checks the selected postal code with Open North and lets you confirm the districts.</p>';
      selectedResult = hit;
    } catch {
      if (request !== districtRequest) return;
      output.textContent = 'District preview unavailable for ' + format(code) + '. Continue to look up this postal code.';
    }
    const use = document.createElement('button');
    use.type = 'button'; use.className = 'button'; use.dataset.gps = 'use';
    use.textContent = 'Use this postal code in CivicPost';
    output.insertBefore(use, output.querySelector('p'));
  }
  window.CivicDeveloper = {open:() => enabled() ? showMode() : updateUrl(true)};
  window.addEventListener('popstate',showMode);
  showMode();
})();
