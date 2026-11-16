import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';

// jsdom doesn't implement object URLs.
let objectUrlCount = 0;
URL.createObjectURL = () => {
  objectUrlCount += 1;
  return `blob:test/${objectUrlCount}`;
};
URL.revokeObjectURL = () => undefined;

vi.mock('react-konva', async () => {
  const { reactKonvaMock } = await import('@renderer/test/reactKonvaMock');
  return reactKonvaMock;
});

afterEach(async () => {
  cleanup();
  const { resetKonvaMock } = await import('@renderer/test/reactKonvaMock');
  resetKonvaMock();
});
