import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // registerFunuunPdfFonts() (lib/vault/pdf/fonts.ts) resolves the
  // vendored Noto Sans TTFs via an absolute path built from
  // process.cwd() at runtime. Next.js 15's file tracing only bundles
  // files it can see imported/required from code — a Font.register()
  // call passing a runtime-computed path is invisible to that trace, so
  // without this declaration the fonts resolve fine in local dev (where
  // process.cwd() is the repo root) and then 404/throw in the deployed
  // serverless bundle. outputFileTracingIncludes graduated out of
  // `experimental` in Next.js 15 — it lives at the TOP level of the
  // config object, keyed by route glob. Every server surface that can
  // render a PDF must be listed here.
  outputFileTracingIncludes: {
    'app/api/**/*': ['./assets/fonts/**'],
  },
  // R5 (32-06): inlines the DSN into the client bundle at build time
  // WITHOUT a NEXT_PUBLIC_ prefix on the variable name — the SPEC's
  // literal prohibition is about the name, not achievable secrecy of a
  // browser-delivered value (a client SDK's DSN ships in the JS either
  // way). This is the deliberate workaround for the Sentry Vercel
  // Marketplace integration's default of auto-injecting a
  // browser-visible-prefixed DSN variable (32-RESEARCH.md Common Pitfall
  // #1 / Pattern 3).
  // VERCEL_ENV rides the same mechanism so instrumentation-client.ts can
  // apply D-02's preview-vs-prod trace sampling without a new
  // NEXT_PUBLIC_ name.
  env: {
    SENTRY_DSN: process.env.SENTRY_DSN,
    VERCEL_ENV: process.env.VERCEL_ENV,
  },
}

export default withSentryConfig(nextConfig, {
  // Server-only env — SENTRY_AUTH_TOKEN is build-time source-map-upload
  // only and is never listed in the `env` key above, so it never reaches
  // the client bundle.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  // Avoids noisy Sentry CLI build logs (missing org/project/authToken)
  // in local dev / CI runs where these env vars are legitimately unset
  // (env-gated no-op, same philosophy as the SDK's own Sentry.init gate).
  silent: true,
})
