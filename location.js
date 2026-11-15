(function(root){'use strict';
const D=typeof module!=='undefined'?require('./data.js'):root.CivicData;
const clean=v=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,'').trim():'';
function parseSuggestion(raw){
 if(!raw||raw.countryCode!=='CA')throw Error('A Canadian location could not be suggested. Enter your location manually.');
 const code=clean(raw.principalSubdivisionCode).replace(/^CA-/,'');
 const p=D.provinces.find(p=>p.code===code||p.name.toLowerCase()===clean(raw.principalSubdivision).toLowerCase());
 const city=clean(raw.city)||clean(raw.locality);
 if(!p||!city||city.length>100)throw Error('The city or province could not be identified. Enter it manually.');
 return {province:p.code,city};
}
function provinceFromPostal(value){
 const p=clean(value).toUpperCase().replace(/\s/g,'');if(!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]/.test(p))return '';
 return {A:'NL',B:'NS',C:'PE',E:'NB',G:'QC',H:'QC',J:'QC',K:'ON',L:'ON',M:'ON',N:'ON',P:'ON',R:'MB',S:'SK',T:'AB',V:'BC',Y:'YT'}[p[0]]||'';
}
function savedLocation(raw){
 if(!raw||!D.provinces.some(p=>p.code===raw.province)||!clean(raw.city)||clean(raw.city).length>100)return null;
 const out={};for(const k of ['province','city','ward','provRiding','fedRiding','schoolBoard'])out[k]=clean(raw[k]).slice(0,k==='schoolBoard'?240:180);return out;
}
const api={parseSuggestion,provinceFromPostal,savedLocation};if(typeof module!=='undefined')module.exports=api;root.CivicLocation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
