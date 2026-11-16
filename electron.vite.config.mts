import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'electron-vite';
import type { Plugin } from 'vite';

const alias = {
  '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@main': resolve(import.meta.dirname, 'src/main'),
};

/**
 * Builds the Content-Security-Policy for the renderer.
 *
 * Network access is limited to the configured Supabase project so a
 * compromised renderer cannot exfiltrate data elsewhere. Dev mode also
 * needs the Vite dev server and the inline React Refresh preamble.
 */
function buildCsp(supabaseUrl: string | undefined, isDev: boolean): string {
  const connect = ["'self'"];
  if (supabaseUrl) {
    const host = new URL(supabaseUrl).host;
    connect.push(`https://${host}`, `wss://${host}`);
  }
  if (isDev) {
    connect.push('ws://localhost:*', 'http://localhost:*');
  }
  const script = isDev ? "'self' 'unsafe-inline'" : "'self'";
  return [
    "default-src 'self'",
    `script-src ${script}`,
    // Konva and React set inline styles on elements.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function cspPlugin(csp: string): Plugin {
  return {
    name: 'canvas-studio-csp',
    transformIndexHtml: (html) =>
      html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      ),
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());
  const csp = buildCsp(
    env.RENDERER_VITE_SUPABASE_URL || undefined,
    command === 'serve',
  );

  return {
    main: {
      resolve: { alias },
    },
    preload: {
      resolve: { alias },
    },
    renderer: {
      resolve: { alias },
      plugins: [react(), cspPlugin(csp)],
    },
  };
});
