# Connecting funun.studio

This app has no hardcoded domain references in code — `middleware.ts` resolves
the request origin dynamically, and `next.config.mjs` has no domain config.
Connecting `funun.studio` is entirely dashboard/DNS work across Vercel,
your registrar, and Supabase. No code changes are required; this is a
runbook, not a diff.

## 1. Add the domain in Vercel

- Vercel dashboard → Project → **Settings → Domains** → Add `funun.studio`
- Decide apex vs `www`: add both and set one to redirect to the other
  (Vercel's UI offers this directly when you add the second one)
- Vercel will display the exact DNS records to add (typically an `A` record
  to `76.76.21.21` for the apex domain, or a `CNAME` to `cname.vercel-dns.com`
  for `www`) — copy these for step 2

## 2. Add DNS records at the registrar

- Add the record(s) from step 1 in your registrar's DNS management panel
- Propagation is usually fast but can take up to ~48h
- Vercel's Domains page shows a live "Valid Configuration" check once DNS
  resolves correctly — wait for that green check before moving on

## 3. Set the production environment variable in Vercel

- Vercel dashboard → Project → **Settings → Environment Variables**
- Add for the **Production** environment:
  `NEXT_PUBLIC_APP_URL=https://funun.studio`
- This is read by invite/approval/notification emails
  (`lib/notifications/index.ts`, `app/api/collaborators/[id]/invite/route.ts`,
  `app/api/approve/[token]/route.ts`, `app/api/split-sheets/[id]/send-for-approval/route.ts`,
  `app/api/pitches/route.ts`, `app/join/[inviteToken]/page.tsx`) to build
  links — without this they'll keep pointing at `localhost:3000` in production
- Redeploy after saving (Vercel prompts for this automatically)

## 4. Update Supabase Auth URL configuration

- Supabase dashboard (project `wgfjakfiyeewzfuxkgyo`) → **Authentication → URL Configuration**
- **Site URL**: `https://funun.studio`
- **Redirect URLs**: add `https://funun.studio/**` (or the specific auth
  callback paths this app uses, if a wildcard is intentionally avoided)
- Without this, magic-link/OAuth redirects after login will still bounce
  back to whatever the old Site URL was

## 5. Verify

- Visit `https://funun.studio` once DNS shows valid in Vercel — confirm the
  app loads over HTTPS with a valid certificate (Vercel provisions this
  automatically once DNS is correct)
- Test a magic-link sign-in end to end and confirm the redirect lands back
  on `funun.studio`, not `localhost` or the old Vercel preview URL
- Test one of the email flows above (e.g. a collaborator invite) and confirm
  the link in the email points at `https://funun.studio/...`

## Note — worth a decision, not assumed here

`RESEND_FROM_EMAIL` is currently `pete@artistos.co` — a different domain
than `funun.studio`. Leaving it as-is is fine (it's just the "from" address
for transactional email and doesn't need to match the app's domain), but
flagging it in case the intent is to send from a `@funun.studio` address
once that domain is live.
