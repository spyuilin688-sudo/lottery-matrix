// Candidate representation only; not used by production readers or writers.
const prefixes = ['source', 'reference'];
const suffixes = ['Period', 'Numbers', 'SortedNumbers', 'DrawOrderNumbers'];
export function packValidation(original, scope, dictionary) {
  const validation = structuredClone(original);
  const refs = [];
  function packNode(node, path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const prefix of prefixes) {
      const fields = suffixes.filter(s => Object.hasOwn(node, prefix + s));
      if (!fields.includes('Period') || fields.length < 2) continue;
      const body = Object.fromEntries(fields.map(s => [s, node[prefix + s]]));
      const key = JSON.stringify([scope, body]);
      let entry = dictionary.get(key);
      if (!entry) {
        entry = {id: dictionary.size + 1, scope, body};
        dictionary.set(key, entry);
      }
      refs.push([path, prefix, entry.id]);
      for (const s of fields) delete node[prefix + s];
    }
  }
  packNode(validation?.sourceA, ['sourceA']);
  if (Array.isArray(validation?.ruleSets)) validation.ruleSets.forEach((rs, i) => {
    if (Array.isArray(rs?.historicalValidation)) rs.historicalValidation.forEach((row, j) => {
      packNode(row, ['ruleSets', String(i), 'historicalValidation', String(j)]);
    });
  });
  return {validation, refs};
}
export function unpackValidation(packed, scope, entries) {
  const validation = structuredClone(packed.validation);
  for (const [path, prefix, id] of packed.refs) {
    const entry = entries.get(id);
    if (!entry || entry.scope !== scope) throw new Error('VALIDATION_SNAPSHOT_MISSING');
    let node = validation;
    for (const key of path) node = node[key];
    for (const [suffix, value] of Object.entries(entry.body)) {
      if (Object.hasOwn(node, prefix + suffix)) throw new Error('VALIDATION_SNAPSHOT_CONFLICT');
      node[prefix + suffix] = structuredClone(value);
    }
  }
  return validation;
}
function nodesOf(validation) {
  const nodes=[];
  if(validation?.sourceA && typeof validation.sourceA==='object' && !Array.isArray(validation.sourceA)) nodes.push(validation.sourceA);
  if(Array.isArray(validation?.ruleSets)) for(const rs of validation.ruleSets) if(Array.isArray(rs?.historicalValidation)) for(const node of rs.historicalValidation) if(node && typeof node==='object' && !Array.isArray(node)) nodes.push(node);
  return nodes;
}
export function compactValidation(packed, entries, minimumUses=1, usage=new Map()) {
  const validation=structuredClone(packed.validation);
  const byNode=new Map();
  for(const [path,prefix,id] of packed.refs){
    let node=validation;for(const key of path)node=node[key];
    if((usage.get(id)??1)<minimumUses){for(const [key,value] of Object.entries(entries.get(id).body))node[prefix+key]=structuredClone(value);}
    else{if(!byNode.has(node))byNode.set(node,{});byNode.get(node)[prefix]=id;}
  }
  return {validation,refs:nodesOf(validation).flatMap(node=>prefixes.map(prefix=>byNode.get(node)?.[prefix]??0))};
}
export function unpackCompact(packed, scope, entries) {
  const validation=structuredClone(packed.validation),nodes=nodesOf(validation);
  if(packed.refs.length!==nodes.length*2)throw new Error('VALIDATION_REFERENCE_COUNT');
  let index=0;
  for(const node of nodes)for(const prefix of prefixes){
    const id=packed.refs[index++];if(id===0)continue;
    const entry=entries.get(id);
    if(!entry || entry.scope!==scope)throw new Error('VALIDATION_SNAPSHOT_MISSING');
    for(const [suffix,value] of Object.entries(entry.body)){
      if(Object.hasOwn(node,prefix+suffix))throw new Error('VALIDATION_SNAPSHOT_CONFLICT');
      node[prefix+suffix]=structuredClone(value);
    }
  }
  return validation;
}
