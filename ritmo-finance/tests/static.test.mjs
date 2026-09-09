import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('PWA manifest is installable', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'))
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'))
})

test('service worker never caches private API calls', async () => {
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/)
})

test('Cloudflare bindings are declared', async () => {
  const wrangler = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8')
  assert.match(wrangler, /binding = "DB"/)
  assert.match(wrangler, /binding = "R2"/)
})
