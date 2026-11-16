// Rebuild the portable, offline player from the current editable film.
// No dependencies, server, CDN or runtime file requests are needed by the output.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'四季小猫-独立播放.html');
const inputs=new Map(),modules=new Map(),definitions=[];
const read=async name=>{const bytes=await fs.readFile(path.join(root,name));inputs.set(name,createHash('sha256').update(bytes).digest('hex'));return bytes;};
const imports=/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm;

async function link(source,parent){
 const found=[...source.matchAll(imports)];
 for(const match of found){
  const name=path.posix.normalize(path.posix.join(path.posix.dirname(parent),match[2]));
  if(!match[2].startsWith('.')||name.startsWith('../'))throw new Error('Only local project modules can be bundled: '+name);
  await bundle(name);
  const bindings=match[1].trim().replace(/\b(\w+)\s+as\s+(\w+)\b/g,'$1:$2');
  source=source.replace(match[0],`const {${bindings}}=__modules[${JSON.stringify(name)}];\n`);
 }
 return source;
}
async function bundle(name){
 if(modules.get(name)==='done')return;
 if(modules.has(name))throw new Error('Circular dependency: '+name);
 modules.set(name,'pending');
 let source=(await read(name)).toString('utf8').replace(/^\uFEFF/,'');
 const exports=[...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)].map(m=>m[1]);
 source=await link(source,name);
 source=source.replace(/^export\s+/gm,'');
 if(/^\s*(?:import|export)\s/m.test(source))throw new Error('Unresolved module syntax: '+name);
 definitions.push(`// ${name}\n__modules[${JSON.stringify(name)}]=(()=>{\n${source}\nreturn {${exports.join(',')}};\n})();`);
 modules.set(name,'done');
}

let inner=(await read('seasons.html')).toString('utf8');
const script=inner.match(/<script\s+type="module">([\s\S]*?)<\/script>/);
if(!script)throw new Error('Missing scene module entry.');
let entry=await link(script[1],'seasons.html');
const pointer=JSON.parse((await read('references/pointer-every-frame.json')).toString('utf8'));
const pointerFetch="fetch('references/pointer-every-frame.json').then(r=>r.json())";
if(!entry.includes(pointerFetch))throw new Error('Scene data loading changed; update the standalone linker.');
entry=entry.replace(pointerFetch,'Promise.resolve(__pointer)');
if(/\bfetch\s*\(/.test(entry))throw new Error('An external data dependency is still present.');
const code=`(()=>{\n'use strict';\nconst __modules=Object.create(null);\n${definitions.join('\n')}\nconst __pointer=${JSON.stringify(pointer)};\n${entry}\n})();`;
inner=inner.replace(script[0],'<script>\n'+code.replace(/<\/script/gi,'<\\/script')+'\n</script>');
const audio=(await read('assets/bed.m4a')).toString('base64');
const serialize=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const template=(await read('tools/standalone-player.template.html')).toString('utf8');
const manifest={format:'seasons-offline-player-v1',builtAt:new Date().toISOString(),sourceHashes:Object.fromEntries(inputs)};
const html=template.replace('/*__SCENE_DOCUMENT__*/',serialize(inner))
 .replace('__AUDIO_DATA__','data:audio/mp4;base64,'+audio)
 .replace('/*__BUILD_MANIFEST__*/',serialize(manifest));
if(/__SCENE_DOCUMENT__|__AUDIO_DATA__|__BUILD_MANIFEST__/.test(html))throw new Error('Unresolved player template marker.');
await fs.writeFile(output,html,'utf8');
console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),modules:modules.size,embeddedAudioBytes:Buffer.from(audio,'base64').length,externalDependencies:0},null,2));
