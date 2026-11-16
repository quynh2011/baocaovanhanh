const path=require('path'); const R=require('path').resolve(__dirname,'../..')+'/'; const FX=process.argv[2]||(__dirname+'/fixtures'); const fs=require('fs');
const sc=require(R+'api/_sheetsClient.js');
let cfg=[]; sc.getValues=async()=>cfg; sc.putValues=async(id,rg,rows)=>{cfg=rows;}; sc.ensureSheetWithHeaders=async()=>({});
sc.requireActiveUser=async()=>({email:'a@ghn.vn',name:'Test'});
const ld=f=>{const d=JSON.parse(fs.readFileSync(FX+'/'+f));return d.data!==undefined&&d.ok!==undefined?d.data:d};
const live={'wards_new.geojson':ld('getWardsGeoJson.json'),'wards.geojson':ld('getWardsOldGeoJson.json'),'hubs.json':ld('getHubs.json'),'wards.json':ld('getWards.json'),'ward_centroids.json':ld('getWardCentroids.json'),'rezone.json':ld('getRezone.json')};
const T=k=>JSON.parse(fs.readFileSync(R+'quyhoach/data/tnt_'+k+'.json'));
const gas={getWardsOldGeoJson:T('wards_old'),getWardsGeoJson:T('wards_new'),getHubs:T('hubs'),getWards:T('wards'),getWardCentroids:T('centroids'),getRezone:T('rezone')};
let posted=null; let cookieOk=true;
global.fetch=async(url,opt={})=>{ url=String(url);
 const resp=(st,obj)=>({status:st,ok:st==200,text:async()=>typeof obj=='string'?obj:JSON.stringify(obj),json:async()=>obj});
 if(url.includes('quyhoachbuucuc')){ if(!cookieOk||!/sid=/.test(opt.headers.Cookie)) return resp(302,'<html>login'); return resp(200,live[url.split('/api/')[1]]); }
 if(url.includes('script.google')){ if(opt.method==='POST'){posted=JSON.parse(opt.body);return resp(200,{ok:true,saved:['x']});}
   const a=new URL(url).searchParams.get('action'); if(a==='getMeta')return resp(200,{ok:true,hasHubs:true,hasWards:true,hasWardsOldGeoJson:true,hasWardsGeoJson:true,hasRezone:true}); return resp(200,{ok:true,data:gas[a]}); }
 throw new Error('url '+url); };
const q=require(R+'api/_qhSync.js');
(async()=>{
 console.log('save bad', await q.handleQhSaveSid({cookie:'abc=1'}));
 console.log('sync no cookie', (await q.handleQhAutoSync({token:'x'})).error);
 console.log('save ok', await q.handleQhSaveSid({cookie:'sid=XYZ',by:'Quynh'}));
 const r=await q.handleQhAutoSync({token:'x'}); console.log('sync', r);
 console.log('posted hubs', JSON.parse(posted.hubs).length, JSON.parse(posted.wardsOldGeoJson).features.length, posted.syncedBy);
 console.log('again', (await q.handleQhAutoSync({token:'x'})).skipped);
 cookieOk=false; cfg=cfg.map(r=>r[0]==='dongBoLuc'||r[0]==='thuLuc'?[r[0],'']:r);
 console.log('expired', await q.handleQhAutoSync({token:'x'}));
 console.log('cfg keys', cfg.map(r=>r[0]+'='+(r[0]==='cookie'?'***':r[1])).join(' | '));
})();
