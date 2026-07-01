---
quick_id: 260628-2n7
slug: add-legal-identity-contact-info-and-indu
status: in_progress
---

# Legal identity, contact info, and industry roles on Settings

## Tasks
1. Migration 021 — add legal name fields, contact_phone, mailing_address, industry_roles[] to artist_profiles
2. lib/industry-roles.ts — define grouped role constants
3. types/index.ts — add new fields to ArtistProfile
4. app/api/profile/route.ts — add to EDITABLE_FIELDS + sanitize
5. components/profile/ProfileForm.tsx — three new sections: Legal Identity, Contact, Industry Roles
