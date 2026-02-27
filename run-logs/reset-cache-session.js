const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const baseUrl = 'http://localhost:3000';
  const out = {
    timestamp: new Date().toISOString(),
    baseUrl,
    steps: [],
    ok: false,
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    out.steps.push('opened_app');

    await page.evaluate(async () => {
      try { localStorage.clear(); } catch (_) {}
      try { sessionStorage.clear(); } catch (_) {}

      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch (_) {}

      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
        }
      } catch (_) {}

      try {
        if (window.indexedDB && indexedDB.databases) {
          const dbs = await indexedDB.databases();
          await Promise.all(
            (dbs || [])
              .map((db) => db && db.name)
              .filter(Boolean)
              .map(
                (name) =>
                  new Promise((resolve) => {
                    const req = indexedDB.deleteDatabase(name);
                    req.onsuccess = () => resolve();
                    req.onerror = () => resolve();
                    req.onblocked = () => resolve();
                  })
              )
          );
        }
      } catch (_) {}
    });
    out.steps.push('cleared_storage_cache_sw_indexeddb');

    await context.clearCookies();
    out.steps.push('cleared_cookies');

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);

    const content = await page.content();
    const hasSignIn = /Sign in to continue/i.test(content);
    out.ok = hasSignIn;
    out.steps.push(hasSignIn ? 'verified_login_screen' : 'login_screen_not_detected');

    const runLogsDir = path.resolve('run-logs');
    if (!fs.existsSync(runLogsDir)) fs.mkdirSync(runLogsDir, { recursive: true });
    await page.screenshot({ path: path.join(runLogsDir, 'cache-session-reset-result.png'), fullPage: true });
  } catch (error) {
    out.error = String(error && error.message ? error.message : error);
  } finally {
    await context.close();
    await browser.close();
  }

  const outPath = path.resolve('run-logs', 'cache-session-reset-report.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  process.stdout.write(JSON.stringify(out));
})();
