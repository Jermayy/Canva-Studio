/**
 * Builds the Content-Security-Policy for the web app.
 *
 * Injected as a <meta> tag at build time because it depends on the
 * configured Supabase project; `frame-ancestors` can't be set in a meta tag,
 * so that one comes from the HTTP headers in vercel.json.
 *
 * Network and image access are limited to the configured Supabase project:
 * the main XSS mitigation for the browser-stored session (ADR 0006).
 */
export function buildCsp(
  supabaseUrl: string | undefined,
  isDev: boolean,
): string {
  const connect = ["'self'"];
  const img = ["'self'", 'data:', 'blob:'];
  if (supabaseUrl) {
    const host = new URL(supabaseUrl).host;
    connect.push(`https://${host}`, `wss://${host}`);
    // Shared-link images are served from Supabase Storage.
    img.push(`https://${host}`);
  }
  if (isDev) {
    connect.push('ws://localhost:*', 'http://localhost:*');
  }
  // Dev needs the inline React Refresh preamble; production never does.
  const script = isDev ? "'self' 'unsafe-inline'" : "'self'";
  return [
    "default-src 'self'",
    `script-src ${script}`,
    // Konva and React set inline styles on elements.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export const CSP_PLACEHOLDER = '<!-- CSP -->';

export function injectCsp(html: string, csp: string): string {
  if (!html.includes(CSP_PLACEHOLDER)) {
    // Failing the build beats silently shipping without a CSP.
    throw new Error(`index.html is missing the ${CSP_PLACEHOLDER} placeholder`);
  }
  return html.replace(
    CSP_PLACEHOLDER,
    `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
  );
}
