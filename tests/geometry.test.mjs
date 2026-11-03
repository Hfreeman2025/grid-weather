import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareBoundaries, parseBoundaries, simplify } from '../src/geometry.ts';
const raw=JSON.parse(readFileSync(new URL('../data/boundaries-source.geojson',import.meta.url)));
test('official geometry simplifies substantially, preserving 14 regions and all closed rings',()=>{
 const result=prepareBoundaries(raw);assert.equal(result.before,59707);assert.ok(result.after<15000);assert.ok(result.after>1000);assert.equal(result.boundaries.length,14);assert.equal(parseBoundaries(result.boundaries).length,14);
 for(const b of result.boundaries)for(const ring of b.rings){assert.ok(ring.length>=4);assert.deepEqual(ring[0],ring.at(-1));}
});
test('simplification removes collinear vertices and preserves a corner',()=>{assert.deepEqual(simplify([[0,0],[1,0],[2,0],[2,2]],0.1),[[0,0],[2,0],[2,2]]);});
test('geometry parser rejects incorrect CRS, unknown region and open rings',()=>{
 const bad=structuredClone(raw);bad.crs.properties.name='EPSG:4326';assert.throws(()=>prepareBoundaries(bad));
 const bad2=structuredClone(raw);bad2.features[0].properties.Name='unknown';assert.throws(()=>prepareBoundaries(bad2));
 const bad3=structuredClone(raw);bad3.features[0].geometry.coordinates[0][0].pop();assert.throws(()=>prepareBoundaries(bad3));
});
