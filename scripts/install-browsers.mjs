import{checkDisk}from'./disk-guard.mjs';import{createRequire}from'node:module';import{dirname,resolve}from'node:path';import{mkdir}from'node:fs/promises';import{existsSync}from'node:fs';import{homedir}from'node:os';import{execFileSync}from'node:child_process';
const missing=[['webkit','webkit-2359/pw_run.sh'],['firefox','firefox-1543/firefox/Nightly.app/Contents/MacOS/firefox']].filter(([,p])=>!existsSync(resolve(homedir(),'Library/Caches/ms-playwright',p))&&!existsSync(resolve('.cache/browsers',p))).map(([name])=>name);
if(!missing.length){console.log('Exact supported browser builds already exist; no download.');}else{
 await checkDisk(1024**3);const require=createRequire('<local path>');await mkdir('.cache/browser',{recursive:true});execFileSync(process.execPath,[resolve(dirname(require.resolve('playwright/package.json')),'cli.js'),'install',...missing],{stdio:'inherit',env:{...process.env,TMPDIR:resolve('.cache/browser'),PLAYWRIGHT_BROWSERS_PATH:resolve('.cache/browsers')}});
}
