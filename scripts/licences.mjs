import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const allowed = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']);
for (const [name, entry] of Object.entries(lock.packages)) {
  if (!name) continue;
  let installed;
  try {
    installed = JSON.parse(await readFile(`${name}/package.json`, 'utf8'));
  } catch (error) {
    if (entry.optional && error.code === 'ENOENT') continue;
    throw error;
  }
  if (!allowed.has(installed.license) || installed.version !== entry.version)
    throw new Error(`Dependency licence/version not allowed: ${name}`);
  console.log(`${installed.name} ${installed.version}: ${installed.license}`);
}
console.log('0 runtime dependencies. All dependency licences allowed.');

const fonts = JSON.parse(await readFile('public/fonts/manifest.json', 'utf8'));
if (fonts.version !== '5.3.0' || fonts.files.length !== 8)
  throw new Error('Unexpected Plex font set');
for (const face of fonts.files) {
  if (
    !/^ibm-plex-(?:sans|mono|sans-condensed)-latin-(?:400|500|600)-(?:normal|italic)\.woff2$/.test(
      face.file,
    ) ||
    face.license !== 'SIL OFL 1.1' ||
    face.version !== '5.3.0'
  )
    throw new Error('Unapproved font asset');
  const bytes = await readFile('public/fonts/' + face.file);
  if (
    bytes.toString('ascii', 0, 4) !== 'wOF2' ||
    bytes.length !== face.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== face.sha256
  )
    throw new Error('Font integrity mismatch: ' + face.file);
}
for (const family of ['sans', 'mono', 'sans-condensed']) {
  const body = await readFile('public/fonts/OFL-ibm-plex-' + family + '.txt', 'utf8');
  const original = fonts.licenses.find((l) => l.family === 'ibm-plex-' + family);
  if (
    !body.includes('SIL Open Font License, Version 1.1') ||
    !original ||
    createHash('sha256').update(body).digest('hex') !== original.sha256
  )
    throw new Error('Missing or changed original font licence');
}
console.log(
  '8 self-hosted Plex latin faces, @fontsource5.3.0: SIL OFL1.1; hashes and original licences verified.',
);
