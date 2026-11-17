import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Starts a fresh guest session (each test has its own browser storage). */
async function continueAsGuest(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue offline without an account' })
    .click();
  await expect(page.getByText('Offline guest')).toBeVisible();
}

test('a guest designs a poster, keeps it across reloads and downloads it', async ({
  page,
}) => {
  await continueAsGuest(page);

  // Create from a template and edit it.
  await page.getByRole('button', { name: /Christmas party/ }).click();
  const title = page.getByLabel('Design title');
  await expect(title).toHaveValue('Christmas party');
  await expect(
    page.getByRole('main', { name: 'Canvas' }).locator('canvas').first(),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Text' }).click();
  await page.getByRole('button', { name: /^Add / }).first().click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  await title.fill('Office party 2026');
  await title.press('Enter');
  await page.getByRole('button', { name: '← Designs' }).click();
  const card = page.locator('.design-open', { hasText: 'Office party 2026' });
  await expect(card).toBeVisible();

  // Local-first: the design survives a full reload with no backend at all.
  await page.reload();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByLabel('Design title')).toHaveValue(
    'Office party 2026',
  );

  // Export: a real PNG file is downloaded.
  await page.getByLabel('Export format').selectOption('png');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('Office party 2026.png');
  const bytes = await readFile(await download.path());
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  await expect(
    page.getByText('Downloaded Office party 2026.png'),
  ).toBeVisible();
});

test('the last edit is saved when the tab is hidden and survives a reload', async ({
  page,
}) => {
  await continueAsGuest(page);
  await page.getByRole('button', { name: /Christmas party/ }).click();
  const title = page.getByLabel('Design title');
  await title.fill('Renamed then hidden');
  await title.press('Enter');

  // As when switching away from or closing the tab.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate(readGuestTitles))
    .toContain('Renamed then hidden');
  await page.reload();

  await expect(
    page.locator('.design-open', { hasText: 'Renamed then hidden' }),
  ).toBeVisible();
});

/** Reads design titles straight from the guest's IndexedDB database. */
function readGuestTitles(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('canvas-studio-local-guest');
    open.onerror = () => {
      reject(new Error(open.error?.message ?? 'open failed'));
    };
    open.onsuccess = () => {
      const request = open.result
        .transaction('designs')
        .objectStore('designs')
        .getAll();
      request.onsuccess = () => {
        resolve((request.result as { title: string }[]).map((d) => d.title));
        open.result.close();
      };
      request.onerror = () => {
        reject(new Error(request.error?.message ?? 'read failed'));
      };
    };
  });
}

test('guests are told browser storage can be cleared, and not offered sharing', async ({
  page,
}) => {
  await continueAsGuest(page);

  await expect(page.getByRole('note')).toContainText(
    'saved in this browser only',
  );
  await page.getByRole('button', { name: /Balloon birthday/ }).click();
  await expect(page.getByLabel('Design title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0);
});
