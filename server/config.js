// config.js — environment-driven configuration. Production fails closed on missing secrets.
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  // behind a TLS-terminating reverse proxy (Caddy/nginx/Cloudflare) set TRUST_PROXY=true
  trustProxy: process.env.TRUST_PROXY === 'true',
  tokenSecret: process.env.TOKEN_SECRET || null,
  adminKey: process.env.ADMIN_KEY || null,
  // live Sand Dollar rail (Central Bank). When both are set, the real rail is used.
  rail: { baseUrl: process.env.SD_BASE_URL || null, apiKey: process.env.SD_API_KEY || null },
};
export const isProd = config.env === 'production';

// In production, secrets MUST come from the environment (never generated/ephemeral files).
if (isProd) {
  const missing = [];
  if (!config.tokenSecret || config.tokenSecret.length < 32) missing.push('TOKEN_SECRET (>=32 chars)');
  if (!config.adminKey || config.adminKey.length < 16) missing.push('ADMIN_KEY (>=16 chars)');
  if (missing.length) {
    console.error('FATAL: production requires env secrets:\n  - ' + missing.join('\n  - '));
    process.exit(1);
  }
}
