# Marmoset & Artlist Buyer Experience Research (+ Comparison to Musicbed)

**Prepared:** July 18, 2026
**Purpose:** Companion to `Musicbed_Buyer_Experience_Research.md`. Same question set, applied to Marmoset and Artlist, plus a cross-platform comparison and an updated recommendation for Funūn now that we can see three different models side by side.

---

## 1. Marmoset — preview/download flow

Marmoset is a curated a la carte sync agency (per-project licensing, not subscription-first), though it also runs a separate subscription product called **Track Club**.

**Preview mechanism — quality degradation, not watermarking.** Marmoset's own [Terms of Use](https://www.marmosetmusic.com/legal) explicitly grant users the right to "Download low quality scratch tracks at no cost for testing and licensing approval purposes." Their own blog is even more direct: "these downloaded songs are not watermarked and tainted with, since we understand that it's crucial to try out the real songs before fully committing to licensing them" ([3 Simple Steps to Download Temp Tracks](https://www.marmosetmusic.com/journal/3-simple-steps-to-download-temp-tracks-and-get-you-on-your-way/)). The scratch track is delivered as "a lower res MP3 format," full-length and usable for real editing/client review, but explicitly not a licensed file.

**This is a meaningfully different approach than Musicbed and Artlist**, both of which use audible/visible watermarking. Marmoset instead just ships a genuinely lower-quality file and relies on the terms of use (not a technical block) to say "this isn't a license." This is legally weaker (nothing stops someone from publishing the low-res scratch track) but frictionless for creative work, since editors can drop a full, real-length track into a rough cut without any watermark noise.

