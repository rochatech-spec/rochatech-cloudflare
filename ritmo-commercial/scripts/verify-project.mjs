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
const storage = read('src/services/authStorage.ts');
const device = read('src/services/nativeDevice.ts');
const schema = read('schema.sql');
const vite = read('vite.config.ts');
const pkg = read('package.json');
const wrangler = read('wrangler.jsonc');

for (const token of ['TODO', 'FIXME', 'https://unpkg.com']) {
  assert.equal([app, css, worker, api, vite].some((x) => x.includes(token)), false, `Marcador proibido: ${token}`);
}

for (const required of [
  "id='loginPage'",
  "id='modalBackdrop'",
  "id='fabMenu'",
  "id='loginUser'",
  "id='biometricLogin'",
  "id='bottomNav'",
  "data-action='logout'",
]) assert.ok(app.includes(required), `Elemento essencial ausente: ${required}`);

assert.ok(app.includes('Lembrar usuário neste aparelho'), 'Opção de lembrar usuário ausente.');
assert.ok(app.includes('saveRememberedUsername'), 'Persistência do usuário lembrado ausente.');
assert.ok(app.includes('async function optimistic'), 'Arquitetura Optimistic UI ausente.');
assert.ok(app.includes('dataRef.current=snapshot'), 'Rollback otimista ausente.');
assert.ok(app.includes("window.setInterval(()=>void sync(),90000)"), 'Sincronização periódica leve ausente.');
assert.ok(app.includes("window.addEventListener('focus',onFocus)"), 'Sincronização ao focar ausente.');
assert.ok(app.includes("window.addEventListener('online',onOnline)"), 'Sincronização ao reconectar ausente.');
assert.ok(app.includes("document.addEventListener('visibilitychange',onVisibility)"), 'Sincronização ao voltar ao app ausente.');
assert.equal(app.includes('sheetOpen'), false, 'Menu mobile duplicado ainda existe.');
assert.equal(app.includes("id='mobileSync'"), false, 'Sincronização manual mobile redundante ainda existe.');
assert.equal(app.includes("modal.kind==='privacy'"), false, 'Modal genérico de privacidade ainda existe.');
assert.equal(app.includes("modal.kind==='categories'"), false, 'Modal genérico de categorias ainda existe.');

assert.equal(pkg.includes('@tauri-apps/'), false, 'Dependência Tauri ainda presente.');
assert.equal(pkg.includes('"android:build"'), false, 'Script Android ainda presente.');
assert.equal(api.includes('@tauri-apps/'), false, 'Cliente HTTP ainda contém Tauri.');
assert.equal(storage.includes('@tauri-apps/'), false, 'Storage ainda contém Tauri.');
assert.equal(device.includes('@tauri-apps/'), false, 'Recursos de dispositivo ainda contêm Tauri.');
assert.equal(api.includes('@capacitor/'), false, 'Cliente ainda contém Capacitor.');
assert.equal(device.includes('@capacitor/'), false, 'Recursos de dispositivo ainda contêm Capacitor.');
assert.ok(api.includes("const API_URL = (import.meta.env.VITE_API_URL || '/api')"), 'API PWA deve usar mesmo domínio por padrão.');
assert.ok(api.includes('X-Idempotency-Key'), 'Cliente sem idempotência.');

for (const route of [
  '/auth/register','/auth/register/confirm','/auth/login','/auth/device/verify','/auth/recover',
  '/auth/passkeys','/bootstrap','/transactions','/debts','/goals','/events','/files','/health'
]) assert.ok(worker.includes(route), `Rota ausente: ${route}`);

for (const table of [
  'auth_rate_limits','users','trusted_devices','passkeys','transactions','debts','debt_payments',
  'goals','goal_contributions','events','push_subscriptions','files','idempotency_keys'
]) assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Tabela ausente: ${table}`);

assert.ok(worker.includes('RECOVERY_PEPPER'), 'Recuperação sem segredo de servidor.');
assert.ok(worker.includes("'USERNAME_IMMUTABLE'"), 'Username deve permanecer imutável.');
assert.ok(worker.includes('FILES_KV: KVNamespace'), 'FILES_KV ausente.');
assert.ok(worker.includes('env.FILES_KV.put') && worker.includes('env.FILES_KV.get') && worker.includes('env.FILES_KV.delete'), 'Fluxo de arquivos KV incompleto.');
assert.ok(wrangler.includes('"binding": "FILES_KV"'), 'Binding FILES_KV ausente.');

assert.ok(vite.includes("navigateFallbackDenylist: [/^\\/api\\//]"), 'Service Worker não deve interceptar API.');
assert.ok(vite.includes('ritmo-data-post-queue'), 'Fila de Background Sync ausente.');
assert.equal(vite.includes('ritmo-bootstrap-offline'), false, 'Bootstrap autenticado não deve ser cacheado.');

assert.ok(css.includes('RITMO • MOBILE MODAL VIEWPORT LOCK'), 'Correção de viewport mobile ausente.');
assert.ok(css.includes('RITMO • PREMIUM LITE PWA FINAL'), 'Camada Premium Lite ausente.');
assert.ok(css.includes('place-items:center!important'), 'Modal mobile não está centralizado.');
assert.ok(css.includes('.remember-login-row'), 'Estilo do login lembrado ausente.');
assert.ok(css.includes('.logout-card'), 'Sair deve ser uma seção final isolada.');

console.log('OK: Ritmo PWA validado: leve, optimistic, passkey, push, viewport mobile e UX Premium Lite.');
