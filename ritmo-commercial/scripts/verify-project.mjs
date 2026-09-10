import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('src/App.tsx');
const css = read('src/styles.css');
const worker = read('src/worker.ts');
const api = read('src/services/api.ts');
const schema = read('schema.sql');
const vite = read('vite.config.ts');
const wrangler = read('wrangler.jsonc');
const original = read('reference/ritmo_comercial_leve.html');

const body = original.match(/<body[^>]*>([\s\S]*?)<script[\s>]/i)?.[1] || '';
const originalIds = [...body.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
const missingIds = originalIds.filter((id) => !new RegExp(`\\bid=["']${id.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}["']`).test(app));
assert.equal(new Set(originalIds).size, originalIds.length, 'O HTML original possui IDs duplicados.');
assert.deepEqual(missingIds, [], `IDs estáticos ausentes no App.tsx: ${missingIds.join(', ')}`);

for (const token of ['TODO', 'FIXME', 'https://unpkg.com']) {
  assert.equal([app, css, worker, api, vite].some((x) => x.includes(token)), false, `Marcador proibido encontrado: ${token}`);
}

for (const required of [
  "id='loginPage' onClick={handleClick} onInput={handleInput} onChange={handleInput}",
  "id='modalBackdrop' className={`modal-backdrop ${modal ? \"show\" : \"\"}`.trim()} onClick={handleClick}",
  "id='sheetBackdrop' className={`sheet-backdrop ${sheetOpen ? \"show\" : \"\"}`.trim()} onClick={handleClick}",
  "id='fabMenu' onClick={handleClick}",
]) assert.ok(app.includes(required), `Zona interativa sem handler React: ${required}`);

for (const required of [
  "case 'forgotBtn':setAuthView('recover')",
  "case 'authorizeDeviceBtn':await authorizeDevice()",
  "id='recoveryCodeView'",
  "id='recoverAccessView'",
  "id='newDeviceView'",
  'modalRecoveryCode',
]) assert.ok(app.includes(required), `Fluxo de autenticação incompleto: ${required}`);

for (const required of [
  "body.auth-active #appShell{display:none!important;pointer-events:none!important;user-select:none!important}",
  'body.auth-active #modalBackdrop,body.auth-active #sheetBackdrop,body.auth-active #globalFab{display:none!important}',
  '.modal-backdrop.show{display:flex!important;pointer-events:auto!important}',
]) assert.ok(css.includes(required), `Patch de camadas/transição ausente: ${required}`);

assert.ok(api.includes("Capacitor.isNativePlatform() ? 'https://ritmo-commercial.pages.dev/api' : '/api'"), 'API do APK não possui fallback seguro para Cloudflare.');
assert.ok(api.includes("X-Idempotency-Key"), 'Cliente sem chave de idempotência.');
for (const route of ['/auth/register','/auth/register/confirm','/auth/login','/auth/device/verify','/auth/recover','/auth/passkeys','/bootstrap','/transactions','/debts','/goals','/events','/files','/health']) {
  assert.ok(worker.includes(route), `Rota obrigatória ausente: ${route}`);
}
for (const table of ['auth_rate_limits','users','trusted_devices','passkeys','transactions','debts','goals','events','push_subscriptions','files','idempotency_keys']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Tabela obrigatória ausente: ${table}`);
}
assert.ok(vite.includes("navigateFallbackDenylist: [/^\\/api\\//]"), 'Service Worker pode interceptar API com fallback de navegação.');
assert.ok(vite.includes('ritmo-data-post-queue'), 'Background Sync de dados não configurado.');
const native = read('src/services/nativeDevice.ts');
const storage = read('src/services/authStorage.ts');
for (const plugin of ['@capacitor/camera','@capacitor/geolocation','@capacitor/share','@capacitor/local-notifications']) {
  assert.ok(native.includes(plugin), `Integração nativa ausente: ${plugin}`);
}
assert.ok(storage.includes('@aparajita/capacitor-secure-storage'), 'Tokens nativos não estão no armazenamento seguro.');
assert.ok(worker.includes('RECOVERY_PEPPER'), 'Código de recuperação não usa segredo de servidor.');
assert.ok(worker.includes("'NEW_DEVICE_RECOVERY_REQUIRED'") || worker.includes("requiresDeviceVerification:true"), 'Fluxo de novo aparelho não exige verificação.');
console.log(`OK: ${originalIds.length} IDs estáticos preservados; autenticação, camadas, API, banco e PWA validados estaticamente.`);


assert(worker.includes('FILES_KV: KVNamespace'), 'Worker deve usar FILES_KV para arquivos.');
assert(worker.includes("env.FILES_KV.put"), 'Upload deve gravar no Workers KV.');
assert(worker.includes("env.FILES_KV.get"), 'Download deve ler do Workers KV.');
assert(worker.includes("env.FILES_KV.delete"), 'Exclusão deve remover do Workers KV.');
assert(!worker.includes('R2Bucket'), 'R2 não deve ser obrigatório no Worker.');
assert(wrangler.includes('"binding": "FILES_KV"'), 'wrangler.jsonc deve declarar FILES_KV.');

assert(css.includes('RITMO • MOBILE TRUE CENTER FINAL'), 'Patch final de centralização mobile ausente.');
assert(css.includes('box-sizing:border-box!important'), 'Modal mobile deve usar border-box.');
assert(css.includes('place-items:center!important'), 'Overlay mobile deve centralizar pelo viewport.');


assert(app.includes("window.setInterval(()=>void sync(),30000)"), 'Sincronização periódica multiaparelho ausente.');
assert(app.includes("window.addEventListener('focus',onFocus)"), 'Sincronização ao focar a aplicação ausente.');
assert(app.includes("window.addEventListener('online',onOnline)"), 'Sincronização ao reconectar ausente.');
assert(app.includes("document.addEventListener('visibilitychange',onVisibility)"), 'Sincronização ao voltar para primeiro plano ausente.');
assert(!vite.includes("ritmo-bootstrap-offline"), 'Bootstrap autenticado não deve ser cacheado entre sessões.');
assert(worker.includes("username:pr.username"), 'Bootstrap deve sincronizar o username real.');
