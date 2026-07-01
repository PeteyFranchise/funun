---
quick_id: 260628-2n7
slug: add-legal-identity-contact-info-and-indu
status: complete
completed_at: 2026-06-28
---

## Delivered
- Migration 021: legal name fields, contact_phone, mailing_address, industry_roles[] on artist_profiles
- lib/industry-roles.ts: 23 roles across 4 groups with slug validation
- Settings page: Legal Identity, Industry Roles (pill toggles), and Contact sections
- Artist Name relabeled as optional stage name
- API sanitizes industry_roles against known slugs

## Commit
15badb8