**Licensing flow.** Browse/stream in the web player → find a track → add to cart → choose from a menu of pre-defined Standard Licenses (Independent Film, Small Business by employee-count tier, Nonprofit, Wedding, Podcast, Personal/Revenue-Generating, Student, Live Event, Corporate Highlight Reel — each with its own price, allowed use, and explicit exclusions) or request a Custom License → pay → receive an **Invoice**, which becomes part of the binding contract ([Marmoset License Agreement](https://www.marmosetmusic.com/license-agreement)). The license itself states: "Conditioned upon receipt of payment in full... Marmoset grants you the right to synchronize the Musical Work... solely for the single use, territory, term, scope and other parameters you selected from our website specified in the Invoice."

**The Marmoset identifier is an Order ID, not a track ID.** Their FAQ states: "If you ever have any trouble with your order ID number, or any questions about the process, you can always get in touch with us at support@marmosetmusic.com" ([Marmoset License Agreement](https://www.marmosetmusic.com/license-agreement)). This ties a specific transaction (one license, for one track, one use) to a support-traceable number, similar in spirit to what we recommended for Funūn in the prior research file.

**TrackID — Marmoset's version of an instant-clearance system, but on Track Club, not the main a la carte site.** Track Club (Marmoset's subscription product, positioned against Artlist/Soundstripe) advertises "access to licensed music through its instant clearance feature called TrackID" ([Music In Africa](https://www.musicinafrica.net/magazine/marmoset-launches-new-music-licensing-app-track-club)). Track Club also has **MixLab**, letting subscribers mute/solo/adjust stems and instantly generate a custom mix/edit of a track tied to their license, without waiting on a composer. Public documentation on TrackID's actual mechanics (what exactly it validates, how it talks to YouTube Content ID) is thin, it's described only as "instant clearance," not detailed the way Musicbed documents SyncID.

---

## 2. Artlist — preview/download flow

Artlist is structurally the odd one out: **it's a flat-rate subscription with no per-track checkout at all.** This matters a lot for how "preview vs. licensed download" plays out.

**Preview mechanism — watermarking, available to free/trial users.** Anyone can create a free account and stream full tracks, and can download **unlimited watermarked previews** (capped at roughly 40 songs/day) for testing in drafts ([Can I get previews of music or footage?](https://help.artlist.io/hc/en-us/articles/7757521115165-Can-I-get-previews-of-music-or-footage), [A free Trial explained](https://help.artlist.io/hc/en-us/articles/29489082949405-A-free-Trial-explained)). These watermarked files are explicitly "not licensed for use in any public or published projects" and removing the watermark is against their terms ([Get to Know Artlist's License Model](https://artlist.io/help-center/privacy-terms/artlist-license/)).

**No separate "license out" action — downloading while subscribed *is* the license grant.** This is the core structural difference from Musicbed and Marmoset. Once you have an active paid subscription, clicking Download on any track gives you the clean, watermark-free MP3 or WAV immediately, no project form, no per-track checkout, no invoice. The license is a blanket grant tied to the account's active subscription status at the moment of download and publish, not to an individually negotiated transaction ([How to Use Artlist](https://artlistio.com/how-to-use-artlist/), [Understanding Artlist's license](https://help.artlist.io/hc/en-us/articles/29490991524253-Understanding-Artlist-s-license)).

**The rights are "sticky" to the moment of publishing, not to the moment of download.** Artlist's model: "If a project is completed and published while you're subscribed, you keep the rights to use those assets in that published project forever, even if you cancel later. You can't use Artlist assets in new projects after your subscription ends." This "perpetual coverage for published content" framing is unique among the three ([lordofthewix.com Artlist guide](https://www.lordofthewix.com/post/the-complete-guide-to-artlist-2026-music-sfx-footage-templates-ai-tools-licensing-clearlist)).

**License certificates are generated on demand, after the fact, as proof — not as a gate.** In the account's Download History, every downloaded track has a "Song License" button next to the MP3/WAV buttons; clicking it generates a PDF certificate documenting the track name, license holder (the account), license scope, and download date ([Where do I download the license for use?](https://artlist.freshdesk.com/support/solutions/articles/43000669871-where-do-i-download-the-license-for-use-)). A hands-on tutorial confirms the certificate carries a visible **license number at the top of the PDF**: "clicking on the PDF you'll see your license number right up here at the top, you can choose to send this number or the whole PDF to your client" ([How to Copyright Clear Client Videos with Artlist](https://www.youtube.com/watch?v=GTDqsrGnVgw)). Cue sheets (for broadcast/OTT royalty reporting) are downloadable separately from the same panel.

**Clearlist — Artlist's Content ID layer.** Rather than a fully automatic real-time system like Musicbed's SyncID, Artlist has users proactively register ("Clearlist") their YouTube channels or specific video URLs. When a Content ID claim fires on a Clearlisted channel/video, Artlist can see the video is licensed and release the claim, "usually quickly," per a tutorial ([How To Use Artlist For Copyright Music](https://www.youtube.com/watch?v=HcYxVPzg2jQ)). The workflow guide is explicit that you generally don't need to take any per-video action beyond keeping the license certificate on file as proof if a dispute needs manual backup ([lordofthewix.com Artlist guide](https://www.lordofthewix.com/post/the-complete-guide-to-artlist-2026-music-sfx-footage-templates-ai-tools-licensing-clearlist)).

---

## 3. Cross-platform comparison

| | Musicbed | Marmoset (a la carte) | Artlist |
|---|---|---|---|
| **Business model** | Per-song/per-project license, or subscription | Per-project license (a la carte); separate subscription product (Track Club) | Flat subscription only |
| **Preview mechanism** | Watermarked full file | Full-length, real audio, just lower bitrate/quality — not watermarked | Watermarked full file |
| **Is the preview technically blocked from use?** | Yes, watermark + DRM tooling | No — relies on terms of use only, not a technical block | Yes, watermark |
| **What triggers the "real" license** | A structured "license out" step: create project, enter end client/usage, pay, then download clean file | Add to cart, pick a Standard License (or request Custom), pay, invoice issued | Just downloading while subscription is active — no separate step |
| **Where the license record lives** | Account → Licenses tab, or emailed order confirmation link | Invoice (becomes part of the binding contract itself) | Account → Downloads → "Song License" button generates a PDF certificate on demand |
| **Visible ID on the license doc** | No visible catalog/license ID found in public docs | **Order ID** (support-traceable transaction number) | **License number** printed at the top of the certificate PDF |
| **Instant Content ID clearance branding** | **SyncID** (subscription + linked YouTube channel required) | **TrackID** (Track Club subscription only, thin public documentation) | **Clearlist** (channel/video registration, not fully automatic) |
| **Does license persist after cancellation?** | Tied to the specific paid license, not to subscription status | Tied to the specific paid license, not to subscription status | Yes for anything published while subscribed ("perpetual coverage for published content") |

---

## 4. Pattern this reveals: the industry's "___ID" naming is about instant clearance, not file/license identifiers

Looking at all three side by side answers the ambiguity flagged in the last research file. **SyncID (Musicbed) and TrackID (Marmoset/Track Club) are the same category of thing**: a proprietary, subscription-gated, real-time system that checks "is this channel/video covered by an active license" and auto-releases YouTube Content ID claims. Artlist does the same job under a different, less automated name (Clearlist). None of the three use "___ID" to mean a static identifier stamped on a track or a license record, contrary to what the phrase might suggest at first glance. That confirms the earlier finding: there is no evidence any of these platforms embed a verifiable, unique ID directly into the delivered audio file itself, they rely on account records (Licenses tab, certificates, invoices) as the source of truth, not the file.

That's still the opportunity for Funūn (see prior research file, Section 4A): embedding a Funūn license ID directly into the delivered file's own metadata would be a genuine differentiator none of the three competitors appear to do.

---

## 5. Which model fits Funūn's actual business model

This matters more than it might look. **Funūn's scope for this planning cycle is sync-licensing-only, no subscription revenue** (per the founding brief). That means the Musicbed and Marmoset a la carte model, structured per-transaction licensing with a project/end-client/usage form, an invoice-or-license-record as the contract, and a clean file released only after that record exists, is the directly relevant pattern to study and improve on.

Artlist's blanket-subscription "download equals license" model is architecturally interesting but doesn't map onto Funūn's current business model at all, since there's no subscription tier to tie a blanket grant to. If subscription revenue is ever revisited down the line, Artlist's "perpetual coverage for published content" framing is the cleanest precedent to borrow language from, but that's explicitly out of scope for now.

**Practical implication for the buyer flow spec:** model Funūn's "license out" step on the Musicbed/Marmoset pattern (project name, end client, usage/territory/term captured before or at payment, a real invoice/license record generated, clean file released only after), not on Artlist's frictionless blanket-download pattern. This also lines up with the founding thesis, "most sync deals die in friction, not taste," since a structured but fast license-out flow (Musicbed/Marmoset) is what actually produces defensible documentation, which is the whole point of Rights & Registration Rails, while a blanket-download model produces speed but weaker per-deal documentation.

---

## Sources

- [Marmoset Terms and Conditions](https://www.marmosetmusic.com/legal)
- [Marmoset Journal — 3 Simple Steps to Download Temp Tracks](https://www.marmosetmusic.com/journal/3-simple-steps-to-download-temp-tracks-and-get-you-on-your-way/)
- [Marmoset License Agreement](https://www.marmosetmusic.com/license-agreement)
- [Marmoset Journal — Music Licensing 101](https://www.marmosetmusic.com/journal/music-licensing-101/)
- [Music In Africa — Marmoset launches Track Club (TrackID, MixLab)](https://www.musicinafrica.net/magazine/marmoset-launches-new-music-licensing-app-track-club)
- [Artlist — Can I get previews of music or footage?](https://help.artlist.io/hc/en-us/articles/7757521115165-Can-I-get-previews-of-music-or-footage)
- [Artlist — A free Trial explained](https://help.artlist.io/hc/en-us/articles/29489082949405-A-free-Trial-explained)
- [Artlist — Get to Know Artlist's License Model](https://artlist.io/help-center/privacy-terms/artlist-license/)
- [Artlist — Understanding Artlist's license](https://help.artlist.io/hc/en-us/articles/29490991524253-Understanding-Artlist-s-license)
- [Artlist — Where do I download the license for use?](https://artlist.freshdesk.com/support/solutions/articles/43000669871-where-do-i-download-the-license-for-use-)
- [Artlist — Access your downloads](https://help.artlist.io/hc/en-us/articles/7815341558301-Access-your-downloads)
- [The Complete Guide to Artlist 2026 (third-party field guide, Clearlist workflow detail)](https://www.lordofthewix.com/post/the-complete-guide-to-artlist-2026-music-sfx-footage-templates-ai-tools-licensing-clearlist)
- [How to Use Artlist — Step by Step Guide for Creators](https://artlistio.com/how-to-use-artlist/)
- [How To Use Artlist For Copyright Music (2026 Guide)](https://www.youtube.com/watch?v=HcYxVPzg2jQ)
- [How to Copyright Clear Client Videos with Artlist (license number on certificate)](https://www.youtube.com/watch?v=GTDqsrGnVgw)
