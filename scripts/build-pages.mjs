// Export only the static game, not the server, database, tests or deployment config.
import { mkdir, copyFile, rm, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(root,'dist');
const files=['index.html','app.mjs','style.css','sw.js','manifest.webmanifest','icon.svg','shared/engine.mjs','shared/storage.mjs','legacy/index.html','icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png','.nojekyll'];
await rm(target,{recursive:true,force:true});
for(const file of files){await mkdir(dirname(resolve(target,file)),{recursive:true});await copyFile(resolve(root,file),resolve(target,file));}
// Check local module imports from the published app and shared modules.
for(const file of files.filter(f=>f.endsWith('.mjs'))){
  const text=await readFile(resolve(target,file),'utf8');
  for(const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)){
    if(!match[1].startsWith('.'))throw Error('External module in static export: '+match[1]);
    await stat(resolve(dirname(resolve(target,file)),match[1]));
  }
}
console.log(`GitHub Pages export: ${files.length} files. Public URL: https://xairon.github.io/hexa-sort/`);
