// E2E coverage of the DESIGN.md §3 use-cases on a mobile viewport:
// U1 (convert via mixed inputs incl. search), U2 (planned loop),
// U3 (import & fix), U4 (library management) + the offline scenario.
import { expect, test, type Page } from '@playwright/test';

const norm = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim();

async function newRoute(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '＋ New route' }).click();
  const addInput = page.getByLabel('Add a stop by search or coordinates');
  await addInput.waitFor();
  return addInput;
}

async function addCoords(page: Page, coords: string) {
  await page.getByLabel('Add a stop by search or coordinates').fill(coords);
  await page.getByRole('button', { name: /Add as stop/ }).click();
}

function mockPhoton(page: Page) {
  return page.route('**/photon.komoot.io/api/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    return route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [144.9663, -37.8183] },
            properties: { name: `${q} Station`, city: 'Melbourne', country: 'Australia' }
          }
        ]
      }
    });
  });
}

test.beforeEach(async ({ page }) => {
  // Reverse geocoding is opportunistic; keep tests deterministic.
  await page.route('**/photon.komoot.io/reverse**', (r) => r.fulfill({ json: { features: [] } }));
  await page.route('**/nominatim.openstreetmap.org/**', (r) => r.abort());
});

test('U2: build a loop from mixed coordinate formats and export it', async ({ page }) => {
  await newRoute(page);
  await addCoords(page, '-37.8153, 144.9663');
  await addCoords(page, `37°49'05"S 144°58'06"E`);
  await addCoords(page, 'https://www.google.com/maps/@-37.8183,144.9671,17z');
  await expect(page.locator('[data-stop-row]')).toHaveCount(3);

  await page.getByRole('button', { name: 'Untitled route' }).click();
  await page.locator('input.route-name-input').fill('CBD Walk');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Loop', exact: true }).click();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dlPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toBe('cbd-walk.gpx');
  const gpx = (await import('node:fs')).readFileSync(await dl.path(), 'utf8');
  expect(gpx).toContain('creator="WayPoint"');
  expect(gpx.match(/<wpt /g)).toHaveLength(3);
  expect(gpx.match(/<rtept /g)).toHaveLength(4); // loop closes back to start
  expect(gpx).toContain('(return)</name>');
});

test('export sheet: view GPX inline and copy to clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await newRoute(page);
  await addCoords(page, '-37.8153, 144.9663');
  await addCoords(page, '-37.8180, 144.9683');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'View GPX' }).click();
  const preview = page.locator('pre.preview');
  await expect(preview).toContainText('creator="WayPoint"');
  await expect(preview).toContainText('lat="-37.815300"');
  await page.getByRole('button', { name: 'Hide GPX' }).click();
  await expect(preview).toBeHidden();

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByText('GPX copied to clipboard')).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(clip.match(/<wpt /g)).toHaveLength(2);
});

test('route overview: stats, markdown copy, PNG export, embedded GPX', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await newRoute(page);
  await addCoords(page, '-37.8153, 144.9663');
  await addCoords(page, '-37.8180, 144.9683');
  await page.getByRole('button', { name: 'Untitled route' }).click();
  await page.locator('input.route-name-input').fill('Sheet Test');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Route actions' }).click();
  await page.getByRole('menuitem', { name: 'Route overview' }).click();
  await expect(page.getByRole('heading', { name: 'Sheet Test' })).toBeVisible();
  await expect(page.getByText(/~\d+ min/).first()).toBeVisible();
  await expect(page.locator('.map-wrap svg polyline')).toBeVisible();
  await expect(page.locator('pre.gpx')).toContainText('creator="WayPoint"');

  await page.getByRole('button', { name: 'Copy Markdown' }).click();
  const md = await page.evaluate(() => navigator.clipboard.readText());
  expect(md).toContain('# Sheet Test');
  expect(md).toContain('| # | Stop | Latitude | Longitude | Note |');

  const dlPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image' }).click();
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toBe('sheet-test.png');
});

