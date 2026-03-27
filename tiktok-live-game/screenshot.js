const { chromium } = require('/opt/node22/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // Wait longer for demo events to populate the game with players and effects
  await page.waitForTimeout(25000);

  await page.screenshot({ path: 'screenshot.png', fullPage: false });
  console.log('Screenshot saved to screenshot.png');

  await browser.close();
})();
