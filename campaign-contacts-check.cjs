const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const release=require('./release.json');
const endpoint=release.contactApiUrl;
const fingerprint=s=>createHash('sha256').update(s.toLowerCase()).digest('hex');
(async()=>{
  const health=await (await fetch(endpoint+'/health')).json();
  console.log('Production Worker release:',health.release);
  const res=await fetch(endpoint+'/v1/campaign',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://civicpost.ca'},body:JSON.stringify({campaign:'ab-grizzly-bears'})});
  console.log('Production campaign HTTP status:',res.status);
  assert.equal(res.status,200);
  const data=await res.json(); const office=data.results[0];
  assert.equal(fingerprint(office.email),'cebbd368e6240d37105b1aa2c687591b1eced89a7b18fc09b0936f9a7ee17c04');
  assert.equal(office.cc.length,1);assert.equal(fingerprint(office.cc[0].email),'fb5c48e6de965962885150cd0b6c5502d5b4485588c603bb7702c3e831f074bb');
  assert.equal(res.headers.get('access-control-allow-origin'),'https://civicpost.ca');
  console.log('Approved To/Cc verified against the live campaign service.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
