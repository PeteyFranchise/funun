# Split Sheet — Attorney Review Package (P17-09a)

**Prepared:** 2026-07-20 · **Requester:** Pete Zora, Funūn
**Deliverable sought:** written sign-off (or required changes) on the operative language below, plus reviewer name, firm, and date.

---

## 1. What Funūn is and what this document does

Funūn is a platform for independent musicians. One feature generates a **split sheet** — the document co-writers sign to record who wrote what percentage of a song, used later for PRO (ASCAP/BMI/SESAC) and publisher registration.

The artist fills in a form; Funūn renders a PDF and routes it for electronic signature via DocuSeal. **Every party signs the same fixed operative language** — the artist cannot edit it. That is what needs review.

Volume expectation is meaningful: the product decision is that **every track gets a split sheet**, including single-writer tracks, so a 12-track album generates 12 documents. This language will be signed many times by people who will not have their own lawyer read it.

**Exhibit A** (`EXHIBIT-A-sample-split-sheet.pdf`, this folder) is a real render from production code with representative data.

---

## 2. The operative language under review

Two sentences, printed verbatim. Source: `lib/split-sheets/agreement.ts` → `AGREEMENT_CLAUSES`.

> **1.** This Songwriter/Publishing split agreement may not be modified or amended except by writing and signed by all Co-writers named above.

> **2.** If the foregoing accurately represents the agreement between the Co-writers as to their respective ownership interests and shares of songwriting royalties payable in connection with the above-noted composition, please acknowledge your understanding and agreement by executing this contract in the appropriate space below.

Three **Guidance Notes** also print on the document, in a callout box at the foot:

> **a.** Use your full legal name exactly as registered with your PRO. If you do not yet have a PRO, complete the field as "None yet" and update it later once affiliated.
>
> **b.** Where a detail is not yet known, it is shown as —. Enter the release title if known; if not final, use the current working project title. If self-releasing, the label may be entered as "Independent".
>
> **c.** This split sheet confirms songwriting and publishing shares only. Master ownership and master revenue splits, if any, are not determined by this split sheet unless expressly stated in a separate written agreement.

---

## 3. Questions for counsel

Ordered by how much they could change the product.

### 3.1 Provenance of the source text
The two clauses were taken near-verbatim from a Word template ("SONGWRITER/PUBLISHING SPLITS AGREEMENT") found in a personal folder of music contract templates. **Its origin and licence are unknown.** Is there copyright or authorship risk in distributing this wording at scale? If so, is a clean-room rewrite required?

### 3.2 Is the master-rights disclaimer in the right place?
Guidance Note (c) disclaims master ownership. But it sits in a **"Guidance Notes" callout, not in the operative clauses** — it reads as explanatory rather than contractual. Given that producers frequently sign these and may assume master rights are covered, **should that disclaimer be moved into the operative agreement text?** Funūn's own view is that this is the single most likely place a signer misunderstands what they signed.

### 3.3 Does the amendment mechanism actually satisfy Clause 1?
Clause 1 requires a writing "signed by all Co-writers named above." Funūn's implementation freezes an executed sheet permanently and requires a **new amendment split sheet** for any change. Does a new document signed by all parties satisfy Clause 1? And what is the status if a new writer joins later — the amendment names a party the original did not?

### 3.4 Clauses that are absent
None of the following appear. For each: needed, optional, or actively undesirable in a document of this kind?
- Governing law / venue
- Dispute resolution
- Severability
- **Counterparts** — parties sign separately, at different times, from different devices
- **Electronic signature consent** (ESIGN/UETA disclosure) — see §4
- Representation that each contribution is original and non-infringing
- Disclosure of samples or interpolations
- Provision for a **signer under 18** — realistic in this user base

### 3.5 Positional references
Clause 1 says "named above"; Clause 2 says "in the appropriate space below." These are positional references to the rendered layout. Please confirm against **Exhibit A** that they are accurate as laid out, since the renderer prints clauses in fixed order.

### 3.6 Unauthorized practice of law
Funūn supplies the template and the guidance notes, but employs no attorneys and gives no legal advice. **What disclaimer, placement, and wording are needed** — on the document, in the app, or both — to keep this clearly a self-service document tool?

### 3.7 Single-signer sheets
A one-writer track still produces a split sheet showing 100% to one person, so the artist can demonstrate clean ownership to a sync licensor. Clause 2's "agreement between the Co-writers" reads oddly with one party. **Does this need different language, or is it acceptable?**

### 3.8 Reliance language
The pre-signature prompt shown in-app (not on the PDF) reads:

> "Check that your legal name, PRO, publishing designee, and administrator are correct before you sign. If anything is wrong, decline and let the sender know — these details flow into your PRO and publisher registrations."

Any concern with that framing?

---

## 4. How signature and evidence work

Relevant to §3.4's ESIGN/UETA question.

- **Provider:** DocuSeal. All parties sign **in parallel** — any order, independently.
- **Certificate of Signature** is generated per completed document and stored alongside the PDF. It carries: dual SHA256 checksums, per-signer IP address, session identifier, user agent, timezone, an email-verified flag, and a full timestamped event log. Signatures completed via API are distinguished from hand-drawn ones.
- **Both the executed PDF and the certificate are copied into Funūn's own storage**, not left on the vendor's servers.
- An executed sheet is **immutable** in the system — no edit path exists after execution.

**Question:** is a separate consent-to-electronic-signature disclosure required before the first signature, or is the above sufficient?

---

## 5. What we need back

1. **Approve as-is**, or **required changes** (exact replacement wording preferred — Funūn will not paraphrase legal text).
2. **Reviewer name, firm, and review date.**

Those three values get recorded in `lib/split-sheets/agreement.ts`, where a constant `COUNSEL_REVIEW_STATUS` is flipped from `'unreviewed'` to `'reviewed'`. Until then, **production is hard-blocked**: any attempt to send a real split sheet for signature throws an error and refuses. That guard is already live and tested. No artist can sign this language until you sign off on it.

---

## 6. Notes for Pete (not for counsel)

- **Who to approach:** a music-publishing attorney is the right specialist — split sheets are their bread and butter. If cost is a barrier at this stage, **Volunteer Lawyers for the Arts** chapters exist in most major US cities and handle exactly this kind of small-scope review for independent artists and early-stage arts businesses.
- **Scope it tightly.** This is a two-sentence review with eight questions, not a contract drafting engagement. Say that up front — it changes the quote substantially.
- **§3.1 is the one that could cost you time.** If the source template turns out to be someone's proprietary work, the answer is a clean-room rewrite, which is a new drafting task rather than a review. Worth flagging when you first make contact so it is not a surprise mid-engagement.
- **§3.2 is the one Funūn should most want answered**, independent of legal risk. If a producer signs believing master rights are settled, that is a product failure regardless of what the law says.
- **Exhibit A was generated from current code and its font embedding was verified structurally** (2 embedded subsets, Identity-H, ToUnicode CMaps present) and the renderer's 22 tests pass — but **it was not visually inspected**, because no PDF rasterizer is installed in this environment. Open it yourself before sending. The specific thing to check is that `Funūn` renders with its macron and that `Nikola Jokić` keeps its diacritic — an earlier bug silently dropped both, and a text search for the corrupted form returns clean even when the bug is present, so eyes are the only reliable check.
