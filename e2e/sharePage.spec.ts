import { expect, test } from '@playwright/test';

test('a malformed share link explains itself without calling the server', async ({
  page,
}) => {
  const apiCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/')) {
      apiCalls.push(request.url());
    }
  });

  await page.goto('/s/not-a-real-link');

  await expect(
    page.getByRole('heading', { name: "This link isn't available" }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Canvas Studio' }),
  ).toHaveAttribute('href', '/');
  expect(apiCalls).toEqual([]);
});
