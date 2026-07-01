---
quick_id: 260627-rxr
slug: split-collaborator-name-into-first-middl
status: complete
completed_at: 2026-06-27
---

# Summary

Split collaborator name into first/middle/last fields with legal name guidance and required minimums.

## Delivered
- Migration 019 applied to production Supabase
- `first_name`, `middle_name`, `last_name`, `name_suffix` columns on `collaborators`
- `assembleDisplayName()` helper with legacy fallback
- CollaboratorForm: structured name fields, required minimums (first, last, email, phone), legal name callout, Funūn role clarification, suffix toggle
- CollaboratorCard + CollaboratorPicker updated to use assembled name

## Commit
19f3886
