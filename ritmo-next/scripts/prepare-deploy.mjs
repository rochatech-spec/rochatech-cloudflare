import { copyFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd()
const dist=path.join(root,'dist')
const worker=path.join(root,'worker','current-worker.js')
const target=path.join(dist,'_worker.js')

const workerStat=await stat(worker)
if(workerStat.size<10000)throw new Error('Worker de compatibilidade ausente ou incompleto')
await copyFile(worker,target)

const version={
  app:'Ritmo',
  architecture:'react-typescript-vite-offline-first',
  built_at:new Date().toISOString(),
}
await writeFile(path.join(dist,'version.json'),JSON.stringify(version),'utf8')
console.log(`Worker preparado no dist (${workerStat.size} bytes).`)
