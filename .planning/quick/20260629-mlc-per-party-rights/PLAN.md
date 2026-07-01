---
slug: mlc-per-party-rights
description: Reframe rights page with per-party registration principle, add collaborator callout, add MLC as first-class section, add SplitSheetForm nudge
date: 2026-06-29
files_modified:
  - supabase/migrations/025_mlc_registered.sql
  - types/index.ts
  - app/api/vault/[projectId]/rights/route.ts
  - app/(artist)/vault/[projectId]/rights/page.tsx
  - components/vault/MlcGuideCard.tsx
  - components/vault/ToolSidePanel.tsx
---

<objective>
Four targeted changes to the rights layer:

1. Migration 025 adds `mlc_registered boolean` to vault_projects.
2. VaultProject type and rights PATCH route are extended to include mlc_registered.
3. The rights page copy is reframed around per-party registration independence, a
   collaborators callout is added, and MLC gets a first-class section with guide
   card and RightsStatusPatch toggle.
4. SplitSheetForm in ToolSidePanel gets a nudge below the reconciliation callout
   reminding co-writers to register their own share with their PRO and MLC.
</objective>

---

## Task 1: Migration 025 — add mlc_registered to vault_projects

**Files:**
- `supabase/migrations/025_mlc_registered.sql` (create)

**Read first:**
- `supabase/migrations/024_vault_project_rights_status.sql` — match comment block style, ALTER TABLE pattern, and CHECK constraint conventions

**Action:**

Create `supabase/migrations/025_mlc_registered.sql`. Match the header comment block from migration 024 exactly, adapting the description.

Comment block must explain:
- `mlc_registered` is a boolean artist override (same pattern as `soundexchange_registered`)
- The MLC (Mechanical Licensing Collective) collects mechanical royalties for on-demand streaming in the US
- Does NOT feed into `calculate_vault_readiness()` — advisory only
- No RLS changes needed (vault_projects policy already covers this column)
- No trigger changes needed

SQL body:

```sql
ALTER TABLE vault_projects
  ADD COLUMN IF NOT EXISTS mlc_registered BOOLEAN DEFAULT false;
```

No CHECK constraint needed (it is a plain boolean). Match the trailing-semicolon convention from 024.

**Verify:**
```
grep -c 'mlc_registered' supabase/migrations/025_mlc_registered.sql
```
Expected: 1 or more matches. File must exist and contain the ALTER TABLE statement.

**Commit message:**
```
feat(db): migration 025 — add mlc_registered boolean to vault_projects
```

---

## Task 2: Extend VaultProject type and rights PATCH route

**Files:**
- `types/index.ts` (modify)
- `app/api/vault/[projectId]/rights/route.ts` (modify)

**Read first:**
- `types/index.ts` lines 62–66 — the `// Rights registration status (migration 024)` comment block; add the new field directly below `soundexchange_registered`
- `app/api/vault/[projectId]/rights/route.ts` line 4 — the `ALLOWED_FIELDS` const; add `'mlc_registered'` to this array
- `components/vault/RightsStatusPatch.tsx` lines 14–18 — the `field` prop union type; add `'mlc_registered'` to the union

**Action:**

**types/index.ts:** In the `VaultProject` type, immediately after the `soundexchange_registered` line, add:
```
  mlc_registered: boolean | null
```
Keep it within the `// Rights registration status (migration 024)` block. Update the comment to say `// Rights registration status (migrations 024–025)`.

**app/api/vault/[projectId]/rights/route.ts:** Add `'mlc_registered'` to `ALLOWED_FIELDS`. `mlc_registered` is a boolean, so no additional enum validator is needed — the existing loop passes the raw value to Supabase, which enforces the boolean type. No other changes to the route.

**components/vault/RightsStatusPatch.tsx:** Add `'mlc_registered'` to the `field` prop union:
```
field: 'copyright_status' | 'pro_registration_status' | 'soundexchange_registered' | 'mlc_registered'
```

**Verify:**
```
grep -c 'mlc_registered' types/index.ts app/api/vault/[projectId]/rights/route.ts components/vault/RightsStatusPatch.tsx
```
Each file must report at least 1.

```
npx tsc --noEmit
```
Must pass with no errors.

