import { readFile, writeFile, readdir, statfs, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const files = [];
async function walk(path) {
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = path + '/' + e.name;
    if (e.isDirectory()) await walk(p);
    else {
      const b = await readFile(p);
      files.push({
        path: p,
        bytes: b.length,
        gzipBytes: gzipSync(b).length,
        sha256: createHash('sha256').update(b).digest('hex'),
      });
    }
  }
}
await walk('dist');
await mkdir('test-results', { recursive: true });
const disk = await statfs('.');
const result = {
  measuredAt: new Date().toISOString(),
  buildFiles: files,
  shippedJavaScriptGzipBytes: files
    .filter((f) => f.path.endsWith('.js'))
    .reduce((s, f) => s + f.gzipBytes, 0),
  staticBytes: files.reduce((s, f) => s + f.bytes, 0),
  freeDiskBytes: disk.bavail * disk.bsize,
  pretrainedWeightDownloadsBytes: 0,
  dependencies: 'TypeScript, Playwright and Prettier development tools; zero runtime packages',
  notes:
    'Per-file gzip sizes; actual static server has no compression. Snapshot, weather and model sources are dated; source preparation network totals are separately recorded in data/v3-sources.json.',
};
await writeFile('test-results/build-report.json', JSON.stringify(result, null, 2));
console.log({
  staticBytes: result.staticBytes,
  jsGzipBytes: result.shippedJavaScriptGzipBytes,
  freeGiB: result.freeDiskBytes / 1024 ** 3,
});
