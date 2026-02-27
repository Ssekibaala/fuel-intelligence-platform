const { chromium } = require('playwright');

(async () => {
  const baseUrl = 'http://localhost:3000';
  const email = 'public.api.verify.1772000353@example.com';
  const password = 'P@ssw0rd!23456';

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Sign in to continue', { timeout: 20000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForSelector('[data-testid="sidebar"]', { timeout: 30000 });
  await page.locator('[data-testid="sidebar"]').hover();
  await page.waitForTimeout(600);
  await page.click('[data-testid="nav-dashboard"]', { timeout: 20000 });
  await page.waitForSelector('text=Fleet Sentinel Dashboard', { timeout: 30000 });
  await page.waitForTimeout(1500);

  const text = await page.content();
  const hasKpiDistance = text.includes('kpi-total-distance');

  const result = {
    titleVisible: await page.getByText('Fleet Sentinel Dashboard').isVisible(),
    hasKpiDistance,
    bodySnippet: (await page.locator('body').innerText()).slice(0, 600)
  };

  if (hasKpiDistance) {
    const ids = ['kpi-engine-hours','kpi-total-distance','kpi-fuel-used','kpi-total-vehicles-monitored'];
    result.kpis = {};
    for (const id of ids) {
      const locator = page.locator(`[data-testid="${id}"]`);
      if (await locator.count()) {
        result.kpis[id] = (await locator.first().innerText()).replace(/\s+/g,' ').trim();
      } else {
        result.kpis[id] = 'NOT_FOUND';
      }
    }
  }

  console.log(JSON.stringify(result));
  await page.screenshot({ path: 'run-logs/dashboard-values-check.png', fullPage: true });
  await browser.close();
})();