**Commit message:**
```
feat(types+api): add mlc_registered to VaultProject, rights PATCH allowlist, RightsStatusPatch field union
```

---

## Task 3: Rights page — per-party copy rewrite, collaborators callout, MLC section

**Files:**
- `app/(artist)/vault/[projectId]/rights/page.tsx` (modify)
- `components/vault/MlcGuideCard.tsx` (create)

**Read first:**
- `app/(artist)/vault/[projectId]/rights/page.tsx` — full file (already read); understand all four sections, the SELECT query, and badge helper
- `components/vault/SongtrustGuideCard.tsx` — the card markup pattern to replicate for MlcGuideCard
- `components/vault/RightsStatusPatch.tsx` — existing component; used for MLC toggle

**Action:**

**Step A — MlcGuideCard component (`components/vault/MlcGuideCard.tsx`):**

Create a pure server component (no 'use client'). Copy the outer div shape from `SongtrustGuideCard`: `rounded-xl border border-white/10 bg-white/[0.03] p-4`.

Content:
- `<h3>` "MLC — Mechanical Licensing Collective" (text-sm font-semibold text-white)
- Paragraph explaining: The MLC administers mechanical royalties for on-demand streaming and downloads in the US. Every songwriter and publisher who distributes music on Spotify, Apple Music, or any other interactive streaming service should register directly at themlc.com — this is separate from PRO royalties, which cover public performance.
- Two links styled as `text-xs font-semibold text-indigo-300 transition hover:text-indigo-200`:
  - "Register at themlc.com →" pointing to `https://www.themlc.com`
  - "About mechanical royalties →" pointing to `https://www.themlc.com/royalties` (target="_blank" rel="noopener noreferrer" on both)

Do not add props — it is a pure display card with no configuration.

**Step B — rights/page.tsx changes:**

1. **Import:** Add `import { MlcGuideCard } from '@/components/vault/MlcGuideCard'` at the top alongside existing imports.

2. **SELECT query:** Add `mlc_registered` to the select string on the `vault_projects` query. Current string ends at `publisher`; append `, mlc_registered` so the server has the field.

3. **Collaborators query (new, after the copyright doc count query):** Query vault_documents for split_sheet type for this project:
   ```ts
   const { data: splitSheetDocs } = await supabase
     .from('vault_documents')
     .select('document_data')
     .eq('project_id', projectId)
     .eq('user_id', user.id)
     .eq('type', 'split_sheet')
     .order('created_at', { ascending: false })
     .limit(1)
   ```
   Parse contributors from the latest split sheet's document_data. The split sheet document_data shape (from ToolSidePanel submitSplitSheet) is `{ song_name: string, contributors: { name: string, email: string, role: string, percentage: number }[] }`. Extract names:
   ```ts
   const splitContributors: string[] = (() => {
     const raw = splitSheetDocs?.[0]?.document_data as
       | { contributors?: { name?: string }[] }
       | undefined
     return (raw?.contributors ?? [])
       .map(c => String(c.name ?? '').trim())
       .filter(Boolean)
   })()
   ```

4. **Derive mlcBadge** (mirror seBadge pattern):
   ```ts
   const mlcStatus = project.mlc_registered ? 'registered' : 'not_registered'
   const mlcBadge = mlcStatus === 'registered'
     ? { variant: 'green' as const, label: 'Registered' }
     : { variant: 'gray' as const, label: 'Not registered' }
   ```

5. **Page heading copy:** Change the subtitle from:
   > "Track registration status across copyright, PRO, SoundExchange, and publishing administration."

   To:
   > "Every songwriter on this project is responsible for registering their own share. Track your registrations below."

6. **PRO section copy:** Change the `<p className="mt-1 text-xs text-white/50">` body from the existing sentence about collecting public performance royalties to:
   > "Each co-writer registers their share independently with their own PRO (ASCAP, BMI, SESAC, or SOCAN). Your PRO collects public performance royalties when your music is played publicly — but only for the share you registered."

