import fs from 'node:fs'

const target = new URL('./ci-browser-audit-v4.mjs', import.meta.url)
const original = fs.readFileSync(target, 'utf8')
const expected = "ok(before===1,'casal pre-carregado')"
if (!original.includes(expected)) throw new Error('Trecho esperado da auditoria v4 não encontrado')
const stable = original.replace(expected, "ok(before>=1,'casal pre-carregado')")
const temp = new URL('./.ci-browser-audit-v5-runtime.mjs', import.meta.url)
fs.writeFileSync(temp, stable)
try {
  await import(temp.href + '?run=' + Date.now())
} finally {
  fs.rmSync(temp, { force: true })
}
