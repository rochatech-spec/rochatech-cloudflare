import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
await mkdir('dist',{recursive:true})
await copyFile('worker/index.js','dist/_worker.js')
const pkg=JSON.parse(await readFile('package.json','utf8'))
await writeFile('dist/version.json',JSON.stringify({name:'Ritmo',version:pkg.version,built_at:new Date().toISOString()},null,2))
