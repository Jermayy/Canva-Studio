import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = {
  '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@main': resolve(import.meta.dirname, 'src/main'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/src/**/*.test.{ts,tsx}'],
          setupFiles: ['src/renderer/src/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/renderer/src/test/**',
        'src/renderer/src/main.tsx',
        'src/main/index.ts',
        'src/preload/index.ts',
      ],
      thresholds: {
        // State/business logic must stay above 90%, UI above 70%.
        'src/renderer/src/modules/**/domain/**': { lines: 90, branches: 85 },
        'src/renderer/src/modules/**/state/**': { lines: 90, branches: 85 },
        'src/renderer/src/modules/**/data/**': { lines: 90, branches: 80 },
        'src/renderer/src/modules/sync/**': { lines: 90, branches: 80 },
        'src/main/**': { lines: 90 },
        'src/renderer/src/modules/**/components/**': { lines: 70 },
      },
    },
  },
});
