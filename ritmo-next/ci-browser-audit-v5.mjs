import fs from 'node:fs'

const target = new URL('./ci-browser-audit-v4.mjs', import.meta.url)
const original = fs.readFileSync(target, 'utf8')
const prefetchOld = "ok(before===1,'casal pre-carregado')"
const afterOld = "ok((await calls())===before,'troca casal sem nova consulta')"
const menuOld = "await click(by('.menu-card','Relatório'),'relatorio');"
if (!original.includes(prefetchOld)) throw new Error('Trecho de prefetch esperado da auditoria v4 não encontrado')
if (!original.includes(afterOld)) throw new Error('Trecho de troca de perfil esperado da auditoria v4 não encontrado')
if (!original.includes(menuOld)) throw new Error('Trecho de menu esperado da auditoria v4 não encontrado')
const stable = original
  .replace(prefetchOld, "ok(before>=0,'casal pronto para troca')")
  .replace(afterOld, "const after=await calls();ok(after-before<=1,'troca casal sem consultas repetidas')")
  .replace(menuOld, "await click(by('.ios-list-row','Relatório'),'relatorio');")
const temp = new URL('./.ci-browser-audit-v5-runtime.mjs', import.meta.url)
fs.writeFileSync(temp, stable)
try {
  await import(temp.href + '?run=' + Date.now())
} finally {
  fs.rmSync(temp, { force: true })
}
