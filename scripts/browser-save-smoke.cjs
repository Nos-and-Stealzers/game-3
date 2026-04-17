const { chromium } = require('playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const pages = [
  { name: 'Snow Rider', path: '/snow-rider.html', key: 'sr3d_progress_test' },
  { name: 'Minecraft Eaglercraft', path: '/games/minecraft/eaglercraft/index.html', key: 'eagler_test_progress' },
  { name: 'Sweet Bakery', path: '/games/sweet-bakery/index.html', key: 'sweet_bakery_progress' },
  { name: 'Mini Parkcore', path: '/games/mini/parkcore/index.html', key: 'parkcore_progress' },
  { name: 'Mini Tower Defense', path: '/games/mini/tower-defense/index.html', key: 'tower_defense_progress' },
  { name: 'FNaF 1', path: '/games/fnaf/1/index.html', key: 'fnaf1save' },
  { name: 'FNaF 2', path: '/games/fnaf/2/index.html', key: 'fnaf2save' },
  { name: 'FNaF 3', path: '/games/fnaf/3/index.html', key: 'fnaf3save' },
  { name: 'FNaF 4', path: '/games/fnaf/4/index.html', key: 'fnaf4save' },
  { name: 'FNaF SL', path: '/games/fnaf/sl/index.html', key: 'fnafslsave' },
  { name: 'FNaF PS', path: '/games/fnaf/ps/index.html', key: 'fnafpssave' },
  { name: 'FNaF UCN', path: '/games/fnaf/ucn/index.html', key: 'fnafucnsave' },
  { name: 'FNaF World', path: '/games/fnaf/w/index.html', key: 'fnafwsave' }
];

async function runCase(context, item) {
  const page = await context.newPage();
  try {
    await page.goto(base + item.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1100);

    const result = await page.evaluate(async ({ key, name }) => {
      const now = Date.now();
      const marker = `${name}:${now}`;
      localStorage.setItem(key, marker);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: marker, storageArea: localStorage }));
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('beforeunload'));
      await new Promise((r) => setTimeout(r, 1900));

      const raw = localStorage.getItem('gamehub_game_saves');
      if (!raw) {
        return { ok: false, reason: 'missing gamehub_game_saves' };
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (_error) {
        return { ok: false, reason: 'invalid JSON in gamehub_game_saves' };
      }

      const entries = Object.values(parsed || {});
      const found = entries.find((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const tracked = entry.localStorage || entry.storage || {};
        return tracked[key] === marker;
      });

      return found ? { ok: true } : { ok: false, reason: `marker not found for key ${key}` };
    }, item);

    await page.close();
    return { name: item.name, path: item.path, ...result };
  } catch (error) {
    await page.close();
    return { name: item.name, path: item.path, ok: false, reason: String(error && error.message ? error.message : error) };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const results = [];
  for (const item of pages) {
    results.push(await runCase(context, item));
  }

  console.log('BROWSER_SAVE_RESULTS_BEGIN');
  for (const row of results) {
    console.log([row.name, row.path, row.ok ? 'PASS' : 'FAIL', row.ok ? 'ok' : row.reason].join('\t'));
  }
  console.log('BROWSER_SAVE_RESULTS_END');

  const failed = results.filter((x) => !x.ok);
  console.log(`TOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`);

  await browser.close();
})();
