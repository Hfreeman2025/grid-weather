import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResponse, alignFrames, interpolate, bestWindow, colour, HALF_HOUR } from '../src/core.ts';
const raw = JSON.parse(readFileSync(new URL('../data/current-response.json', import.meta.url)));
const fixture = () => structuredClone(raw);
const mix = {biomass:0,coal:0,imports:0,gas:50,nuclear:0,other:0,hydro:0,solar:0,wind:50};
const frame = (i, n) => ({from:i*HALF_HOUR, to:(i+1)*HALF_HOUR, regions:[{id:1,name:'North Scotland',intensity:n,mix}]});
test('schema accepts genuine API response and preserves zero intensity', () => {
 const f=parseResponse(raw); assert.equal(f.length,1); assert.equal(f[0].regions.length,14); assert.equal(f[0].regions[0].intensity,0);
});
test('schema rejects null, invalid timestamps, missing regions, non-finite values and invalid mixes', () => {
 assert.throws(()=>parseResponse(null));
 for(const mutate of [j=>j.data[0].from='tomorrow', j=>j.data[0].to=j.data[0].from, j=>j.data[0].regions.splice(0,1),j=>j.data[0].regions[0].intensity.forecast=-1,j=>j.data[0].regions[0].generationmix[0].perc=NaN,j=>j.data[0].regions[0].generationmix[0].perc=101,j=>j.data[0].regions[0].generationmix[0].fuel='mystery',j=>j.data[0].regions[0].regionid=2,j=>j.data[0].regions[0].generationmix[0].perc=20]) {const j=fixture(); mutate(j);assert.throws(()=>parseResponse(j));}
});
test('alignment sorts, deduplicates overlap in favour of newer source and rejects mismatched regions',()=>{
 assert.deepEqual(alignFrames([frame(1,10),frame(0,20)],[frame(1,40)]).map(f=>f.regions[0].intensity),[20,40]);
 const b=frame(1,2);b.regions[0].id=2;assert.throws(()=>alignFrames([frame(0,1),b]));
});
test('interpolation blends half-hours, preserves endpoints and never bridges gaps or extrapolates',()=>{
 const fs=[frame(0,0),frame(1,100)]; assert.equal(interpolate(fs,HALF_HOUR/2)[0].intensity,50);
 assert.equal(interpolate(fs,HALF_HOUR)[0].intensity,100);assert.equal(interpolate(fs,-1).length,0);assert.equal(interpolate(fs,2*HALF_HOUR).length,0);
 assert.equal(interpolate([frame(0,0),frame(2,100)],HALF_HOUR/2)[0].intensity,0); assert.equal(interpolate([frame(0,0),frame(2,100)],HALF_HOUR).length,0);
});
test('best two-hour window requires four contiguous full future intervals, earliest tie wins',()=>{
 const fs=[100,80,20,20,20,20,40].map((n,i)=>frame(i,n));assert.deepEqual(bestWindow(fs,1,0),{from:2*HALF_HOUR,to:6*HALF_HOUR,intensity:20});
 assert.equal(bestWindow(fs.slice(0,3),1,0),null);assert.equal(bestWindow([frame(0,1),frame(1,1),frame(3,1),frame(4,1)],1,0),null);
 assert.equal(bestWindow(fs,1,4*HALF_HOUR),null);assert.equal(bestWindow(fs,2,0),null);
 assert.equal(bestWindow([1,1,1,1,1].map((n,i)=>frame(i,n)),1,0).from,0);
});
test('colour scale clamps and has predictable low, middle, high anchors',()=>{
 assert.deepEqual(colour(0),[135,198,165]);assert.deepEqual(colour(200),[239,195,112]);assert.deepEqual(colour(400),[219,115,88]);assert.deepEqual(colour(-2),colour(0));assert.deepEqual(colour(999),colour(400));
});
