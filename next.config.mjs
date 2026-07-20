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
}

export default nextConfig
