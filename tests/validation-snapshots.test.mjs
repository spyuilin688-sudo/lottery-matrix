import test from 'node:test';
import assert from 'node:assert/strict';
import {packValidation,unpackValidation,compactValidation,unpackCompact} from '../scripts/experiments/validation-snapshots.mjs';
const source={sourcePeriod:'001',sourceNumbers:[1,'02',null],sourceSortedNumbers:['01','02'],sourceDrawOrderNumbers:null,referencePeriod:'000',referenceNumbers:[9],baseNumber:2,extra:{nested:[]}};
const original={itemId:'a',sourceA:source,ruleSets:[{rules:[{value:3}],historicalValidation:[{...source,success:true,hitNumbers:[4]}]}]};
test('shared source data restores full validation including types, order and missing keys',()=>{
 const dict=new Map();const a=packValidation(original,'539:v1',dict);
 const b=packValidation({...original,itemId:'b'},'539:v1',dict);
 assert.equal(dict.size,2);
 const entries=new Map([...dict.values()].map(e=>[e.id,e]));
 assert.deepEqual(unpackValidation(a,'539:v1',entries),original);
 assert.deepEqual(unpackValidation(b,'539:v1',entries),{...original,itemId:'b'});
 assert.deepEqual(original.sourceA,source);
});
test('corrected numbers and different lottery/version never substitute original snapshot',()=>{
 const dict=new Map();const a=packValidation(original,'539:v1',dict);
 const corrected=structuredClone(original);corrected.sourceA.sourceNumbers=[99];
 const b=packValidation(corrected,'539:v1',dict);
 packValidation(original,'649:v1',dict);
 const entries=new Map([...dict.values()].map(e=>[e.id,e]));
 assert.deepEqual(unpackValidation(a,'539:v1',entries),original);
 assert.deepEqual(unpackValidation(b,'539:v1',entries),corrected);
 assert.throws(()=>unpackValidation(a,'649:v1',entries),/MISSING/);
 entries.delete(a.refs[0][2]);assert.throws(()=>unpackValidation(a,'539:v1',entries),/MISSING/);
});
test('unknown fields, empty rule sets and null values survive',()=>{
 for(const original of [{sourceA:null,ruleSets:[]},{sourceA:{sourcePeriod:null,sourceNumbers:null,custom:1},ruleSets:[{historicalValidation:[]}]},{other:true}]){
  const dict=new Map(),packed=packValidation(original,'v',dict);
  assert.deepEqual(unpackValidation(packed,'v',new Map([...dict.values()].map(e=>[e.id,e]))),original);
 }
});

test('compact references independently reconstruct mixed shared/inline and missing fields',()=>{
 const mixed={sourceA:{sourcePeriod:'x',sourceNumbers:null},ruleSets:[{historicalValidation:[{},source,{referencePeriod:'y',referenceNumbers:[]}]}]};
 const dict=new Map(),packed=packValidation(mixed,'v',dict),entries=new Map([...dict.values()].map(e=>[e.id,e]));
 for(const threshold of [1,2,4]) {
  const compact=compactValidation(packed,entries,threshold,new Map([[1,5],[2,2]]));
  assert.deepEqual(unpackCompact(compact,'v',entries),mixed);
  assert.throws(()=>unpackCompact({...compact,refs:compact.refs.slice(1)},'v',entries),/REFERENCE_COUNT/);
 }
});
