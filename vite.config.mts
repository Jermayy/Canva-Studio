import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { buildCsp, injectCsp } from './build/csp.ts';

const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'),
) as { version: string };

function cspPlugin(csp: string): Plugin {
  return {
    name: 'canvas-studio-csp',
    transformIndexHtml: (html) => injectCsp(html, csp),
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());
  const csp = buildCsp(env.VITE_SUPABASE_URL || undefined, command === 'serve');

  return {
    resolve: {
      alias: {
        '@': resolve(import.meta.dirname, 'src'),
        '@build': resolve(import.meta.dirname, 'build'),
      },
    },
    plugins: [react(), cspPlugin(csp)],
    define: {
      // Tags logs and the UI with the release (playbook: versioned releases).
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    },
    build: {
      sourcemap: true,
      // jsPDF and Konva are large; keep warnings meaningful.
      chunkSizeWarningLimit: 1500,
    },
  };
});
