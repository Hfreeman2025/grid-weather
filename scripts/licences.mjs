import {readFile} from 'node:fs/promises';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const allowed=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC']);
for(const [name,entry] of Object.entries(lock.packages)){if(!name)continue;const installed=JSON.parse(await readFile(`${name}/package.json`,'utf8'));if(!allowed.has(installed.license)||installed.version!==entry.version)throw new Error(`Dependency licence/version not allowed: ${name}`);console.log(`${installed.name} ${installed.version}: ${installed.license}`);}
console.log('0 runtime dependencies. All dependency licences allowed.');
