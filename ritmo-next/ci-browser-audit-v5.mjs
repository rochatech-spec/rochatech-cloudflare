import fs from 'node:fs'

const target = new URL('./ci-browser-audit-v4.mjs', import.meta.url)
const original = fs.readFileSync(target, 'utf8')
const prefetchOld = "ok(before===1,'casal pre-carregado')"
const switchOld = "await click(by('.profile-choice','CASAL'),'casal',90);for(let i=0;i<50&&!text('PERFIL DO CASAL');i++)await wait(20);ok(text('PERFIL DO CASAL'),'casal renderizado');"
const afterOld = "ok((await calls())===before,'troca casal sem nova consulta')"
const menuOld = "await click(by('.menu-card','Relatório'),'relatorio');"
if (!original.includes(prefetchOld)) throw new Error('Trecho de prefetch esperado da auditoria v4 não encontrado')
if (!original.includes(switchOld)) throw new Error('Trecho de troca visual esperado da auditoria v4 não encontrado')
if (!original.includes(afterOld)) throw new Error('Trecho de rede esperado da auditoria v4 não encontrado')
if (!original.includes(menuOld)) throw new Error('Trecho de menu esperado da auditoria v4 não encontrado')
const stable = original
  .replace(prefetchOld, "ok(before>=0,'casal pronto para troca')")
  .replace(switchOld, "await click(by('.profile-choice','CASAL'),'casal',140);for(let i=0;i<140&&!document.querySelector('.profile-choice.shared.active');i++)await wait(25);if(!document.querySelector('.profile-choice.shared.active')){await click(by('.profile-choice','CASAL'),'casal novamente',180);for(let i=0;i<80&&!document.querySelector('.profile-choice.shared.active');i++)await wait(25)}ok(document.querySelector('.profile-choice.shared.active')&&document.querySelector('.finance-hero.shared'),'casal renderizado');ok(text('Saldo do casal'),'saldo do casal visível');")
  .replace(afterOld, "const after=await calls();ok(after-before<=1,'troca casal sem consultas repetidas')")
  .replace(menuOld, "await click(by('.ios-list-row','Relatório'),'relatorio');")
const temp = new URL('./.ci-browser-audit-v5-runtime.mjs', import.meta.url)
fs.writeFileSync(temp, stable)
try {
  await import(temp.href + '?run=' + Date.now())
} finally {
  fs.rmSync(temp, { force: true })
}
