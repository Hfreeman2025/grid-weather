import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import{parseWeather}from'../src/weather.ts';import{parseBoundaries}from'../src/geometry.ts';import{areaWeather}from'../src/area-weather.ts';import{regionalAt}from'../src/weather-stories.ts';
let weatherRows;
function weather(){if(!weatherRows)weatherRows=areaWeather(parseWeather(JSON.parse(readFileSync('public/weather.json'))),parseBoundaries(JSON.parse(readFileSync('public/boundaries.json')))).rows;return weatherRows;}
export function checkEvidence(model, facts) {
 const raw = facts.filter(f => f.field !== 'mean');
 for (const f of raw) {
  if(f.field==='windSpeed'||f.field==='sunlight'){const w=regionalAt(weather(),f.at,f.region);assert.ok(w);assert.ok(Math.abs(f.value-w[f.field==='windSpeed'?0:4])<1e-8);continue;}
  const frame = model.frames.find(t => t.from === f.at);
  const r = f.region === 18 ? frame?.gb : frame?.regions.find(r => r.id === f.region);
  assert.ok(r, `Source region ${f.region} at ${f.at}`);
  assert.equal(f.value, f.field === 'intensity' ? r.intensity : r.mix[f.field]);
 }
 const mean = facts.find(f => f.field === 'mean');
 if (mean) {
  assert.equal(raw.length, 4);
  assert.ok(raw.every((f, i) => f.at === raw[0].at + i * 1800000 && f.region === mean.region));
  assert.equal(mean.value, raw.reduce((a, f) => a + f.value, 0) / 4);
 }
}
