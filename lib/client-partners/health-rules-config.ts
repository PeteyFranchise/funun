// ─── health_rules_config singleton locator (D-31.1-03) ─────────────────────
// Factored out of app/api/admin/health-rules/route.ts: Next.js route modules
// may only export HTTP handlers + route config (a non-handler value export
// fails `next build`'s route-type validation), and this id is shared by the
// prospect-image route and the Health Rules RSC page.
export const CONFIG_ROW_ID = 1