test('U1: mix place search with pasted coordinates', async ({ page }) => {
  await mockPhoton(page);
  const addInput = await newRoute(page);

  await addInput.fill('Flinders');
  await page.getByText('Flinders Station').click();
  await expect(page.locator('[data-stop-row]')).toHaveCount(1);
  await expect(addInput).toHaveValue(''); // chaining: field cleared, ready for next

  await addCoords(page, '-37.8212, 144.9681');
  await expect(page.locator('[data-stop-row]')).toHaveCount(2);
  expect(norm(await page.locator('[data-stop-row] .name').first().textContent())).toBe(
    'Flinders Station'
  );
});

test('reorder, undo/redo and reverse', async ({ page }) => {
  await newRoute(page);
  await addCoords(page, '-37.80, 144.95');
  await addCoords(page, '-37.81, 144.96');
  await addCoords(page, '-37.82, 144.97');

  const firstCoords = () => page.locator('[data-stop-row] .coords').first().textContent();

  await page.getByRole('button', { name: 'Route actions' }).click();
  await page.getByRole('menuitem', { name: 'Reverse order' }).click();
  expect(norm(await firstCoords())).toContain('-37.820000');

  await page.locator('.undo-redo button').first().click(); // undo
  expect(norm(await firstCoords())).toContain('-37.800000');
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(norm(await firstCoords())).toContain('-37.820000');

  await page.getByRole('button', { name: 'Actions for stop 1' }).click();
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  expect(norm(await firstCoords())).toContain('-37.810000');
});

test('U3: import a multi-route file, then a broken one', async ({ page }) => {
  await page.goto('/');
  const multi = `<?xml version="1.0"?>
    <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
      <rte><name>Route One</name>
        <rtept lat="-37.81" lon="144.91"><name>P1</name></rtept>
        <rtept lat="-37.82" lon="144.92"><name>P2</name></rtept>
      </rte>
      <rte><name>Route Two</name><rtept lat="-37.7" lon="144.9"/><rtept lat="-37.71" lon="144.91"/></rte>
    </gpx>`;
  await page.locator('input[type=file]').setInputFiles({
    name: 'melbourne.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(multi)
  });
  await page.getByRole('dialog', { name: 'Import GPX' }).waitFor();
  await expect(page.getByText('Route One')).toBeVisible();
  await page.locator('.route-item input[type=checkbox]').nth(1).uncheck();
  await page.getByRole('button', { name: /Import route/ }).click();
  await page.waitForURL(/#\/route\//);
  await expect(page.locator('[data-stop-row]')).toHaveCount(2);
  expect(norm(await page.locator('[data-stop-row] .name').first().textContent())).toBe('P1');

  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from('not xml at all')
  });
  await expect(page.getByText(/isn't valid XML/)).toBeVisible(); // never fails silently
});

test('U4 + offline: library management and full offline editing', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(
    async () => !!(await navigator.serviceWorker?.getRegistration())?.active,
    undefined,
    { timeout: 20000 }
  );

  await page.getByRole('button', { name: '＋ New route' }).click();
  await page.getByLabel('Add a stop by search or coordinates').waitFor();
  await addCoords(page, '-37.8153, 144.9663');
  await page.waitForTimeout(700); // autosave debounce
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByText('Untitled route')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'WayPoint' })).toBeVisible();
  await expect(page.getByText('Untitled route')).toBeVisible();

  await page.getByRole('button', { name: /Open route/ }).click();
  await page.locator('[data-stop-row]').first().waitFor();
  await addCoords(page, '-37.8180, 144.9683');
  await expect(page.locator('[data-stop-row]')).toHaveCount(2);

  await page.getByLabel('Add a stop by search or coordinates').fill('Flinders');
  await expect(page.getByText(/Offline — coordinates and map taps still work/)).toBeVisible();
  await page.getByLabel('Add a stop by search or coordinates').fill('');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dlPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const gpx = (await import('node:fs')).readFileSync(await (await dlPromise).path(), 'utf8');
  expect(gpx.match(/<wpt /g)).toHaveLength(2);
  await context.setOffline(false);
});
