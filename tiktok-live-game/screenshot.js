const { chromium } = require('/opt/node22/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // Take screenshots at different stages
  const shots = [
    { wait: 10000, name: 'screenshot_1_start.png', label: 'Early game - players joining' },
    { wait: 15000, name: 'screenshot_2_battle.png', label: 'Mid game - battle in progress' },
    { wait: 20000, name: 'screenshot_3_intense.png', label: 'Late game - intense battle' },
  ];

  for (const shot of shots) {
    await page.waitForTimeout(shot.wait);
    await page.screenshot({ path: shot.name, fullPage: false });
    console.log(`Saved: ${shot.name} (${shot.label})`);
  }

  await browser.close();
})();
