'use client'

// No-op client component. Its only job is to give the (admin) route group at
// least one client-component boundary. Next.js 15.5.x has a build regression
// (vercel/next.js#93862) where a route tree with zero client boundaries never
// gets its page_client-reference-manifest.js written, but the build's own
// output-file-tracing step still expects that file to exist and crashes with
// an ENOENT. Rendering this alongside {children} in the layout forces the
// manifest to be generated for every route under (admin).
export function ManifestBoundary() {
  return null
}
