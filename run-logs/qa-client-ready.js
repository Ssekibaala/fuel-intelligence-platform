const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const baseUrl = 'http://localhost:3000';
  const email = 'public.api.verify.1772000353@example.com';
  const password = 'P@ssw0rd!23456';

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    login: { ok: false, note: '' },
    pages: [],
    reportFlow: { ok: false, csvOnlyNoteVisible: false, note: '' },
    consoleErrors: [],
    pageErrors: [],
    httpFailures: [],
    expectedNoData404: [],
  };

  const runLogsDir = path.resolve('run-logs');
  if (!fs.existsSync(runLogsDir)) fs.mkdirSync(runLogsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      report.consoleErrors.push({ text: msg.text(), url: page.url() });
    }
  });

  page.on('pageerror', (err) => {
    report.pageErrors.push({ message: err.message, stack: err.stack || '' });
  });

  page.on('response', (resp) => {
    const status = resp.status();
    if (status < 400) return;
    const url = resp.url();

    if (
      status === 404 &&
      (url.includes('/api/reports/preview-daily-movement/') ||
        url.includes('/api/reports/preview-fuel-temperature/'))
    ) {
      report.expectedNoData404.push({ status, url });
      return;
    }

    report.httpFailures.push({ status, url });
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForSelector('text=Sign in to continue', { timeout: 20000 });
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 30000 });
    await page.waitForSelector('[data-testid="nav-dashboard"]', { timeout: 30000 });
    report.login = { ok: true, note: 'Authenticated and sidebar loaded' };

    const pageChecks = [
      { key: 'dashboard', marker: 'Fleet Sentinel Dashboard' },
      { key: 'assets', marker: 'Fleet Assets' },
      { key: 'alerts', marker: 'Alerts Monitoring' },
      { key: 'reports', marker: 'Reports Center' },
      { key: 'admin', marker: 'Create Client' },
      { key: 'settings', marker: 'System Configuration' },
    ];

    for (const check of pageChecks) {
      const entry = { page: check.key, ok: false, marker: check.marker };
      try {
        await page.click(`[data-testid="nav-${check.key}"]`, { timeout: 15000 });
        await page.waitForSelector(`text=${check.marker}`, { timeout: 30000 });
        await page.screenshot({ path: path.join(runLogsDir, `qa-${check.key}.png`), fullPage: true });
        entry.ok = true;
      } catch (err) {
        entry.error = String(err && err.message ? err.message : err);
      }
      report.pages.push(entry);
    }

    // Report flow check: ensure CSV-only message appears on preview modal for public-api host
    try {
      await page.click('[data-testid="nav-reports"]', { timeout: 15000 });
      await page.waitForSelector('text=Reports Center', { timeout: 20000 });

      await page.locator('button:has-text("Start")').first().click({ timeout: 15000 });
      await page.waitForSelector('text=Step 1 of 3', { timeout: 20000 });

      const nextButton = page.getByRole('button', { name: 'Next' });
      await nextButton.click({ timeout: 15000 });
      await page.waitForSelector('text=Step 2 of 3', { timeout: 20000 });

      // Ensure date range is explicitly set before advancing.
      await page.click('[data-testid=\"button-date-range-picker\"]', { timeout: 15000 });
      await page.click('[data-testid=\"preset-last_7_days\"]', { timeout: 15000 });

      await nextButton.click({ timeout: 15000 });
      await page.waitForSelector('text=Review and generate', { timeout: 20000 });

      await page.getByRole('button', { name: 'Preview Report' }).click({ timeout: 20000 });
      await page.waitForSelector('text=Daily Movement Report Preview', { timeout: 30000 });
      await page.waitForSelector('text=CSV-only export on this host.', { timeout: 30000 });

      report.reportFlow = {
        ok: true,
        csvOnlyNoteVisible: true,
        note: 'Preview modal opened and CSV-only note is visible',
      };

      await page.screenshot({ path: path.join(runLogsDir, 'qa-reports-preview.png'), fullPage: true });
      await page.getByRole('button', { name: 'Close Preview' }).click({ timeout: 15000 });
    } catch (err) {
      report.reportFlow = {
        ok: false,
        csvOnlyNoteVisible: false,
        note: String(err && err.message ? err.message : err),
      };
    }
  } catch (err) {
    report.fatal = String(err && err.message ? err.message : err);
  } finally {
    await context.close();
    await browser.close();
  }

  const outPath = path.join(runLogsDir, 'client-ready-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report));
})();
