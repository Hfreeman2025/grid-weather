import{test}from'node:test';import assert from'node:assert/strict';import{midpoint}from'../src/advection.ts';
test('midpoint tracer uses metres per second over projected kilometres, with no fake carbon flow',()=>{const p=midpoint([100,100],3600,()=>[10,0]);assert.deepEqual(p,[136,100]);});
test('RK2 samples the midpoint velocity rather than using an Euler endpoint',()=>{const p=midpoint([1,0],.1,(x)=>[1000*x,0]);assert.ok(Math.abs(p[0]-1.105)<1e-12);assert.equal(midpoint([1,1],1,()=>null),null);assert.throws(()=>midpoint([0,0],-1,()=>[1,1]));});
