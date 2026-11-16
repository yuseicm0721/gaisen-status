import {readFile,writeFile,mkdir} from 'node:fs/promises';
// These two local modules have no runtime dependencies. Keep a single-file
// deployment artifact for Cloudflare's dashboard editor.
const model=await readFile('src/monitor-state.js','utf8');
const worker=(await readFile('src/worker.js','utf8')).replace(/^import .*;\r?\n/gm,'');
await mkdir('dist',{recursive:true});
await writeFile('dist/worker.js',model+'\n'+worker);