7. **Collaborators callout (add inside PRO section, before the card div):** After the `</div>` closing the header row but before `<p className="mt-1 text-xs text-white/50">`, add a collaborator callout block:
   ```tsx
   {splitContributors.length > 1 && (
     <div className="mt-2 rounded-lg border border-indigo-400/20 bg-indigo-400/[0.06] px-3 py-2.5 text-xs text-indigo-200/80 leading-relaxed">
       Co-writers on this project:{' '}
       <span className="font-semibold text-indigo-200">
         {splitContributors.join(', ')}
       </span>
       . Each is responsible for registering their own share with their PRO and the MLC.
     </div>
   )}
   ```
   Place this between the header row close and the description `<p>`.

8. **MLC section (add after Songtrust section):** After the closing `</section>` of the Songtrust section, add a new section:
   ```tsx
   {/* ── 5. MLC ───────────────────────────────────────────────────── */}
   <section className="mt-8">
     <div className="flex flex-wrap items-center justify-between gap-2">
       <div className="flex items-center gap-2">
         <h2 className="text-base font-semibold text-white">MLC — Mechanical Licensing Collective</h2>
         <StatusBadge {...mlcBadge} />
       </div>
       <a
         href="https://www.themlc.com"
         target="_blank"
         rel="noopener noreferrer"
         className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
       >
         themlc.com ↗
       </a>
     </div>
     <p className="mt-1 text-xs text-white/50">
       The MLC distributes mechanical royalties from on-demand streaming and downloads in the US.
       Every songwriter with music on streaming platforms should register — this is separate from
       your PRO membership and covers a different royalty stream.
     </p>
     <div className="mt-3">
       <MlcGuideCard />
     </div>
     <div className="mt-3">
       <RightsStatusPatch
         projectId={projectId}
         field="mlc_registered"
         value={true}
         label="Mark as registered"
         disabled={!!project.mlc_registered}
       />
     </div>
   </section>
   ```

**Verify:**
```
npx tsc --noEmit
```
Must pass. Then manually: navigate to `/vault/[any-projectId]/rights` and confirm:
- Updated page heading subtitle appears
- PRO section shows updated per-party copy
- Collaborators callout appears when a split sheet with 2+ contributors exists
- MLC section renders with StatusBadge, guide card, and "Mark as registered" button
- "Mark as registered" on MLC sends PATCH with `{ mlc_registered: true }` and refreshes page

**Commit message:**
```
feat(rights): per-party copy reframe, collaborators callout, MLC section (migration 025)
```

---

## Task 4: SplitSheetForm registration nudge in ToolSidePanel

**Files:**
- `components/vault/ToolSidePanel.tsx` (modify)

**Read first:**
- `components/vault/ToolSidePanel.tsx` lines 272–349 — the `SplitSheetForm` function; specifically lines 273–276 which contain the existing indigo reconciliation callout div

**Action:**

In the `SplitSheetForm` function, after the closing `</div>` of the existing reconciliation callout (the indigo `border-indigo-400/20` div at the top of the `space-y-3` container, lines 274–276), add a second callout div immediately below it:

```tsx
<div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs text-amber-200/80 leading-relaxed">
  Once the split sheet is complete, each co-writer should register their share with their own PRO and the MLC (themlc.com) to collect performance and mechanical royalties.
</div>
```

This callout sits between the reconciliation callout and the first contributor card. It is static — no interactivity, no state. Use amber to distinguish it visually from the indigo reconciliation callout above.

**Verify:**
```
npx tsc --noEmit
```
Must pass. Then manually: open any project, trigger the split sheet tool in the side panel, confirm the amber nudge appears below the indigo reconciliation callout and above the first contributor row.

**Commit message:**
```
feat(splitsheet): add per-party PRO/MLC registration nudge to SplitSheetForm
```

---

## Final commit (optional combined)

If committing all four tasks together:
```
feat(rights): MLC section, per-party registration framing, collaborators callout, splitsheet nudge
```

Files changed:
- `supabase/migrations/025_mlc_registered.sql`
- `types/index.ts`
- `app/api/vault/[projectId]/rights/route.ts`
- `components/vault/RightsStatusPatch.tsx`
- `components/vault/MlcGuideCard.tsx`
- `components/vault/ToolSidePanel.tsx`
- `app/(artist)/vault/[projectId]/rights/page.tsx`
