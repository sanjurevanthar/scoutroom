import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generouted from '@generouted/react-router/plugin'
import { cloudflare } from '@cloudflare/vite-plugin'
import checker from 'vite-plugin-checker'
import { deepspaceBuild } from 'deepspace/build'
import { prerender } from './prerender.ts'

const appDir = fileURLToPath(new URL('.', import.meta.url))
const testMode = process.env.SCOUTROOM_FAKE_PROVIDERS === '1'
// Test runs get their own empty storage. Before this, every run added rooms for the same two test
// accounts to .wrangler/state; past ~100 rooms the SDK's team-read query hits SQLite's 100-variable
// limit and random e2e tests fail with "Connecting..." (docs/design/11, R12). Fresh storage also
// keeps tests away from your real dev data.
// SCOUTROOM_REAL=1 (manual real-integration run) also gets fresh storage, with real providers.
const testStatePath = testMode || process.env.SCOUTROOM_REAL === '1' ? mkdtempSync(join(tmpdir(), 'scoutroom-test-state-')) : undefined

export default defineConfig({
  plugins: [
    react(),
    generouted(),
    // The Cloudflare plugin otherwise searches for a free inspector port by
    // enumerating every network interface. Restricted agent containers can
    // reject that OS call (`uv_interface_addresses`) even when loopback is
    // available. Inspector debugging is optional, so disable that probe in
    // the generated app and keep local dev/test startup deterministic.
    cloudflare({
      inspectorPort: false,
      ...(testStatePath ? { persistState: { path: testStatePath } } : {}),
      // Automated tests set SCOUTROOM_FAKE_PROVIDERS=1 (tests/playwright.config.ts): the worker then
      // gets fake AI/search providers and never calls Groq, OpenAlex or Wikipedia. Unset otherwise,
      // so dev, build and deploy keep the real providers from wrangler.toml.
      config: (config) =>
        testMode
          ? { vars: { ...config.vars, LLM_PROVIDER: 'fake', SEARCH_PROVIDER: 'fake', STALE_RUN_MS: '3000' } }
          : {},
    }),
    // The app id `define`, the preview-secret cleanup, and the client dedupe
    // hint — all shipped by the SDK so a fix to any of them arrives with a
    // version bump, not an app edit. The app id is read from the wrangler
    // config THIS build targets (wrangler.toml, or the env-flattened config
    // `deepspace deploy --env` generates); src/constants.ts is the only
    // consumer.
    deepspaceBuild({ appDir }),
    // Prerenders the public pages listed in src/prerender-entry.tsx into static
    // HTML at `vite build`, stamps their <Seo> head, and writes sitemap.xml plus
    // the robots.txt Sitemap line from src/seo.ts — so crawlers that do not run
    // JavaScript read real content. See prerender.ts; delete this line for a
    // plain SPA.
    prerender(),
    // Runs the Rules of Hooks lint (see eslint.config.js) automatically, so
    // there's no separate step to remember: a violation surfaces as an overlay
    // during `deepspace dev start` and fails the build during `deepspace deploy`.
    // That stops the cryptic "Minified React error #310 / #300" crash before
    // it can ship.
    checker({
      eslint: {
        lintCommand: 'eslint .',
        useFlatConfig: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    // generouted loads routes via `import.meta.glob`, which Vite's esbuild dep-scanner
    // does not evaluate — so every dep reachable only through the page tree (UI libs,
    // and deepspace via _app.tsx) is invisible to the cold scan, discovered late, and
    // triggers a re-optimize + full reload on first `dev` boot. That reload is where a
    // transient "Cannot read properties of null (reading 'useState')" can surface before
    // the error boundary recovers. Point the scanner at the route files (plus the html
    // entry) so the first optimize pass is complete and no late re-optimize fires.
    // Scoped to src/pages (NOT all of src) so worker-only modules — actions, cron, jobs,
    // ai, which import deepspace/worker — are not dragged into the client optimizer.
    // Dev-only; `vite build` ignores optimizeDeps.
    entries: ['./index.html', './src/pages/**/*.tsx'],
  },
})
