#!/usr/bin/env node
// Headless screenshots of the studio (needs Playwright + Chromium).
//   node tools/screenshot.mjs [outDir] [design...]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const out = process.argv[2] || 'docs/img';
const designs = process.argv.slice(3);
const port = 8765;
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/`);
  const waitSharp = async () => {
    await page.waitForFunction(() => window.studio?.renderer?.program && window.studio.renderer.frame >= window.studio.renderer.maxSamples && !window.studio.renderer.pending, null, { timeout: 240000, polling: 500 });
  };
  const list = designs.length ? designs : ['performer'];
  for (const d of list) {
    await page.selectOption('#preset', d);
    await page.waitForTimeout(600);
    await waitSharp();
    await page.screenshot({ path: `${out}/${d}.png`, timeout: 180000 });
    console.log('saved', `${out}/${d}.png`);
  }
} finally {
  await browser.close();
  server.kill();
}
